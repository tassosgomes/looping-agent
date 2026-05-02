import { lstat, mkdtemp, readlink, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { runSetup } from "../../src/commands/setup.js";
import { EXIT_NO_RUNTIME } from "../../src/exit-codes.js";
import { EXPECTED_SKILLS } from "../../src/skills-list.js";
import { readState } from "../../src/state-manager.js";

import { MOCK_RUNTIME, SOURCE_SKILLS_DIR, createOutputCapture } from "./test-support.js";

describe("runSetup", () => {
  it("installs all skills into an empty project and runs the MCP smoke test", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "looping-agent-setup-"));
    const stdout = createOutputCapture();
    const stderr = createOutputCapture();

    const exitCode = await runSetup({
      projectDir,
      sourceDir: SOURCE_SKILLS_DIR,
      stdout: stdout.stream,
      stderr: stderr.stream,
      detectRuntime: vi.fn().mockResolvedValue(MOCK_RUNTIME)
    });

    expect(exitCode).toBe(0);
    expect(stderr.text()).toBe("");
    expect(await readdir(path.join(projectDir, ".agents", "skills"))).toHaveLength(EXPECTED_SKILLS.length);
    expect((await lstat(path.join(projectDir, ".claude", "skills"))).isSymbolicLink()).toBe(true);
    await expect(readlink(path.join(projectDir, ".claude", "skills"))).resolves.toBe("../.agents/skills");
    await expect(readState(projectDir)).resolves.not.toBeNull();
    expect(stdout.text()).toContain("Setup completed");
    expect(stdout.text()).toContain("MCP smoke");
    expect(stdout.text()).toContain("Skills dir");
    expect(stdout.text()).toContain("Claude compat");
  });

  it("reports the second setup run as already up to date", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "looping-agent-setup-"));

    await runSetup({
      projectDir,
      sourceDir: SOURCE_SKILLS_DIR,
      stdout: createOutputCapture().stream,
      stderr: createOutputCapture().stream,
      detectRuntime: vi.fn().mockResolvedValue(MOCK_RUNTIME)
    });

    const stdout = createOutputCapture();
    const stderr = createOutputCapture();
    const exitCode = await runSetup({
      projectDir,
      sourceDir: SOURCE_SKILLS_DIR,
      stdout: stdout.stream,
      stderr: stderr.stream,
      detectRuntime: vi.fn().mockResolvedValue(MOCK_RUNTIME)
    });

    expect(exitCode).toBe(0);
    expect(stderr.text()).toBe("");
    expect(stdout.text()).toContain("Setup already up to date");
    expect(stdout.text()).toContain(`unchanged=${EXPECTED_SKILLS.length}`);
  });

  it("returns exit 1 with an actionable message when no runtime is available", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "looping-agent-setup-"));
    const stdout = createOutputCapture();
    const stderr = createOutputCapture();

    const exitCode = await runSetup({
      projectDir,
      sourceDir: SOURCE_SKILLS_DIR,
      stdout: stdout.stream,
      stderr: stderr.stream,
      detectRuntime: vi.fn().mockRejectedValue(new Error(
        "No ACP runtime was detected on PATH. Expected one of: claude-agent-acp, codex-acp, copilot --acp."
      ))
    });

    expect(exitCode).toBe(EXIT_NO_RUNTIME);
    expect(stdout.text()).toBe("");
    expect(stderr.text()).toContain("No ACP runtime was detected on PATH");
    await expect(readState(projectDir)).resolves.toBeNull();
  });
});
