import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { AcpTokenUsage, EffortLevel } from "./acp-types.js";
import type { RuntimeKind } from "./runtime-detector.js";

export interface RunSummaryRuntime {
  kind: RuntimeKind;
  binary: string;
  path: string;
  version: string | null;
  model: string | null;
  effort: EffortLevel | null;
}

export interface RunSummary {
  run_started_at: string;
  run_ended_at: string;
  runtime: RunSummaryRuntime | null;
  tasks_total: number;
  tasks_completed: number;
  tasks_halted: number;
  halt_task_number: number | null;
  halt_reason: string | null;
  total_iterations: number;
  total_tokens: AcpTokenUsage | null;
  total_duration_ms: number;
  average_tokens_per_task: AcpTokenUsage | null;
}

export interface BuildRunSummaryInput {
  runStartedAt: string;
  runEndedAt: string;
  runtime?: RunSummaryRuntime;
  tasksTotal: number;
  tasksCompleted: number;
  tasksHalted: number;
  haltTaskNumber?: number;
  haltReason?: string;
  totalIterations: number;
  totalTokens: AcpTokenUsage | null;
}

export function buildRunSummary(input: BuildRunSummaryInput): RunSummary {
  return {
    run_started_at: input.runStartedAt,
    run_ended_at: input.runEndedAt,
    runtime: input.runtime ?? null,
    tasks_total: input.tasksTotal,
    tasks_completed: input.tasksCompleted,
    tasks_halted: input.tasksHalted,
    halt_task_number: input.haltTaskNumber ?? null,
    halt_reason: input.haltReason ?? null,
    total_iterations: input.totalIterations,
    total_tokens: input.totalTokens,
    total_duration_ms: Math.max(0, Date.parse(input.runEndedAt) - Date.parse(input.runStartedAt)),
    average_tokens_per_task: averageTokensPerTask(input.totalTokens, input.tasksTotal)
  };
}

export async function persistRunSummary(prdDir: string, summary: RunSummary): Promise<string> {
  const telemetryDir = join(prdDir, "telemetry");
  const filePath = join(telemetryDir, `run-summary-${formatTimestamp(summary.run_ended_at)}.json`);
  const temporaryPath = `${filePath}.tmp`;

  await mkdir(telemetryDir, { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);

  return filePath;
}

function averageTokensPerTask(totalTokens: AcpTokenUsage | null, tasksTotal: number): AcpTokenUsage | null {
  if (!totalTokens || tasksTotal <= 0) {
    return null;
  }

  return {
    input: Math.round(totalTokens.input / tasksTotal),
    output: Math.round(totalTokens.output / tasksTotal)
  };
}

function formatTimestamp(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);

  return [
    String(date.getUTCFullYear()),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate())
  ].join("") + `-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}