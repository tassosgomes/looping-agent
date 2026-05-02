import { mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { TaskTelemetry } from "@looping-agent/schemas";
import { describe, expect, it } from "vitest";

import type { AcpNotification } from "../src/acp-types.js";
import { TelemetryWriter } from "../src/telemetry-writer.js";

describe("TelemetryWriter", () => {
  it("writes valid task telemetry and raw notification JSONL files", async () => {
    const prdDir = await makeTempPrdDir();
    const handle = new TelemetryWriter(prdDir).startTask(8, "prd-orquestrador-em-codigo");

    handle.recordPhaseStart("implementer", 1);
    handle.recordNotification("implementer", 1, agentChunk("Implementing telemetry writer."));
    handle.recordNotification("implementer", 1, toolCall("read_file", "tool-1"));
    handle.recordNotification("implementer", 1, toolCall("report_implementer_result", "tool-2"));
    handle.recordPhaseEnd("implementer", 1, {
      stopReason: "end_turn",
      tokens: { input: 120, output: 45 },
      completionToolInvoked: true,
      completionInput: implementerResult("completed")
    });

    handle.recordPhaseStart("reviewer", 1);
    handle.recordNotification("reviewer", 1, toolCall("report_review_result", "tool-3"));
    handle.recordPhaseEnd("reviewer", 1, {
      stopReason: "end_turn",
      tokens: { input: 80, output: 25 },
      completionToolInvoked: true,
      completionInput: reviewerResult(false)
    });

    handle.recordPhaseStart("finalizer", 1);
    handle.recordNotification("finalizer", 1, toolCall("report_finalizer_result", "tool-4"));
    handle.recordPhaseEnd("finalizer", 1, {
      stopReason: "end_turn",
      tokens: { input: 40, output: 15 },
      completionToolInvoked: true,
      completionInput: finalizerResult(true)
    });

    await handle.finalize("completed");

    const telemetryPath = join(prdDir, "telemetry", "8_telemetry.json");
    const telemetry = TaskTelemetry.parse(JSON.parse(await readFile(telemetryPath, "utf8")));

    expect(telemetry.status).toBe("completed");
    expect(telemetry.phases).toHaveLength(3);
    expect(telemetry.summary.total_iterations).toBe(3);
    expect(telemetry.summary.total_tokens).toEqual({ input: 240, output: 85 });
    expect(telemetry.summary.review_issues).toEqual([]);
    expect(telemetry.phases[0]?.attempts[0]?.tool_call_count).toBe(2);

    await expect(stat(`${telemetryPath}.tmp`)).rejects.toThrow();
    await expect(readJsonlLines(prdDir, "8_telemetry/implementer-attempt-1-notifications.jsonl")).resolves.toHaveLength(3);
    await expect(readJsonlLines(prdDir, "8_telemetry/reviewer-attempt-1-notifications.jsonl")).resolves.toHaveLength(1);
    await expect(readJsonlLines(prdDir, "8_telemetry/finalizer-attempt-1-notifications.jsonl")).resolves.toHaveLength(1);
  });

  it("preserves all implementer attempts when the task halts", async () => {
    const prdDir = await makeTempPrdDir();
    const handle = new TelemetryWriter(prdDir).startTask(9, "prd-orquestrador-em-codigo");

    for (const attempt of [1, 2, 3]) {
      handle.recordPhaseStart("implementer", attempt);
      handle.recordNotification("implementer", attempt, toolCall("report_implementer_result", `impl-${attempt}`));
      handle.recordPhaseEnd("implementer", attempt, {
        stopReason: "end_turn",
        tokens: { input: 50 * attempt, output: 10 * attempt },
        completionToolInvoked: true,
        completionInput: implementerResult("failed")
      });
    }

    await handle.finalize("halted", "retries_exhausted");

    const telemetryPath = join(prdDir, "telemetry", "9_telemetry.json");
    const telemetry = TaskTelemetry.parse(JSON.parse(await readFile(telemetryPath, "utf8")));

    expect(telemetry.status).toBe("halted");
    expect(telemetry.halt_reason).toBe("retries_exhausted");
    expect(telemetry.phases).toHaveLength(1);
    expect(telemetry.phases[0]?.name).toBe("implementer");
    expect(telemetry.phases[0]?.attempts).toHaveLength(3);
    expect(telemetry.summary.total_iterations).toBe(3);
  });

  it("marks tokens as unavailable when the runtime does not report them", async () => {
    const prdDir = await makeTempPrdDir();
    const handle = new TelemetryWriter(prdDir).startTask(10, "prd-orquestrador-em-codigo");

    handle.recordPhaseStart("implementer", 1);
    handle.recordNotification("implementer", 1, toolCall("report_implementer_result", "impl-no-tokens"));
    handle.recordPhaseEnd("implementer", 1, {
      stopReason: "end_turn",
      tokens: null,
      completionToolInvoked: true,
      completionInput: implementerResult("completed")
    });

    await handle.finalize("completed");

    const telemetryPath = join(prdDir, "telemetry", "10_telemetry.json");
    const telemetry = TaskTelemetry.parse(JSON.parse(await readFile(telemetryPath, "utf8")));

    expect(telemetry.phases[0]?.attempts[0]?.tokens_unavailable).toBe(true);
    expect(telemetry.summary.tokens_unavailable_in_any_phase).toBe(true);
    expect("total_tokens" in telemetry.summary).toBe(false);
  });

  it("finalize halted preserves an in-flight attempt with partial data", async () => {
    const prdDir = await makeTempPrdDir();
    const handle = new TelemetryWriter(prdDir).startTask(11, "prd-orquestrador-em-codigo");

    handle.recordPhaseStart("reviewer", 1);
    handle.recordNotification("reviewer", 1, toolCall("report_review_result", "review-1"));

    await handle.finalize("halted", "contract_violation_unrecoverable");

    const telemetryPath = join(prdDir, "telemetry", "11_telemetry.json");
    const telemetry = TaskTelemetry.parse(JSON.parse(await readFile(telemetryPath, "utf8")));
    const attempt = telemetry.phases[0]?.attempts[0];

    expect(telemetry.status).toBe("halted");
    expect(telemetry.halt_reason).toBe("contract_violation_unrecoverable");
    expect(attempt?.stop_reason).toBe("error");
    expect(attempt?.completion_tool_invoked).toBe(true);
    expect(attempt?.completion_input).toBeNull();
    expect(attempt?.tokens_unavailable).toBe(true);
  });
});

function agentChunk(text: string): AcpNotification {
  return { type: "agent_message_chunk", text };
}

function toolCall(name: string, id: string): AcpNotification {
  return {
    type: "tool_call",
    name,
    id,
    input: { ok: true }
  };
}

function implementerResult(status: "completed" | "failed") {
  return {
    status,
    files_changed: ["packages/orchestrator/src/telemetry-writer.ts"],
    build_passed: status === "completed",
    tests_passed: status === "completed",
    summary: status === "completed" ? "Telemetry writer implemented." : "Implementation still failing.",
    issues_encountered: []
  };
}

function reviewerResult(requiresRework: boolean) {
  return {
    approved: !requiresRework,
    issues: requiresRework
      ? [{ severity: "high" as const, category: "logic", description: "Needs rework.", file_path: "src/file.ts", line: 10 }]
      : [],
    severity_counts: {
      critical: 0,
      high: requiresRework ? 1 : 0,
      medium: 0,
      low: 0
    },
    requires_rework: requiresRework,
    review_file_path: "reviews/8_review.md"
  };
}

function finalizerResult(committed: boolean) {
  return {
    committed,
    sha: committed ? "abc123" : null,
    merged: false,
    branch_deleted: false,
    files_committed: committed ? ["packages/orchestrator/src/telemetry-writer.ts"] : []
  };
}

async function readJsonlLines(prdDir: string, relativePath: string): Promise<unknown[]> {
  const raw = await readFile(join(prdDir, "telemetry", relativePath), "utf8");
  return raw
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

async function makeTempPrdDir(): Promise<string> {
  const prdDir = join(tmpdir(), `looping-agent-telemetry-${process.pid}-${Date.now()}-${Math.random()}`);
  await mkdir(prdDir, { recursive: true });
  return prdDir;
}