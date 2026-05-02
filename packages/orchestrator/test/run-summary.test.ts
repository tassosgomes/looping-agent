import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdir } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { buildRunSummary, persistRunSummary } from "../src/run-summary.js";

describe("run summary", () => {
  it("builds aggregate totals and averages", () => {
    const summary = buildRunSummary({
      runStartedAt: "2026-04-27T10:00:00.000Z",
      runEndedAt: "2026-04-27T10:15:30.000Z",
      tasksTotal: 3,
      tasksCompleted: 2,
      tasksHalted: 1,
      haltTaskNumber: 2,
      haltReason: "retries_exhausted",
      totalIterations: 7,
      totalTokens: { input: 210, output: 63 }
    });

    expect(summary).toEqual({
      run_started_at: "2026-04-27T10:00:00.000Z",
      run_ended_at: "2026-04-27T10:15:30.000Z",
      runtime: null,
      tasks_total: 3,
      tasks_completed: 2,
      tasks_halted: 1,
      halt_task_number: 2,
      halt_reason: "retries_exhausted",
      total_iterations: 7,
      total_tokens: { input: 210, output: 63 },
      total_duration_ms: 930000,
      average_tokens_per_task: { input: 70, output: 21 }
    });
  });

  it("includes runtime details when provided", () => {
    const summary = buildRunSummary({
      runStartedAt: "2026-04-27T10:00:00.000Z",
      runEndedAt: "2026-04-27T10:00:01.000Z",
      runtime: {
        kind: "copilot-acp",
        binary: "copilot",
        path: "/usr/local/bin/copilot",
        version: "1.0.40.",
        model: "gpt-5.2",
        effort: "high"
      },
      tasksTotal: 1,
      tasksCompleted: 1,
      tasksHalted: 0,
      totalIterations: 1,
      totalTokens: null
    });

    expect(summary.runtime).toEqual({
      kind: "copilot-acp",
      binary: "copilot",
      path: "/usr/local/bin/copilot",
      version: "1.0.40.",
      model: "gpt-5.2",
      effort: "high"
    });
  });

  it("persists the summary atomically under telemetry/run-summary-<timestamp>.json", async () => {
    const prdDir = await makeTempPrdDir();
    const summary = buildRunSummary({
      runStartedAt: "2026-04-27T10:00:00.000Z",
      runEndedAt: "2026-04-27T10:15:30.000Z",
      tasksTotal: 1,
      tasksCompleted: 1,
      tasksHalted: 0,
      totalIterations: 3,
      totalTokens: null
    });

    const filePath = await persistRunSummary(prdDir, summary);

    expect(filePath).toBe(join(prdDir, "telemetry", "run-summary-20260427-101530.json"));
    await expect(stat(`${filePath}.tmp`)).rejects.toThrow();
    await expect(readFile(filePath, "utf8")).resolves.toContain('"tasks_total": 1');
    await expect(readFile(filePath, "utf8")).resolves.toContain('"average_tokens_per_task": null');
  });
});

async function makeTempPrdDir(): Promise<string> {
  const prdDir = join(tmpdir(), `looping-agent-run-summary-${process.pid}-${Date.now()}-${Math.random()}`);
  await mkdir(prdDir, { recursive: true });
  return prdDir;
}