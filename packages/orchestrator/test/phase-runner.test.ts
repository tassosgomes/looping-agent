import type {
  McpServerHandle,
  OnToolCall,
  OnToolCallError,
  ToolCallEvent
} from "@looping-agent/mcp-server";
import { describe, expect, it, vi } from "vitest";

import type { AcpClient, AcpFinalResult, AcpNotification, AcpSession } from "../src/acp-types.js";
import { PhaseRunner, type PhaseRunnerOptions } from "../src/index.js";
import type { DetectedRuntime } from "../src/runtime-detector.js";
import type { PhaseAttemptSummary, TaskTelemetryHandle } from "../src/telemetry-types.js";

const runtime: DetectedRuntime = {
  kind: "codex-acp",
  binary: "codex-acp",
  args: [],
  path: "/usr/bin/codex-acp",
  version: "1.0.0"
};

describe("PhaseRunner", () => {
  it("advances implementer output, streams notifications, and stays under the overhead budget", async () => {
    const streamedNotifications: AcpNotification[] = [];
    const mcpHandle = new FakeMcpServerHandle();
    const telemetryHandle = new FakeTelemetryHandle();
    const completionEvent: ToolCallEvent = {
      tool: "report_implementer_result",
      input: {
        status: "completed",
        files_changed: ["packages/orchestrator/src/phase-runner.ts"],
        build_passed: true,
        tests_passed: true,
        summary: "implemented phase runner",
        issues_encountered: []
      }
    };
    const notifications: AcpNotification[] = [
      { type: "agent_message_chunk", text: "working" },
      {
        type: "tool_call",
        id: "tool-1",
        name: "report_implementer_result",
        input: completionEvent.input
      }
    ];

    const session = new FakeAcpSession({
      notifications,
      emitBeforeFinal: () => undefined,
      finalResult: { stopReason: "end_turn", tokens: { input: 21, output: 13 } }
    });

    const result = await new PhaseRunner().run(
      makeOptions({
        phase: "implementer",
        acpClient: fakeAcpClient(session),
        mcpHandle,
        telemetryHandle,
        onNotification: (notification) => {
          streamedNotifications.push(notification);
        }
      })
    );

    expect(result.decision).toEqual({ kind: "advance", completionInput: completionEvent.input });
    expect(result.completionToolSeen).toBe(true);
    expect(result.stopReason).toBe("end_turn");
    expect(result.tokens).toEqual({ input: 21, output: 13 });
    expect(result.attemptDuration_ms).toBeLessThan(200);
    expect(streamedNotifications).toEqual(notifications);
    expect(telemetryHandle.starts).toEqual([{ phase: "implementer", attempt: 1 }]);
    expect(telemetryHandle.notifications).toEqual([
      { phase: "implementer", attempt: 1, notification: notifications[0] },
      { phase: "implementer", attempt: 1, notification: notifications[1] }
    ]);
    expect(telemetryHandle.ends).toEqual([
      {
        phase: "implementer",
        attempt: 1,
        summary: {
          stopReason: "end_turn",
          tokens: { input: 21, output: 13 },
          completionToolInvoked: true,
          completionInput: completionEvent.input
        }
      }
    ]);
    expect(session.closeCalls).toBe(1);
    expect(mcpHandle.listenerCounts()).toEqual({ toolCall: 0, toolCallError: 0 });
  });

  it("retries implementer failures before the last attempt", async () => {
    const result = await runScenario({
      phase: "implementer",
      attempt: 2,
      completionEvent: {
        tool: "report_implementer_result",
        input: {
          status: "failed",
          files_changed: [],
          build_passed: false,
          tests_passed: false,
          summary: "blocked",
          issues_encountered: [{ severity: "blocker", description: "build failed" }]
        }
      }
    });

    expect(result.decision).toEqual({ kind: "retry", reason: "implementer_failed" });
  });

  it("halts implementer failures on the last attempt", async () => {
    const result = await runScenario({
      phase: "implementer",
      attempt: 3,
      completionEvent: {
        tool: "report_implementer_result",
        input: {
          status: "failed",
          files_changed: [],
          build_passed: false,
          tests_passed: false,
          summary: "blocked",
          issues_encountered: [{ severity: "blocker", description: "tests failed" }]
        }
      }
    });

    expect(result.decision).toEqual({ kind: "halt", reason: "retries_exhausted" });
  });

  it("retries reviewer rework and preserves the rework reinforcement", async () => {
    const issues = [
      {
        severity: "high",
        category: "logic",
        description: "missing retry guard",
        file_path: "packages/orchestrator/src/phase-runner.ts",
        line: 1
      }
    ] as const;
    const mcpHandle = new FakeMcpServerHandle();
    const session = new FakeAcpSession({
      notifications: [
        {
          type: "tool_call",
          id: "tool-1",
          name: "report_review_result",
          input: {
            approved: false,
            issues: [...issues],
            severity_counts: { critical: 0, high: 1, medium: 0, low: 0 },
            requires_rework: true,
            review_file_path: "reviews/10.md"
          }
        }
      ],
      emitBeforeFinal: () => undefined,
      finalResult: { stopReason: "end_turn", tokens: null }
    });

    const result = await new PhaseRunner().run(
      makeOptions({
        phase: "reviewer",
        acpClient: fakeAcpClient(session),
        mcpHandle,
        telemetryHandle: new FakeTelemetryHandle(),
        attempt: 1
      })
    );

    expect(result.decision).toEqual({
      kind: "retry",
      reason: "review_requires_rework",
      reinforcement: { kind: "rework", issues: [...issues] }
    });
  });

  it("halts finalizer immediately when committed is false", async () => {
    const result = await runScenario({
      phase: "finalizer",
      completionEvent: {
        tool: "report_finalizer_result",
        input: {
          committed: false,
          sha: null,
          merged: false,
          branch_deleted: false,
          files_committed: []
        }
      }
    });

    expect(result.decision).toEqual({ kind: "halt", reason: "finalizer_not_committed" });
  });

  it("retries contract violations when the phase ends without the completion tool", async () => {
    const result = await runScenario({
      phase: "implementer",
      finalResult: { stopReason: "end_turn", tokens: null }
    });

    expect(result.decision).toEqual({
      kind: "retry",
      reason: "completion_tool_missing",
      reinforcement: { kind: "contract" }
    });
    expect(result.completionToolSeen).toBe(false);
  });

  it("retries stop reason failures", async () => {
    const result = await runScenario({
      phase: "implementer",
      finalResult: { stopReason: "refusal", tokens: null }
    });

    expect(result.decision).toEqual({ kind: "retry", reason: "stop_reason_failure" });
  });

  it("marks schema-invalid completion calls as unseen and returns schema reinforcement", async () => {
    const mcpHandle = new FakeMcpServerHandle();
    const session = new FakeAcpSession({
      notifications: [
        {
          type: "tool_call",
          id: "tool-1",
          name: "report_implementer_result",
          input: { status: "completed" }
        }
      ],
      emitBeforeFinal: () => undefined,
      finalResult: { stopReason: "end_turn", tokens: null }
    });

    const result = await new PhaseRunner().run(
      makeOptions({
        phase: "implementer",
        acpClient: { openSession: vi.fn().mockResolvedValue(session) },
        mcpHandle,
        telemetryHandle: new FakeTelemetryHandle()
      })
    );

    expect(result.completionToolSeen).toBe(false);
    expect(result.decision.kind).toBe("retry");
    if (result.decision.kind === "retry" && result.decision.reason === "schema_invalid") {
      expect(result.decision.reinforcement).toEqual({
        kind: "schema",
        errorMessage: expect.stringContaining("Invalid input for report_implementer_result")
      });
    }
  });
});

