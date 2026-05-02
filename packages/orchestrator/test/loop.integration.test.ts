import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { CompletionToolInputT } from "@looping-agent/schemas";
import type { McpServerHandle, OnToolCall, OnToolCallError } from "@looping-agent/mcp-server";
import { describe, expect, it, vi } from "vitest";

import type { AcpClient, AcpSession, AcpTokenUsage } from "../src/acp-types.js";
import { runLoopWithDependencies, type RunLoopDependencies } from "../src/loop.js";
import type { MemoryPaths } from "../src/memory-types.js";
import type { PhaseRunnerOptions, PhaseRunnerResult } from "../src/phase-runner-types.js";
import type { PhaseName, RetryDecision } from "../src/retry-types.js";
import type { DetectedRuntime } from "../src/runtime-detector.js";
import type { PhaseAttemptSummary, TaskTelemetryHandle } from "../src/telemetry-types.js";
import { DefaultMemoryManager } from "../src/memory-manager.js";
import { buildRunSummary, persistRunSummary } from "../src/run-summary.js";
import { DefaultTasksReader } from "../src/tasks-reader.js";
import { TelemetryWriter } from "../src/telemetry-writer.js";

const runtime: DetectedRuntime = {
  kind: "copilot-acp",
  binary: "copilot",
  args: ["--acp"],
  path: "/usr/bin/copilot",
  version: "1.0.0"
};

