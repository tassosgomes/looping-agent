import { describe, expect, it, vi } from "vitest";

import { runCli } from "../src/index.js";

import { createOutputCapture } from "./commands/test-support.js";

describe("runCli", () => {
  it("prints help with the four supported commands", async () => {
    const stdout = createOutputCapture();
    const stderr = createOutputCapture();

    const exitCode = await runCli(["node", "looping-agent", "--help"], {
      version: "1.2.3",
      stdout: stdout.stream,
      stderr: stderr.stream
    });

    expect(exitCode).toBe(0);
    expect(stderr.text()).toBe("");
    expect(stdout.text()).toContain("setup");
    expect(stdout.text()).toContain("update");
    expect(stdout.text()).toContain("run");
    expect(stdout.text()).toContain("doctor");
  });

  it("dispatches the run command with parsed options and propagates its exit code", async () => {
    const stdout = createOutputCapture();
    const stderr = createOutputCapture();
    const runRunMock = vi.fn().mockResolvedValue(11);

    const exitCode = await runCli([
      "node",
      "looping-agent",
      "run",
      "--prd-dir",
      "tasks/prd-orquestrador-em-codigo",
      "--max-retries",
      "5",
      "--runtime",
      "claude-acp",
      "--no-color",
      "--verbose",
      "--debug"
    ], {
      version: "1.2.3",
      stdout: stdout.stream,
      stderr: stderr.stream,
      runRun: runRunMock
    });

    expect(exitCode).toBe(11);
    expect(runRunMock).toHaveBeenCalledWith(expect.objectContaining({
      prdDir: "tasks/prd-orquestrador-em-codigo",
      maxRetries: 5,
      runtime: "claude-agent-acp",
      noColor: true,
      verbose: true,
      debug: true,
      stdout: stdout.stream,
      stderr: stderr.stream
    }));
  });

  it("accepts global --debug before the run subcommand", async () => {
    const stdout = createOutputCapture();
    const stderr = createOutputCapture();
    const runRunMock = vi.fn().mockResolvedValue(0);

    const exitCode = await runCli([
      "node",
      "looping-agent",
      "--debug",
      "run",
      "--prd-dir",
      "tasks/prd-orquestrador-em-codigo"
    ], {
      version: "1.2.3",
      stdout: stdout.stream,
      stderr: stderr.stream,
      runRun: runRunMock
    });

    expect(exitCode).toBe(0);
    expect(runRunMock).toHaveBeenCalledWith(expect.objectContaining({
      prdDir: "tasks/prd-orquestrador-em-codigo",
      debug: true
    }));
  });

  it("dispatches setup and doctor without requiring the CLI process to exit", async () => {
    const stdout = createOutputCapture();
    const stderr = createOutputCapture();
    const runSetupMock = vi.fn().mockResolvedValue(0);
    const runDoctorMock = vi.fn().mockResolvedValue(0);

    const setupExit = await runCli(["node", "looping-agent", "setup", "--force"], {
      version: "1.2.3",
      stdout: stdout.stream,
      stderr: stderr.stream,
      runSetup: runSetupMock,
      runDoctor: runDoctorMock
    });
    const doctorExit = await runCli(["node", "looping-agent", "doctor", "--no-color"], {
      version: "1.2.3",
      stdout: stdout.stream,
      stderr: stderr.stream,
      runSetup: runSetupMock,
      runDoctor: runDoctorMock
    });

    expect(setupExit).toBe(0);
    expect(doctorExit).toBe(0);
    expect(runSetupMock).toHaveBeenCalledWith(expect.objectContaining({
      force: true,
      stdout: stdout.stream,
      stderr: stderr.stream
    }));
    expect(runDoctorMock).toHaveBeenCalledWith(expect.objectContaining({
      noColor: true,
      stdout: stdout.stream,
      stderr: stderr.stream
    }));
  });
});