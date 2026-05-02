import type { McpServerHandle } from "@looping-agent/mcp-server";

import type { AcpClient, AcpNotification, AcpStopReason, AcpTokenUsage, EffortLevel } from "./acp-types.js";
import type { PromptReinforcement, RetryDecision, PhaseName } from "./retry-types.js";
import type { DetectedRuntime } from "./runtime-detector.js";
import type { TaskTelemetryHandle } from "./telemetry-types.js";

export interface PhaseRunnerOptions {
  phase: PhaseName;
  taskNumber: number;
  prdDir: string;
  taskContent: string;
  attempt: number;
  maxRetries: number;
  runtime: DetectedRuntime;
  acpClient: AcpClient;
  mcpHandle: McpServerHandle;
  telemetryHandle: TaskTelemetryHandle;
  reinforcement?: PromptReinforcement;
  sharedMemoryPath: string;
  taskMemoryPath: string;
  cwd?: string;
  signal?: AbortSignal;
  model?: string;
  effort?: EffortLevel;
  onNotification?(notification: AcpNotification): void;
}

export interface PhaseRunnerResult {
  decision: RetryDecision;
  attemptDuration_ms: number;
  stopReason: AcpStopReason;
  tokens: AcpTokenUsage | null;
  completionToolSeen: boolean;
}