describe("runLoop", () => {
  it("runs three pending tasks, writes task telemetry, and persists the run summary", async () => {
    const prdDir = await createPrdFixture([
      { number: 1, status: "pending", title: "Implement task 1" },
      { number: 2, status: "pending", title: "Implement task 2" },
      { number: 3, status: "pending", title: "Implement task 3" }
    ]);
    const phaseRunner = scriptedPhaseRunner();
    const context = makeDependencies(prdDir, phaseRunner.script);

    const result = await runLoopWithDependencies({ prdDir }, context.dependencies);

    expect(result).toMatchObject({
      status: "completed",
      tasksTotal: 3,
      tasksCompleted: 3,
      tasksHalted: 0,
      totalIterations: 9,
      totalTokens: { input: 90, output: 45 }
    });
    expect(context.phaseCalls.map((entry) => `${entry.taskNumber}:${entry.phase}:${entry.attempt}`)).toEqual([
      "1:implementer:1",
      "1:reviewer:1",
      "1:finalizer:1",
      "2:implementer:1",
      "2:reviewer:1",
      "2:finalizer:1",
      "3:implementer:1",
      "3:reviewer:1",
      "3:finalizer:1"
    ]);
    await expect(stat(join(prdDir, "telemetry", "1_telemetry.json"))).resolves.toBeDefined();
    await expect(stat(join(prdDir, "telemetry", "2_telemetry.json"))).resolves.toBeDefined();
    await expect(stat(join(prdDir, "telemetry", "3_telemetry.json"))).resolves.toBeDefined();
    await expect(readFile(result.summaryPath, "utf8")).resolves.toContain('"tasks_completed": 3');
    expect(context.mcp.startCalls).toBe(1);
    expect(context.mcp.stopCalls).toBe(1);
    expect(context.acp.dispose).toHaveBeenCalledTimes(1);
  });

  it("halts on the second task after implementer retries are exhausted and never starts task 3", async () => {
    const prdDir = await createPrdFixture([
      { number: 1, status: "pending", title: "Implement task 1" },
      { number: 2, status: "pending", title: "Implement task 2" },
      { number: 3, status: "pending", title: "Implement task 3" }
    ]);
    const context = makeDependencies(prdDir, {
      "2:implementer:1": {
        decision: { kind: "retry", reason: "implementer_failed" },
        completionInput: implementerInput("failed")
      },
      "2:implementer:2": {
        decision: { kind: "retry", reason: "implementer_failed" },
        completionInput: implementerInput("failed")
      },
      "2:implementer:3": {
        decision: { kind: "halt", reason: "retries_exhausted" },
        completionInput: implementerInput("failed")
      }
    });

    const result = await runLoopWithDependencies({ prdDir }, context.dependencies);

    expect(result).toMatchObject({
      status: "halted",
      tasksTotal: 3,
      tasksCompleted: 1,
      tasksHalted: 1,
      haltTaskNumber: 2,
      haltReason: "retries_exhausted",
      totalIterations: 6
    });
    expect(context.phaseCalls.map((entry) => `${entry.taskNumber}:${entry.phase}:${entry.attempt}`)).toEqual([
      "1:implementer:1",
      "1:reviewer:1",
      "1:finalizer:1",
      "2:implementer:1",
      "2:implementer:2",
      "2:implementer:3"
    ]);
    await expect(stat(join(prdDir, "telemetry", "3_telemetry.json"))).rejects.toThrow();
  });

  it("skips completed tasks and only runs pending or in-progress entries", async () => {
    const prdDir = await createPrdFixture([
      { number: 1, status: "completed", title: "Already done" },
      { number: 2, status: "pending", title: "Still pending" },
      { number: 3, status: "in_progress", title: "Resume me" }
    ]);
    const phaseCalls: string[] = [];
    const progressEvents: string[] = [];
    const context = makeDependencies(prdDir, {}, phaseCalls);

    const result = await runLoopWithDependencies(
      {
        prdDir,
        onProgress: (event) => {
          if (event.type === "task_skipped") {
            progressEvents.push(`${event.taskNumber}:${event.title}`);
          }
        }
      },
      context.dependencies
    );

    expect(result).toMatchObject({ status: "completed", tasksTotal: 2, tasksCompleted: 2, tasksHalted: 0 });
    expect(progressEvents).toEqual(["1:Already done"]);
    expect(context.phaseCalls.every((entry) => entry.taskNumber !== 1)).toBe(true);
  });

  it("respawns the MCP server and retries the current phase after a recoverable MCP crash", async () => {
    const prdDir = await createPrdFixture([{ number: 1, status: "pending", title: "Recover MCP" }]);
    const context = makeDependencies(prdDir, {
      "1:implementer:1": {
        errorFactory: () => {
          context.mcp.lastCreateOptions?.onError?.(new Error("MCP server crashed during onToolCall"));
          return new Error("MCP server crashed during onToolCall");
        }
      },
      "1:implementer:2": {
        decision: { kind: "advance", completionInput: implementerInput("completed") }
      }
    });

    const result = await runLoopWithDependencies({ prdDir }, context.dependencies);

    expect(result).toMatchObject({
      status: "completed",
      tasksTotal: 1,
      tasksCompleted: 1,
      tasksHalted: 0,
      totalIterations: 4,
      totalTokens: null
    });
    expect(context.mcp.startCalls).toBe(2);
    expect(context.mcp.stopCalls).toBe(2);
    expect(context.phaseCalls.map((entry) => `${entry.taskNumber}:${entry.phase}:${entry.attempt}`)).toEqual([
      "1:implementer:1",
      "1:implementer:2",
      "1:reviewer:1",
      "1:finalizer:1"
    ]);
  });

  it("aborts cleanly, stops the MCP server, and disposes the ACP client", async () => {
    const prdDir = await createPrdFixture([{ number: 1, status: "pending", title: "Abort task" }]);
    const controller = new AbortController();
    let phaseEntered!: () => void;
    const enteredPhase = new Promise<void>((resolve) => {
      phaseEntered = resolve;
    });
    const context = makeDependencies(prdDir, {
      "1:implementer:1": {
        run: (opts) => {
          opts.telemetryHandle.recordPhaseStart(opts.phase, opts.attempt);
          phaseEntered();

          return new Promise<PhaseRunnerResult>((_, reject) => {
            opts.signal?.addEventListener(
              "abort",
              () => {
                opts.telemetryHandle.recordPhaseEnd(opts.phase, opts.attempt, {
                  stopReason: "error",
                  tokens: null,
                  completionToolInvoked: false,
                  completionInput: null
                });
                reject(abortError());
              },
              { once: true }
            );
          });
        }
      }
    });

    const promise = runLoopWithDependencies({ prdDir, signal: controller.signal }, context.dependencies);
    await enteredPhase;
    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(context.mcp.stopCalls).toBe(1);
    expect(context.acp.dispose).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid maxRetries before starting shared services", async () => {
    const prdDir = await createPrdFixture([{ number: 1, status: "pending", title: "Invalid retries" }]);
    const context = makeDependencies(prdDir, {});

    await expect(runLoopWithDependencies({ prdDir, maxRetries: 0 }, context.dependencies)).rejects.toThrow(
      "maxRetries must be a positive integer."
    );
    expect(context.mcp.startCalls).toBe(0);
    expect(context.acp.dispose).not.toHaveBeenCalled();
  });

  it("fails fast when the abort signal is already triggered before the run starts", async () => {
    const prdDir = await createPrdFixture([{ number: 1, status: "pending", title: "Pre-aborted" }]);
    const controller = new AbortController();
    controller.abort();
    const context = makeDependencies(prdDir, {});

    await expect(
      runLoopWithDependencies({ prdDir, signal: controller.signal }, context.dependencies)
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(context.mcp.startCalls).toBe(0);
    expect(context.acp.dispose).not.toHaveBeenCalled();
  });

  it("treats matching non-Error MCP failures as recoverable and retries the phase", async () => {
    const prdDir = await createPrdFixture([{ number: 1, status: "pending", title: "String failure" }]);
    const context = makeDependencies(prdDir, {
      "1:implementer:1": {
        run: async (opts) => {
          opts.telemetryHandle.recordPhaseStart(opts.phase, opts.attempt);
          opts.telemetryHandle.recordPhaseEnd(opts.phase, opts.attempt, {
            stopReason: "error",
            tokens: null,
            completionToolInvoked: false,
            completionInput: null
          });
          throw "mcp stdio transport closed";
        }
      },
      "1:implementer:2": {
        decision: { kind: "advance", completionInput: implementerInput("completed") }
      }
    });

    const result = await runLoopWithDependencies({ prdDir }, context.dependencies);

    expect(result).toMatchObject({
      status: "completed",
      tasksTotal: 1,
      tasksCompleted: 1,
      tasksHalted: 0,
      totalIterations: 4,
      totalTokens: null
    });
    expect(context.mcp.startCalls).toBe(2);
    expect(context.mcp.stopCalls).toBe(2);
  });
});

interface ScriptedPhaseStep {
  decision?: RetryDecision;
  stopReason?: PhaseRunnerResult["stopReason"];
  tokens?: AcpTokenUsage | null;
  completionInput?: CompletionToolInputT | null;
  completionToolInvoked?: boolean;
  errorFactory?: () => Error;
  run?: (opts: PhaseRunnerOptions) => Promise<PhaseRunnerResult>;
}

function scriptedPhaseRunner(defaultCalls?: string[]) {
  return {
    script: {} as Record<string, ScriptedPhaseStep>,
    defaultCalls
  };
}

function makeDependencies(
  prdDir: string,
  overrides: Record<string, ScriptedPhaseStep>,
  callLog?: string[]
): {
  dependencies: RunLoopDependencies;
  phaseCalls: Array<{ taskNumber: number; phase: PhaseName; attempt: number }>;
  acp: AcpClient & { dispose: ReturnType<typeof vi.fn> };
  mcp: {
    startCalls: number;
    stopCalls: number;
    lastCreateOptions: CreateMcpServerOptions | null;
  };
} {
  const phaseCalls: Array<{ taskNumber: number; phase: PhaseName; attempt: number }> = [];
  const mcpState = { startCalls: 0, stopCalls: 0, lastCreateOptions: null as CreateMcpServerOptions | null };
  const acp = {
    openSession: vi.fn(async (): Promise<AcpSession> => {
      throw new Error("The fake loop tests should not open real ACP sessions.");
    }),
    dispose: vi.fn(async () => undefined)
  } satisfies AcpClient & { dispose: ReturnType<typeof vi.fn> };

  const dependencies: RunLoopDependencies = {
    detectRuntime: async () => runtime,
    createAcpClient: () => acp,
    createMcpServer: (options) => {
      mcpState.lastCreateOptions = options;

      return new FakeMcpServerHandle(mcpState);
    },
    createPhaseRunner: () => ({
      run: async (opts) => {
        const key = `${opts.taskNumber}:${opts.phase}:${opts.attempt}`;
        phaseCalls.push({ taskNumber: opts.taskNumber, phase: opts.phase, attempt: opts.attempt });
        callLog?.push(key);
        const scripted = overrides[key] ?? defaultStepFor(opts.phase);

        if (scripted.run) {
          return scripted.run(opts);
        }

        opts.telemetryHandle.recordPhaseStart(opts.phase, opts.attempt);
        opts.onNotification?.({ type: "agent_message_chunk", text: key });

        if (scripted.errorFactory) {
          opts.telemetryHandle.recordPhaseEnd(opts.phase, opts.attempt, {
            stopReason: "error",
            tokens: null,
            completionToolInvoked: false,
            completionInput: null
          });
          throw scripted.errorFactory();
        }

        const decision = scripted.decision ?? { kind: "advance", completionInput: defaultCompletionInput(opts.phase) };
        const tokens = scripted.tokens ?? { input: 10, output: 5 };
        const completionInput = scripted.completionInput ?? completionInputForDecision(opts.phase, decision);
        const stopReason = scripted.stopReason ?? "end_turn";
        const completionToolInvoked = scripted.completionToolInvoked ?? true;

        opts.telemetryHandle.recordPhaseEnd(opts.phase, opts.attempt, {
          stopReason,
          tokens,
          completionToolInvoked,
          completionInput
        });

        return {
          decision,
          attemptDuration_ms: 10,
          stopReason,
          tokens,
          completionToolSeen: completionToolInvoked
        };
      }
    }),
    createTasksReader: (tasksFilePath) => new DefaultTasksReader(tasksFilePath),
    createMemoryManager: () => new DefaultMemoryManager(),
    createTelemetryWriter: (dir) => new TelemetryWriter(dir),
    persistRunSummary,
    now: (() => {
      const timestamps = [
        new Date("2026-04-27T10:00:00.000Z"),
        new Date("2026-04-27T10:15:30.000Z")
      ];
      let index = 0;

      return () => timestamps[Math.min(index++, timestamps.length - 1)] as Date;
    })(),
    cwd: () => prdDir
  };

  return {
    dependencies,
    phaseCalls,
    acp,
    mcp: mcpState
  };
}

class FakeMcpServerHandle implements McpServerHandle {
  constructor(private readonly state: { startCalls: number; stopCalls: number }) {}

  async start(): Promise<void> {
    this.state.startCalls += 1;
  }

  async stop(): Promise<void> {
    this.state.stopCalls += 1;
  }

  getServerConfig() {
    return {
      name: "looping-agent-mcp",
      command: process.execPath,
      args: ["/tmp/looping-agent-mcp-standalone.mjs"],
      env: []
    };
  }

  addToolCallListener(_listener: OnToolCall): () => void {
    return () => undefined;
  }

  addToolCallErrorListener(_listener: OnToolCallError): () => void {
    return () => undefined;
  }
}

function defaultStepFor(phase: PhaseName): ScriptedPhaseStep {
  return {
    decision: { kind: "advance", completionInput: defaultCompletionInput(phase) }
  };
}

function completionInputForDecision(phase: PhaseName, decision: RetryDecision): CompletionToolInputT | null {
  if (decision.kind === "advance") {
    return decision.completionInput as CompletionToolInputT;
  }

  if (phase === "implementer") {
    return implementerInput("failed");
  }

  if (phase === "reviewer") {
    return reviewerInput(true);
  }

  return finalizerInput(false);
}

function defaultCompletionInput(phase: PhaseName): CompletionToolInputT {
  switch (phase) {
    case "implementer":
      return implementerInput("completed");
    case "reviewer":
      return reviewerInput(false);
    case "finalizer":
      return finalizerInput(true);
  }
}

function implementerInput(status: "completed" | "failed") {
  return {
    status,
    files_changed: ["packages/orchestrator/src/loop.ts"],
    build_passed: status === "completed",
    tests_passed: status === "completed",
    summary: status === "completed" ? "Loop implemented." : "Loop still failing.",
    issues_encountered: []
  };
}

function reviewerInput(requiresRework: boolean) {
  return {
    approved: !requiresRework,
    issues: requiresRework
      ? [{ severity: "high" as const, category: "logic", description: "Needs rework." }]
      : [],
    severity_counts: {
      critical: 0,
      high: requiresRework ? 1 : 0,
      medium: 0,
      low: 0
    },
    requires_rework: requiresRework,
    review_file_path: "reviews/11_review.md"
  };
}

function finalizerInput(committed: boolean) {
  return {
    committed,
    sha: committed ? "abc123" : null,
    merged: false,
    branch_deleted: false,
    files_committed: committed ? ["packages/orchestrator/src/loop.ts"] : []
  };
}

async function createPrdFixture(
  tasks: Array<{ number: number; status: "completed" | "pending" | "in_progress"; title: string }>
): Promise<string> {
  const prdDir = join(tmpdir(), `looping-agent-loop-${process.pid}-${Date.now()}-${Math.random()}`);
  await mkdir(prdDir, { recursive: true });
  await writeFile(
    join(prdDir, "tasks.md"),
    [
      "# Fixture",
      "",
      "## Tarefas",
      "",
      ...tasks.map((task) => `- [${statusMarker(task.status)}] ${task.number}.0 ${task.title}`),
      "",
      "## Fim"
    ].join("\n"),
    "utf8"
  );

  for (const task of tasks) {
    await writeFile(join(prdDir, `${task.number}_task.md`), `# Task ${task.number}\n\n${task.title}\n`, "utf8");
  }

  return prdDir;
}

function statusMarker(status: "completed" | "pending" | "in_progress"): string {
  switch (status) {
    case "completed":
      return "x";
    case "in_progress":
      return "~";
    case "pending":
      return " ";
  }
}

function abortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}