function makeOptions(overrides: Partial<PhaseRunnerOptions>): PhaseRunnerOptions {
  return {
    phase: "implementer",
    taskNumber: 10,
    prdDir: "tasks/prd-orquestrador-em-codigo",
    taskContent: "# Tarefa 10.0\n\nImplementar o phase runner.",
    attempt: 1,
    maxRetries: 3,
    runtime,
    acpClient: fakeAcpClient(),
    mcpHandle: new FakeMcpServerHandle(),
    telemetryHandle: new FakeTelemetryHandle(),
    sharedMemoryPath: "tasks/prd-orquestrador-em-codigo/MEMORY.md",
    taskMemoryPath: "tasks/prd-orquestrador-em-codigo/memory/10_task.md",
    cwd: "/home/tsgomes/looping-agent",
    ...overrides
  };
}

async function runScenario(input: {
  phase: PhaseRunnerOptions["phase"];
  attempt?: number;
  completionEvent?: ToolCallEvent;
  finalResult?: AcpFinalResult;
}): Promise<Awaited<ReturnType<PhaseRunner["run"]>>> {
  const mcpHandle = new FakeMcpServerHandle();
  const notifications = input.completionEvent
    ? [{
        type: "tool_call" as const,
        id: "tool-1",
        name: input.completionEvent.tool,
        input: input.completionEvent.input
      }]
    : [];
  const session = new FakeAcpSession({
    notifications,
    emitBeforeFinal: () => undefined,
    finalResult: input.finalResult ?? { stopReason: "end_turn", tokens: null }
  });

  return new PhaseRunner().run(
    makeOptions({
      phase: input.phase,
      attempt: input.attempt ?? 1,
      acpClient: fakeAcpClient(session),
      mcpHandle,
      telemetryHandle: new FakeTelemetryHandle()
    })
  );
}

