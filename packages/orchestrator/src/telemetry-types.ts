import type { CompletionToolInputT, PhaseNameT, TelemetryStatusT } from "@looping-agent/schemas";

import type { AcpNotification, AcpStopReason, AcpTokenUsage } from "./acp-types.js";

export interface PhaseAttemptSummary {
  stopReason: AcpStopReason;
  tokens: AcpTokenUsage | null;
  completionToolInvoked: boolean;
  completionInput: CompletionToolInputT | null;
}

export interface TaskTelemetryHandle {
  recordPhaseStart(phase: PhaseNameT, attempt: number): void;
  recordNotification(phase: PhaseNameT, attempt: number, notif: AcpNotification): void;
  recordPhaseEnd(phase: PhaseNameT, attempt: number, summary: PhaseAttemptSummary): void;
  finalize(status: TelemetryStatusT, haltReason?: string): Promise<void>;
}