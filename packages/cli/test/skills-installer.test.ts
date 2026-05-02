import { lstat, mkdir, mkdtemp, readFile, readlink, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { installAll, readState, EXPECTED_SKILLS } from "../src/index.js";

// Resolve relative to this file so the tests work on any machine and on CI.
// File location: packages/cli/test/skills-installer.test.ts → up 3 = repo root.
const WORKSPACE_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const SOURCE_SKILLS_DIR = path.join(WORKSPACE_ROOT, "skills");

describe("skills-installer", () => {
  it("copies all expected skills into an empty project", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "looping-agent-install-"));

    const report = await installAll({ sourceDir: SOURCE_SKILLS_DIR, projectDir });

    expect(report.copied).toHaveLength(EXPECTED_SKILLS.length);
    expect(report.unchanged).toEqual([]);
    expect(report.backedUp).toEqual([]);
    expect(report.failed).toEqual([]);

    const installedNames = await readdir(path.join(projectDir, ".agents", "skills"));
    expect(installedNames.sort()).toEqual([...EXPECTED_SKILLS].sort());
    expect((await lstat(path.join(projectDir, ".claude", "skills"))).isSymbolicLink()).toBe(true);
    await expect(readlink(path.join(projectDir, ".claude", "skills"))).resolves.toBe("../.agents/skills");

    const state = await readState(projectDir);
    expect(state).not.toBeNull();
    expect(Object.keys(state?.skills ?? {})).toHaveLength(EXPECTED_SKILLS.length);
  });

  it("is idempotent when the installed skill hashes match the recorded state", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "looping-agent-install-"));

    await installAll({ sourceDir: SOURCE_SKILLS_DIR, projectDir });
    const report = await installAll({ sourceDir: SOURCE_SKILLS_DIR, projectDir });

    expect(report.copied).toEqual([]);
    expect(report.unchanged).toHaveLength(EXPECTED_SKILLS.length);
    expect(report.backedUp).toEqual([]);
    expect(report.failed).toEqual([]);
  });

  it("backs up and overwrites locally modified skills", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "looping-agent-install-"));

    await installAll({ sourceDir: SOURCE_SKILLS_DIR, projectDir });

    const installedSkillPath = path.join(projectDir, ".agents", "skills", "flow-prd-creator", "SKILL.md");
    await writeFile(installedSkillPath, "---\nname: flow-prd-creator\ndescription: changed\npipeline_stage: prd\nconsumed_by: [planning]\nrequires: []\nproduces: []\n---\n\nchanged\n", "utf8");

    const report = await installAll({ sourceDir: SOURCE_SKILLS_DIR, projectDir });

    expect(report.backedUp).toContain("flow-prd-creator");
    expect(report.copied).toContain("flow-prd-creator");
    await expect(readFile(path.join(projectDir, ".agents", "skills", "flow-prd-creator.bak", "SKILL.md"), "utf8")).resolves.toContain("description: changed");
    await expect(readFile(installedSkillPath, "utf8")).resolves.not.toContain("description: changed");
  });

  it("migrates a legacy .claude/skills directory into .agents/skills when no .agents layout exists", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "looping-agent-install-"));
    const legacySkillDir = path.join(projectDir, ".claude", "skills", "custom-agent");

    await mkdir(legacySkillDir, { recursive: true });
    await writeFile(path.join(legacySkillDir, "SKILL.md"), "legacy", "utf8");

    const report = await installAll({ sourceDir: SOURCE_SKILLS_DIR, projectDir });

    expect(report.failed).toEqual([]);
    await expect(readFile(path.join(projectDir, ".agents", "skills", "custom-agent", "SKILL.md"), "utf8")).resolves.toBe("legacy");
    await expect(readlink(path.join(projectDir, ".claude", "skills"))).resolves.toBe("../.agents/skills");
  });

  it("reports invalid frontmatter as a skill failure with a readable reason", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "looping-agent-install-"));
    const sourceDir = await cloneSkillsFixture();
    const invalidSkillPath = path.join(sourceDir, "flow-prd-creator", "SKILL.md");

    await writeFile(invalidSkillPath, "---\nname: flow-prd-creator\ndescription: broken\npipeline_stage: prd\nconsumed_by: [planning]\nrequires: []\nproduces: []\ncompletion_tool: report_implementer_result\n---\n", "utf8");

    const report = await installAll({ sourceDir, projectDir });

    expect(report.failed).toContainEqual(expect.objectContaining({
      skill: "flow-prd-creator",
      reason: expect.stringContaining("frontmatter")
    }));
    expect(report.copied).toHaveLength(EXPECTED_SKILLS.length - 1);
  });
});

async function cloneSkillsFixture(): Promise<string> {
  const sourceDir = await mkdtemp(path.join(os.tmpdir(), "looping-agent-skills-src-"));
  const skillsDir = await readdir(SOURCE_SKILLS_DIR);

  for (const skillName of skillsDir) {
    const originalDir = path.join(SOURCE_SKILLS_DIR, skillName);
    const targetDir = path.join(sourceDir, skillName);
    await copyDirectory(originalDir, targetDir);
  }

  return sourceDir;
}

async function copyDirectory(sourceDir: string, targetDir: string): Promise<void> {
  const { mkdir, copyFile, readdir } = await import("node:fs/promises");
  const dirEntries = await readdir(sourceDir, { withFileTypes: true });

  await mkdir(targetDir, { recursive: true });
  for (const entry of dirEntries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
      continue;
    }

    await copyFile(sourcePath, targetPath);
  }
}
