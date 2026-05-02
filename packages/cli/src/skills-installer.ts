import { copyFile, lstat, mkdir, readFile, readdir, readlink, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  BaseSkillFrontmatter,
  PhaseSkillFrontmatter,
  type InstallStateT,
  type PhaseSkillFrontmatterT
} from "@looping-agent/schemas";
import { ZodError } from "zod";

import { normalizedSha256 } from "./hash-utils.js";
import { EXPECTED_SKILLS, type ExpectedSkillName } from "./skills-list.js";
import { readState, writeState } from "./state-manager.js";

const PRODUCT_VERSION = "1.0.0";

export interface InstallFailure {
  skill: string;
  reason: string;
}

export type BackupStrategy = "always" | "state-mismatch";

export interface InstallReport {
  copied: string[];
  unchanged: string[];
  backedUp: string[];
  failed: InstallFailure[];
}

export interface InstallAllOptions {
  sourceDir: string;
  projectDir: string;
  force?: boolean;
  backupStrategy?: BackupStrategy;
}

interface ParsedSkill {
  name: ExpectedSkillName;
  sourceDir: string;
  sourceSkillPath: string;
  targetDir: string;
  targetSkillPath: string;
  content: string;
  hash: string;
}

interface FrontmatterParseResult {
  frontmatter: Record<string, string | string[]>;
}

export async function installAll(options: InstallAllOptions): Promise<InstallReport> {
  const { sourceDir, projectDir, force = false, backupStrategy = "always" } = options;
  const currentState = await readState(projectDir);
  const report: InstallReport = {
    copied: [],
    unchanged: [],
    backedUp: [],
    failed: []
  };
  const skillsInstallDir = await prepareSkillsLayout(projectDir);
  const sourceSkills = await loadSourceSkills(sourceDir, skillsInstallDir, report);

  const nextState: InstallStateT = {
    looping_agent_version: PRODUCT_VERSION,
    installed_at: new Date().toISOString(),
    skills: currentState?.skills ?? {}
  };

  for (const skill of sourceSkills) {
    try {
      const destinationExists = await pathExists(skill.targetSkillPath);
      const installedHash = destinationExists
        ? normalizedSha256(await readFile(skill.targetSkillPath, "utf8"))
        : null;
      const recordedHash = currentState?.skills[skill.name]?.hash ?? null;

      if (!force && destinationExists && installedHash === skill.hash) {
        report.unchanged.push(skill.name);
        nextState.skills[skill.name] = {
          hash: skill.hash,
          installed_version: PRODUCT_VERSION
        };
        continue;
      }

      if (destinationExists && shouldBackupExistingSkill({
        backupStrategy,
        installedHash,
        recordedHash,
        sourceHash: skill.hash
      })) {
        await backupSkillDirectory(skill.targetDir);
        report.backedUp.push(skill.name);
      }

      await copyDirectory(skill.sourceDir, skill.targetDir);
      report.copied.push(skill.name);
      nextState.skills[skill.name] = {
        hash: skill.hash,
        installed_version: PRODUCT_VERSION
      };
    } catch (error) {
      report.failed.push({
        skill: skill.name,
        reason: error instanceof Error ? error.message : "Unknown install error"
      });
    }
  }

  await writeState(projectDir, nextState);
  await ensureClaudeSkillsCompat(projectDir, skillsInstallDir);

  return report;
}

interface BackupExistingSkillOptions {
  backupStrategy: BackupStrategy;
  installedHash: string | null;
  recordedHash: string | null;
  sourceHash: string;
}

function shouldBackupExistingSkill(options: BackupExistingSkillOptions): boolean {
  if (options.installedHash === null) {
    return false;
  }

  if (options.backupStrategy === "always") {
    return true;
  }

  if (options.recordedHash === null) {
    return options.installedHash !== options.sourceHash;
  }

  return options.installedHash !== options.recordedHash;
}

async function loadSourceSkills(
  sourceDir: string,
  skillsInstallDir: string,
  report: InstallReport
): Promise<ParsedSkill[]> {
  const loadedSkills: ParsedSkill[] = [];

  for (const skillName of EXPECTED_SKILLS) {
    const skillSourceDir = path.join(sourceDir, skillName);
    const sourceSkillPath = path.join(skillSourceDir, "SKILL.md");
    const content = await readFile(sourceSkillPath, "utf8");

    try {
      validateSkillFrontmatter(content, skillName);
    } catch (error) {
      report.failed.push({
        skill: skillName,
        reason: error instanceof Error ? error.message : "Unknown frontmatter validation error"
      });
      continue;
    }

    loadedSkills.push({
      name: skillName,
      sourceDir: skillSourceDir,
      sourceSkillPath,
      targetDir: path.join(skillsInstallDir, skillName),
      targetSkillPath: path.join(skillsInstallDir, skillName, "SKILL.md"),
      content,
      hash: normalizedSha256(content)
    });
  }

  return loadedSkills;
}

