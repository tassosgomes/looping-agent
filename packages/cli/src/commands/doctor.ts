import path from "node:path";
import { readFile } from "node:fs/promises";

import { detectRuntime } from "@looping-agent/orchestrator";

import { normalizedSha256 } from "../hash-utils.js";
import { EXPECTED_SKILLS } from "../skills-list.js";
import { getStateFilePath, readState } from "../state-manager.js";
import { EXIT_NO_RUNTIME } from "../exit-codes.js";

import {
  colorsForStream,
  describeRuntime,
  errorMessage,
  getClaudeSkillsCompatPath,
  getSkillInstallPath,
  getSkillsInstallDir,
  listPendingBackups,
  loadExpectedSkillHashes,
  pathExists,
  readSymlinkTarget,
  resolveCommandContext,
  runMcpSmokeTest,
  writeLine,
  type CommandRuntimeOptions,
  type McpSmokeTestResult
} from "./shared.js";

interface DoctorCheck {
  label: string;
  ok: boolean;
  detail: string;
}

export interface DoctorCommandOptions extends CommandRuntimeOptions {
  detectRuntime?: typeof detectRuntime;
  readState?: typeof readState;
  smokeTestMcpServer?: () => Promise<McpSmokeTestResult>;
  nodeVersion?: string;
}

export async function runDoctor(options: DoctorCommandOptions = {}): Promise<number> {
  const { projectDir, sourceDir, stdout, stderr } = resolveCommandContext(options);
  const colors = colorsForStream(options, stdout);
  const detectRuntimeFn = options.detectRuntime ?? detectRuntime;
  const readStateFn = options.readState ?? readState;
  const smokeTestMcpServer = options.smokeTestMcpServer ?? runMcpSmokeTest;
  const checks: DoctorCheck[] = [];

  checks.push(checkNodeVersion(options.nodeVersion ?? process.versions.node));

  try {
    const runtime = await detectRuntimeFn();
    checks.push({
      label: "Runtime",
      ok: true,
      detail: describeRuntime(runtime)
    });
  } catch (error) {
    checks.push({
      label: "Runtime",
      ok: false,
      detail: errorMessage(error)
    });
  }

  let expectedHashes: Record<(typeof EXPECTED_SKILLS)[number], string> | null = null;
  try {
    expectedHashes = await loadExpectedSkillHashes(sourceDir);
  } catch (error) {
    checks.push({
      label: "Source skills",
      ok: false,
      detail: `Could not read bundled skills from ${sourceDir}: ${errorMessage(error)}`
    });
  }

  let state = null;
  let stateReadError: string | null = null;
  try {
    state = await readStateFn(projectDir);
  } catch (error) {
    stateReadError = errorMessage(error);
  }

  checks.push(buildStateCheck(projectDir, expectedHashes, state, stateReadError));

  if (expectedHashes === null) {
    checks.push({
      label: "Skills",
      ok: false,
      detail: `Bundled skills are unavailable in ${sourceDir}.`
    });
  } else {
    checks.push(await buildSkillsCheck(projectDir, expectedHashes));
    checks.push(await buildClaudeCompatCheck(projectDir));
  }

  const pendingBackups = await listPendingBackups(projectDir);
  checks.push({
    label: "Pending backups",
    ok: pendingBackups.length === 0,
    detail: pendingBackups.length === 0
      ? "No .bak directories pending review."
      : `${pendingBackups.join(", ")} in ${getSkillsInstallDir(projectDir)}. Review them and remove the stale backups.`
  });

  try {
    const smoke = await smokeTestMcpServer();
    checks.push({
      label: "MCP smoke",
      ok: true,
      detail: `ok (${smoke.toolNames.join(", ")})`
    });
  } catch (error) {
    checks.push({
      label: "MCP smoke",
      ok: false,
      detail: errorMessage(error)
    });
  }

  for (const check of checks) {
    writeLine(stdout, formatCheck(check, colors));
  }

  const failures = checks.filter((check) => !check.ok);
  if (failures.length > 0) {
    writeLine(stderr, colors.error(`Doctor found ${String(failures.length)} issue(s) in ${projectDir}.`));
    writeLine(stderr, `${colors.muted("Suggested commands")} looping-agent setup | looping-agent update --force`);
    return EXIT_NO_RUNTIME;
  }

  writeLine(stdout, `${colors.success("Doctor completed")} ${projectDir}`);
  return 0;
}

function checkNodeVersion(nodeVersion: string): DoctorCheck {
  const [majorPart] = nodeVersion.split(".", 1);
  const major = Number.parseInt(majorPart ?? "", 10);

  if (!Number.isNaN(major) && major >= 20) {
    return {
      label: "Node",
      ok: true,
      detail: `${nodeVersion} (supported)`
    };
  }

  return {
    label: "Node",
    ok: false,
    detail: `${nodeVersion} detected. Node >= 20 is required.`
  };
}