function fakeAcpClient(session?: AcpSession): AcpClient {
  return {
    openSession: session
      ? vi.fn().mockResolvedValue(session)
      : vi.fn(async () => {
          throw new Error("No ACP session was configured for this test.");
        }),
    dispose: vi.fn(async () => undefined)
  };
}

class FakeAcpSession implements AcpSession {
  private readonly listeners = new Set<(notification: AcpNotification) => void>();
  private promptSent = false;
  closeCalls = 0;

  constructor(
    private readonly script: {
      notifications: AcpNotification[];
      emitBeforeFinal: () => void;
      finalResult: AcpFinalResult;
    }
  ) {}

  async sendPrompt(): Promise<void> {
    this.promptSent = true;

    for (const notification of this.script.notifications) {
      for (const listener of this.listeners) {
        listener(notification);
      }
    }

    this.script.emitBeforeFinal();
  }

  onNotification(cb: (notification: AcpNotification) => void): void {
    this.listeners.add(cb);
  }

  async awaitFinal(): Promise<AcpFinalResult> {
    if (!this.promptSent) {
      throw new Error("awaitFinal called before sendPrompt");
    }

    return this.script.finalResult;
  }

  async close(): Promise<void> {
    this.closeCalls += 1;
  }
}

class FakeMcpServerHandle implements McpServerHandle {
  private readonly toolCallListeners = new Set<OnToolCall>();
  private readonly toolCallErrorListeners = new Set<OnToolCallError>();

  async start(): Promise<void> {}

  async stop(): Promise<void> {}

  getServerConfig() {
    return {
      name: "looping-agent-mcp",
      command: process.execPath,
      args: ["/tmp/looping-agent-mcp-standalone.mjs"],
      env: []
    };
  }

  addToolCallListener(listener: OnToolCall): () => void {
    this.toolCallListeners.add(listener);

    return () => {
      this.toolCallListeners.delete(listener);
    };
  }

  addToolCallErrorListener(listener: OnToolCallError): () => void {
    this.toolCallErrorListeners.add(listener);

    return () => {
      this.toolCallErrorListeners.delete(listener);
    };
  }

  listenerCounts(): { toolCall: number; toolCallError: number } {
    return {
      toolCall: this.toolCallListeners.size,
      toolCallError: this.toolCallErrorListeners.size
    };
  }
}

class FakeTelemetryHandle implements TaskTelemetryHandle {
  readonly starts: Array<{ phase: PhaseRunnerOptions["phase"]; attempt: number }> = [];
  readonly notifications: Array<{
    phase: PhaseRunnerOptions["phase"];
    attempt: number;
    notification: AcpNotification;
  }> = [];
  readonly ends: Array<{
    phase: PhaseRunnerOptions["phase"];
    attempt: number;
    summary: PhaseAttemptSummary;
  }> = [];

  recordPhaseStart(phase: PhaseRunnerOptions["phase"], attempt: number): void {
    this.starts.push({ phase, attempt });
  }

  recordNotification(phase: PhaseRunnerOptions["phase"], attempt: number, notification: AcpNotification): void {
    this.notifications.push({ phase, attempt, notification });
  }

  recordPhaseEnd(phase: PhaseRunnerOptions["phase"], attempt: number, summary: PhaseAttemptSummary): void {
    this.ends.push({ phase, attempt, summary });
  }

  async finalize(): Promise<void> {}
}