async function prepareSkillsLayout(projectDir: string): Promise<string> {
  const agentsDir = path.join(projectDir, ".agents");
  const agentsSkillsDir = path.join(agentsDir, "skills");
  const claudeSkillsDir = path.join(projectDir, ".claude", "skills");

  const agentsEntry = await readPathEntry(agentsSkillsDir);
  const claudeEntry = await readPathEntry(claudeSkillsDir);

  if (agentsEntry?.type === "other") {
    throw new Error(`Cannot prepare skills layout because ${agentsSkillsDir} exists and is not a directory or symlink.`);
  }

  if (agentsEntry === null) {
    if (claudeEntry?.type === "directory") {
      await mkdir(agentsDir, { recursive: true });
      await rename(claudeSkillsDir, agentsSkillsDir);
    } else if (claudeEntry?.type === "symlink") {
      const desiredTarget = resolveLinkTarget(path.dirname(claudeSkillsDir), claudeEntry.target);
      if (desiredTarget !== agentsSkillsDir) {
        throw new Error(
          `Cannot prepare skills layout because ${claudeSkillsDir} is a symlink to ${claudeEntry.target}. ` +
          `Expected ${relativeLinkTarget(path.dirname(claudeSkillsDir), agentsSkillsDir)} or remove the conflicting link.`
        );
      }

      await mkdir(agentsSkillsDir, { recursive: true });
    } else if (claudeEntry !== null) {
      throw new Error(`Cannot prepare skills layout because ${claudeSkillsDir} exists and is not a directory.`);
    } else {
      await mkdir(agentsSkillsDir, { recursive: true });
    }
  }

  await ensureClaudeSkillsCompat(projectDir, agentsSkillsDir);
  return agentsSkillsDir;
}

async function ensureClaudeSkillsCompat(projectDir: string, skillsInstallDir: string): Promise<void> {
  const claudeDir = path.join(projectDir, ".claude");
  const claudeSkillsDir = path.join(claudeDir, "skills");
  const existing = await readPathEntry(claudeSkillsDir);

  if (existing?.type === "directory") {
    const samePath = normalizePath(claudeSkillsDir) === normalizePath(skillsInstallDir);
    if (!samePath) {
      throw new Error(
        `Cannot link ${claudeSkillsDir} to ${skillsInstallDir} because ${claudeSkillsDir} already exists as a directory. ` +
        "Reconcile the existing Claude skills directory manually."
      );
    }

    return;
  }

  const desiredTarget = relativeLinkTarget(claudeDir, skillsInstallDir);

  if (existing?.type === "symlink") {
    const currentTarget = resolveLinkTarget(claudeDir, existing.target);
    if (currentTarget !== skillsInstallDir) {
      throw new Error(
        `Cannot link ${claudeSkillsDir} to ${skillsInstallDir} because it already points to ${existing.target}. ` +
        "Reconcile the existing Claude skills symlink manually."
      );
    }

    return;
  }

  if (existing !== null) {
    throw new Error(
      `Cannot link ${claudeSkillsDir} to ${skillsInstallDir} because the path already exists and is not a directory or symlink.`
    );
  }

  await mkdir(claudeDir, { recursive: true });
  await symlink(desiredTarget, claudeSkillsDir, "dir");
}

interface PathEntry {
  type: "directory" | "symlink" | "other";
  target: string | null;
}

