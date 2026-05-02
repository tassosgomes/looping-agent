import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { runDoctor } from "../../src/commands/doctor.js";
import { EXIT_NO_RUNTIME } from "../../src/exit-codes.js";

import { MOCK_RUNTIME, SOURCE_SKILLS_DIR, createInstalledProject, createOutputCapture } from "./test-support.js";

describe("runDoctor", () => {
  it("returns exit 0 when node, runtime, skills, state, and MCP smoke test are healthy", async () => {
    const projectDir = await createInstalledProject();
    const stdout = createOutputCapture();
    const stderr = createOutputCapture();

    const exitCode = await runDoctor({
      projectDir,
      sourceDir: SOURCE_SKILLS_DIR,
      stdout: stdout.stream,
      stderr: stderr.stream,
      detectRuntime: vi.fn().mockResolvedValue(MOCK_RUNTIME)
    });

    expect(exitCode).toBe(0);
    expect(stderr.text()).toBe("");
    expect(stdout.text()).toContain("OK Node:");
    expect(stdout.text()).toContain("OK Runtime:");
    expect(stdout.text()).toContain("OK Skills:");
    expect(stdout.text()).toContain("OK Claude compat:");
    expect(stdout.text()).toContain("OK MCP smoke:");
    expect(stdout.text()).toContain("Doctor completed");
  });

  it("reports a missing skill as a failing diagnostic", async () => {
    const projectDir = await createInstalledProject();
    const stdout = createOutputCapture();
    const stderr = createOutputCapture();

    await rm(path.join(projectDir, ".agents", "skills", "flow-prd-creator"), {
      recursive: true,
      force: true
    });

    const exitCode = await runDoctor({
      projectDir,
      sourceDir: SOURCE_SKILLS_DIR,
      stdout: stdout.stream,
      stderr: stderr.stream,
      detectRuntime: vi.fn().mockResolvedValue(MOCK_RUNTIME)
    });

    expect(exitCode).toBe(EXIT_NO_RUNTIME);
    expect(stdout.text()).toContain("FAIL Skills:");
    expect(stdout.text()).toContain("flow-prd-creator");
    expect(stderr.text()).toContain("Doctor found");
  });

  it("flags a missing Claude compatibility symlink", async () => {
    const projectDir = await createInstalledProject();
    const stdout = createOutputCapture();
    const stderr = createOutputCapture();

    await rm(path.join(projectDir, ".claude", "skills"), {
      recursive: true,
      force: true
    });

    const exitCode = await runDoctor({
      projectDir,
      sourceDir: SOURCE_SKILLS_DIR,
      stdout: stdout.stream,
      stderr: stderr.stream,
      detectRuntime: vi.fn().mockResolvedValue(MOCK_RUNTIME)
    });

    expect(exitCode).toBe(EXIT_NO_RUNTIME);
    expect(stdout.text()).toContain("FAIL Claude compat:");
    expect(stdout.text()).toContain(".claude/skills");
  });

  it("flags pending .bak directories for manual review", async () => {
    const projectDir = await createInstalledProject();
    const stdout = createOutputCapture();
    const stderr = createOutputCapture();

    await mkdir(path.join(projectDir, ".agents", "skills", "flow-prd-creator.bak"), {
      recursive: true
    });

    const exitCode = await runDoctor({
      projectDir,
      sourceDir: SOURCE_SKILLS_DIR,
      stdout: stdout.stream,
      stderr: stderr.stream,
      detectRuntime: vi.fn().mockResolvedValue(MOCK_RUNTIME)
    });

    expect(exitCode).toBe(EXIT_NO_RUNTIME);
    expect(stdout.text()).toContain("FAIL Pending backups:");
    expect(stdout.text()).toContain("flow-prd-creator");
  });

  it("reports runtime detection failures", async () => {
    const projectDir = await createInstalledProject();
    const stdout = createOutputCapture();
    const stderr = createOutputCapture();

    const exitCode = await runDoctor({
      projectDir,
      sourceDir: SOURCE_SKILLS_DIR,
      stdout: stdout.stream,
      stderr: stderr.stream,
      detectRuntime: vi.fn().mockRejectedValue(new Error("No ACP runtime was detected on PATH."))
    });

    expect(exitCode).toBe(EXIT_NO_RUNTIME);
    expect(stdout.text()).toContain("FAIL Runtime: No ACP runtime was detected on PATH.");
    expect(stderr.text()).toContain("Doctor found");
  });
});