function buildStateCheck(
  projectDir: string,
  expectedHashes: Record<(typeof EXPECTED_SKILLS)[number], string> | null,
  state: Awaited<ReturnType<typeof readState>>,
  stateReadError: string | null
): DoctorCheck {
  const statePath = getStateFilePath(projectDir);

  if (stateReadError !== null) {
    return {
      label: "State",
      ok: false,
      detail: `Could not read ${statePath}: ${stateReadError}`
    };
  }

  if (state === null) {
    return {
      label: "State",
      ok: false,
      detail: `Missing ${statePath}. Run looping-agent setup in ${projectDir}.`
    };
  }

  if (expectedHashes === null) {
    return {
      label: "State",
      ok: false,
      detail: `State exists at ${statePath}, but bundled skills could not be read.`
    };
  }

  const missingEntries: string[] = [];
  const staleEntries: string[] = [];

  for (const skillName of EXPECTED_SKILLS) {
    const stateEntry = state.skills[skillName];
    if (stateEntry === undefined) {
      missingEntries.push(skillName);
      continue;
    }

    if (stateEntry.hash !== expectedHashes[skillName]) {
      staleEntries.push(skillName);
    }
  }

  if (missingEntries.length === 0 && staleEntries.length === 0) {
    return {
      label: "State",
      ok: true,
      detail: `${statePath} tracks ${String(EXPECTED_SKILLS.length)} skills.`
    };
  }

  const details: string[] = [];
  if (missingEntries.length > 0) {
    details.push(`missing entries: ${missingEntries.join(", ")}`);
  }
  if (staleEntries.length > 0) {
    details.push(`stale hashes: ${staleEntries.join(", ")}`);
  }

  return {
    label: "State",
    ok: false,
    detail: `${statePath} is inconsistent (${details.join("; ")}). Rerun looping-agent update --force.`
  };
}

async function buildSkillsCheck(
  projectDir: string,
  expectedHashes: Record<(typeof EXPECTED_SKILLS)[number], string>
): Promise<DoctorCheck> {
  const missingSkills: string[] = [];
  const mismatchedSkills: string[] = [];

  for (const skillName of EXPECTED_SKILLS) {
    const installedSkillPath = getSkillInstallPath(projectDir, skillName);
    if (!await pathExists(installedSkillPath)) {
      missingSkills.push(skillName);
      continue;
    }

    const installedHash = normalizedSha256(await readFile(installedSkillPath, "utf8"));
    if (installedHash !== expectedHashes[skillName]) {
      mismatchedSkills.push(skillName);
    }
  }

  if (missingSkills.length === 0 && mismatchedSkills.length === 0) {
    return {
      label: "Skills",
      ok: true,
      detail: `${String(EXPECTED_SKILLS.length)}/${String(EXPECTED_SKILLS.length)} present and matching ${getSkillsInstallDir(projectDir)}.`
    };
  }

  const details: string[] = [];
  if (missingSkills.length > 0) {
    details.push(`missing: ${missingSkills.join(", ")}`);
  }
  if (mismatchedSkills.length > 0) {
    details.push(`hash mismatch: ${mismatchedSkills.join(", ")}`);
  }

  return {
    label: "Skills",
    ok: false,
    detail: `${details.join("; ")}. Rerun looping-agent setup or looping-agent update --force in ${projectDir}.`
  };
}

async function buildClaudeCompatCheck(projectDir: string): Promise<DoctorCheck> {
  const compatPath = getClaudeSkillsCompatPath(projectDir);
  const target = await readSymlinkTarget(compatPath);

  if (target === null) {
    return {
      label: "Claude compat",
      ok: false,
      detail: `Missing symlink ${compatPath}. Rerun looping-agent setup or looping-agent update --force in ${projectDir}.`
    };
  }

  const resolvedTarget = path.resolve(path.dirname(compatPath), target);
  const expectedTarget = path.resolve(getSkillsInstallDir(projectDir));

  if (resolvedTarget !== expectedTarget) {
    return {
      label: "Claude compat",
      ok: false,
      detail: `${compatPath} points to ${target}, expected ${path.relative(path.dirname(compatPath), expectedTarget) || "."}.`
    };
  }

  return {
    label: "Claude compat",
    ok: true,
    detail: `${compatPath} -> ${target}`
  };
}

function formatCheck(check: DoctorCheck, colors: ReturnType<typeof colorsForStream>): string {
  const badge = check.ok ? colors.success("OK") : colors.error("FAIL");
  return `${badge} ${check.label}: ${check.detail}`;
}