async function readPathEntry(targetPath: string): Promise<PathEntry | null> {
  try {
    const details = await lstat(targetPath);
    if (details.isDirectory()) {
      return { type: "directory", target: null };
    }

    if (details.isSymbolicLink()) {
      return { type: "symlink", target: await readlink(targetPath) };
    }

    return { type: "other", target: null };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function relativeLinkTarget(fromDir: string, toPath: string): string {
  return path.relative(fromDir, toPath) || ".";
}

function resolveLinkTarget(fromDir: string, target: string | null): string {
  if (!target) {
    return "";
  }

  return normalizePath(path.resolve(fromDir, target));
}

function normalizePath(targetPath: string): string {
  return path.normalize(targetPath);
}

function validateSkillFrontmatter(content: string, expectedName: ExpectedSkillName): void {
  const { frontmatter } = parseFrontmatter(content);
  const pipelineStage = readPipelineStage(frontmatter);

  if (isPhaseSkill(pipelineStage)) {
    const phaseParsed = PhaseSkillFrontmatter.safeParse(frontmatter);
    if (!phaseParsed.success) {
      throw new Error(formatZodError(phaseParsed.error));
    }

    validatePhaseSkill(phaseParsed.data, expectedName);
    return;
  }

  const parsed = BaseSkillFrontmatter.safeParse(frontmatter);
  if (!parsed.success) {
    throw new Error(formatZodError(parsed.error));
  }

  if (parsed.data.name !== expectedName) {
    throw new Error(`Skill name mismatch: expected ${expectedName}, received ${parsed.data.name}`);
  }
}

function validatePhaseSkill(frontmatter: PhaseSkillFrontmatterT, expectedName: ExpectedSkillName): void {
  if (frontmatter.name !== expectedName) {
    throw new Error(`Phase skill name mismatch: expected ${expectedName}, received ${frontmatter.name}`);
  }
}

function isPhaseSkill(pipelineStage: string): pipelineStage is PhaseSkillFrontmatterT["pipeline_stage"] {
  return pipelineStage === "implementer" || pipelineStage === "reviewer" || pipelineStage === "finalizer";
}

function readPipelineStage(frontmatter: Record<string, string | string[]>): string {
  const pipelineStage = frontmatter.pipeline_stage;
  if (typeof pipelineStage !== "string") {
    throw new Error("pipeline_stage: Required");
  }

  return pipelineStage;
}

function parseFrontmatter(content: string): FrontmatterParseResult {
  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    throw new Error("Skill file is missing frontmatter opening delimiter");
  }

  const closingIndex = normalized.indexOf("\n---\n", 4);
  if (closingIndex === -1) {
    throw new Error("Skill file is missing frontmatter closing delimiter");
  }

  const yamlBlock = normalized.slice(4, closingIndex);
  return { frontmatter: parseSimpleYaml(yamlBlock) };
}

function parseSimpleYaml(yamlBlock: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  const lines = yamlBlock.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || line.trim() === "") {
      continue;
    }

    const match = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (!match) {
      throw new Error(`Unsupported frontmatter line: ${line}`);
    }

    const key = match[1];
    const rawValue = match[2];
    if (key === undefined || rawValue === undefined) {
      throw new Error(`Unsupported frontmatter line: ${line}`);
    }

    if (rawValue === ">" || rawValue === "|") {
      const collected: string[] = [];
      let nextIndex = index + 1;

      while (nextIndex < lines.length) {
        const candidate = lines[nextIndex];
        if (candidate === undefined) {
          break;
        }

        if (candidate.startsWith(" ") || candidate.startsWith("\t")) {
          collected.push(candidate.trim());
          nextIndex += 1;
          continue;
        }

        break;
      }

      result[key] = collected.join(" ").trim();
      index = nextIndex - 1;
      continue;
    }

    if (rawValue === "") {
      const collected: string[] = [];
      let nextIndex = index + 1;

      while (nextIndex < lines.length) {
        const candidate = lines[nextIndex];
        if (candidate === undefined) {
          break;
        }

        const listMatch = /^\s*-\s*(.*)$/.exec(candidate);
        if (!listMatch) {
          break;
        }

        const entry = listMatch[1];
        if (entry === undefined) {
          break;
        }

        collected.push(unquote(entry.trim()));
        nextIndex += 1;
      }

      result[key] = collected;
      index = nextIndex - 1;
      continue;
    }

    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      result[key] = parseInlineArray(rawValue);
      continue;
    }

    result[key] = unquote(rawValue.trim());
  }

  return result;
}

function parseInlineArray(rawValue: string): string[] {
  const inner = rawValue.slice(1, -1).trim();
  if (inner === "") {
    return [];
  }

  const entries = inner.split(",");
  return entries.map((entry) => unquote(entry.trim()));
}

function unquote(value: string): string {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
}

function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const issuePath = issue.path.length > 0 ? issue.path.join(".") : "frontmatter";
      return `${issuePath}: ${issue.message}`;
    })
    .join("; ");
}

async function backupSkillDirectory(skillTargetDir: string): Promise<void> {
  const backupDir = `${skillTargetDir}.bak`;
  await rm(backupDir, { recursive: true, force: true });
  await rename(skillTargetDir, backupDir);
}

async function copyDirectory(sourceDir: string, targetDir: string): Promise<void> {
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });

  const entries = await readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
      continue;
    }

    if (entry.isSymbolicLink()) {
      throw new Error(`Unsupported symbolic link in skill payload: ${sourcePath}`);
    }

    await mkdir(path.dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);

    if (entry.name === "SKILL.md") {
      const content = await readFile(targetPath, "utf8");
      await writeFile(targetPath, content, "utf8");
    }
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}
