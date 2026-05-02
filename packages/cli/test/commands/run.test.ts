import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { runRun } from "../../src/commands/run.js";
import { EXIT_HALT_RETRIES, EXIT_NO_TASKS_MD, EXIT_RUNTIME_UNAVAILABLE } from "../../src/exit-codes.js";
import type { SpinnerFactory, SpinnerLike } from "../../src/renderer/types.js";

import { createOutputCapture } from "./test-support.js";

describe("runRun", () => {
  it("returns exit 2 when tasks.md is missing", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "looping-agent-run-"));
    const stdout = createOutputCapture();
    const stderr = createOutputCapture();

    const exitCode = await runRun({
      prdDir: "tasks/prd-demo",
      projectDir,
      stdout: stdout.stream,
      stderr: stderr.stream
    });

    expect(exitCode).toBe(EXIT_NO_TASKS_MD);
    expect(stdout.text()).toBe("");
    expect(stderr.text()).toContain("Could not find");
    expect(stderr.text()).toContain("tasks.md");
  });

  it("renders progress and returns exit 0 for a completed run", async () => {
    const prdDir = await createPrdFixture();
    const stdout = createOutputCapture();
    const stderr = createOutputCapture();
    const runLoopMock = vi.fn().mockImplementation(async (options: Parameters<typeof runRun>[0] & { onProgress: NonNullable<Parameters<NonNullable<Parameters<typeof runRun>[0]["runLoop"]>>[0]["onProgress"]> }) => {
      options.onProgress({
        type: "task_started",
        taskNumber: 1,
        title: "Executar task"
      });
      options.onProgress({
        type: "phase_started",
        taskNumber: 1,
        phase: "implementer",
        attempt: 1
      });
      options.onProgress({
        type: "notification",
        taskNumber: 1,
        phase: "implementer",
        attempt: 1,
        notification: { type: "agent_message_chunk", text: "working" }
      });
      options.onProgress({
        type: "phase_finished",
        taskNumber: 1,
        phase: "implementer",
        attempt: 1,
        decision: { kind: "advance", completionInput: null },
        stopReason: "end_turn"
      });
      options.onProgress({
        type: "task_finished",
        taskNumber: 1,
        status: "completed"
      });

      return {
        status: "completed",
        tasksTotal: 1,
        tasksCompleted: 1,
        tasksHalted: 0,
        totalIterations: 1,
        totalTokens: null,
        totalDurationMs: 250,
        summaryPath: path.join(prdDir, "telemetry", "run-summary.json")
      };
    });

    const exitCode = await runRun({
      prdDir,
      stdout: stdout.stream,
      stderr: stderr.stream,
      noColor: true,
      runLoop: runLoopMock as never
    });

    expect(exitCode).toBe(0);
    expect(stderr.text()).toBe("");
    expect(stdout.text()).toContain("Looping Agent");
    expect(stdout.text()).toContain("Task 1");
    expect(stdout.text()).toContain("Implementer attempt 1/3");
    expect(stdout.text()).toContain("Run completed");
  });

  it("maps retries exhausted to exit 10", async () => {
    const prdDir = await createPrdFixture();
    const stdout = createOutputCapture();
    const stderr = createOutputCapture();

    const exitCode = await runRun({
      prdDir,
      stdout: stdout.stream,
      stderr: stderr.stream,
      noColor: true,
      runLoop: vi.fn().mockResolvedValue({
        status: "halted",
        tasksTotal: 1,
        tasksCompleted: 0,
        tasksHalted: 1,
        haltTaskNumber: 1,
        haltReason: "retries_exhausted",
        totalIterations: 3,
        totalTokens: null,
        totalDurationMs: 900,
        summaryPath: path.join(prdDir, "telemetry", "run-summary.json")
      }) as never
    });

    expect(exitCode).toBe(EXIT_HALT_RETRIES);
    expect(stdout.text()).toContain("HALT retries_exhausted");
    expect(stdout.text()).toContain("Run halted");
  });

  it("returns exit 3 when runtime detection is unavailable", async () => {
    const prdDir = await createPrdFixture();
    const stdout = createOutputCapture();
    const stderr = createOutputCapture();

    const exitCode = await runRun({
      prdDir,
      stdout: stdout.stream,
      stderr: stderr.stream,
      runLoop: vi.fn().mockRejectedValue(new Error("No ACP runtime was detected on PATH.")) as never
    });

    expect(exitCode).toBe(EXIT_RUNTIME_UNAVAILABLE);
    expect(stderr.text()).toContain("No ACP runtime was detected on PATH.");
    expect(stderr.text()).toContain("agent tool choice");
    expect(stderr.text()).toContain("Suggested command");
  });

  it("disables ANSI colors when --no-color is used", async () => {
    const prdDir = await createPrdFixture();
    const colorStream = createTTYCapture();
    const plainStream = createTTYCapture();
    const spinnerFactory = createSpinnerFactory();
    const runLoopMock = vi.fn().mockResolvedValue({
      status: "completed",
      tasksTotal: 1,
      tasksCompleted: 1,
      tasksHalted: 0,
      totalIterations: 1,
      totalTokens: null,
      totalDurationMs: 200,
      summaryPath: path.join(prdDir, "telemetry", "run-summary.json")
    });

    await runRun({
      prdDir,
      stdout: colorStream,
      stderr: createOutputCapture().stream,
      runLoop: runLoopMock as never,
      spinnerFactory
    });
    await runRun({
      prdDir,
      stdout: plainStream,
      stderr: createOutputCapture().stream,
      noColor: true,
      runLoop: runLoopMock as never,
      spinnerFactory
    });

    expect(colorStream.output).toMatch(/\u001b\[/u);
    expect(plainStream.output).not.toMatch(/\u001b\[/u);
  });

  it("aborts on SIGINT and returns exit 130", async () => {
    const prdDir = await createPrdFixture();
    const stdout = createOutputCapture();
    const stderr = createOutputCapture();
    const signalSource = new EventEmitter();
    const runLoopMock = vi.fn().mockImplementation(async (options: { signal: AbortSignal }) => {
      await new Promise<never>((_, reject) => {
        options.signal.addEventListener("abort", () => {
          const error = new Error("The operation was aborted.");
          error.name = "AbortError";
          reject(error);
        });
        queueMicrotask(() => {
          signalSource.emit("SIGINT");
        });
      });
    });

    const exitCode = await runRun({
      prdDir,
      stdout: stdout.stream,
      stderr: stderr.stream,
      noColor: true,
      signalSource: signalSource as never,
      runLoop: runLoopMock as never
    });

    expect(exitCode).toBe(130);
    expect(stdout.text()).toContain("HALT interrupted");
    expect(stdout.text()).not.toContain("Telemetry");
  });
});

