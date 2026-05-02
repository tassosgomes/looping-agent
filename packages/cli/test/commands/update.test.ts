import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { runUpdate } from "../../src/commands/update.js";

import { MOCK_RUNTIME, SOURCE_SKILLS_DIR, createInstalledProject, createOutputCapture } from "./test-support.js";

describe("runUpdate", () => {
  it("is a no-op when installed hashes already match the bundled skills", async () => {
    const projectDir = await createInstalledProject();
    const stdout = createOutputCapture();
    const stderr = createOutputCapture();

    const exitCode = await runUpdate({
      projectDir,
      sourceDir: SOURCE_SKILLS_DIR,
      stdout: stdout.stream,
      stderr: stderr.stream,
      detectRuntime: vi.fn().mockResolvedValue(MOCK_RUNTIME)
    });

    expect(exitCode).toBe(0);
    expect(stderr.text()).toBe("");
    expect(stdout.text()).toContain("Update found no changes");
    await expect(stat(path.join(projectDir, ".agents", "skills", "flow-prd-creator.bak"))).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  it("creates a .bak directory before overwriting locally modified skills", async () => {
    const projectDir = await createInstalledProject();
    const installedSkillPath = path.join(projectDir, ".agents", "skills", "flow-prd-creator", "SKILL.md");
    const backupSkillPath = path.join(projectDir, ".agents", "skills", "flow-prd-creator.bak", "SKILL.md");
    const stdout = createOutputCapture();
    const stderr = createOutputCapture();

    await writeFile(
      installedSkillPath,
      "---\nname: flow-prd-creator\ndescription: locally changed\npipeline_stage: prd\nconsumed_by: [planning]\nrequires: []\nproduces: []\n---\n\nchanged\n",
      "utf8"
    );

    const exitCode = await runUpdate({
      projectDir,
      sourceDir: SOURCE_SKILLS_DIR,
      stdout: stdout.stream,
      stderr: stderr.stream,
      detectRuntime: vi.fn().mockResolvedValue(MOCK_RUNTIME)
    });

    expect(exitCode).toBe(0);
    expect(stderr.text()).toBe("");
    await expect(readFile(backupSkillPath, "utf8")).resolves.toContain("description: locally changed");
    await expect(readFile(installedSkillPath, "utf8")).resolves.not.toContain("description: locally changed");
    expect(stdout.text()).toContain("Backups pending review");
    expect(stdout.text()).toContain("Claude compat");
  });
});