async function createPrdFixture(): Promise<string> {
  const prdDir = await mkdtemp(path.join(os.tmpdir(), "looping-agent-prd-"));
  await mkdir(prdDir, { recursive: true });
  await writeFile(
    path.join(prdDir, "tasks.md"),
    [
      "# Tasks",
      "",
      "## Tarefas",
      "- [ ] 1.0 Executar task"
    ].join("\n"),
    "utf8"
  );
  await writeFile(path.join(prdDir, "1_task.md"), "# Task 1\n", "utf8");
  return prdDir;
}

function createTTYCapture(): NodeJS.WriteStream & { output: string } {
  let output = "";

  return {
    isTTY: true,
    write(chunk: string | Uint8Array): boolean {
      output += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
      return true;
    },
    get output(): string {
      return output;
    }
  } as NodeJS.WriteStream & { output: string };
}

function createSpinnerFactory(): SpinnerFactory {
  return () => new SilentSpinner();
}

class SilentSpinner implements SpinnerLike {
  text = "";
  isSpinning = false;

  start(text?: string): SpinnerLike {
    this.text = text ?? this.text;
    this.isSpinning = true;
    return this;
  }

  stop(): SpinnerLike {
    this.isSpinning = false;
    return this;
  }

  succeed(text?: string): SpinnerLike {
    this.text = text ?? this.text;
    this.isSpinning = false;
    return this;
  }

  warn(text?: string): SpinnerLike {
    this.text = text ?? this.text;
    this.isSpinning = false;
    return this;
  }

  fail(text?: string): SpinnerLike {
    this.text = text ?? this.text;
    this.isSpinning = false;
    return this;
  }
}
