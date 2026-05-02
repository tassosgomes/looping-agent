import type {
  ReportFinalizerResultT,
  ReportImplementerResultT,
  ReportReviewResultT
} from "@looping-agent/schemas";

import type { AcpStopReason } from "./acp-types.js";

export type PhaseName = "implementer" | "reviewer" | "finalizer";

export type CompletionInput =
  | ReportImplementerResultT
  | ReportReviewResultT
  | ReportFinalizerResultT
  | null;

export interface RetryInput {
  phase: PhaseName;
  stopReason: AcpStopReason;
  completionToolSeen: boolean;
  completionInput: CompletionInput;
  attempt: number;
  maxRetries: number;
  schemaErrorMessage?: string | null;
}

export type PromptReinforcement =
  | { kind: "contract" }
  | { kind: "rework"; issues: ReportReviewResultT["issues"] }
  | { kind: "schema"; errorMessage: string };

export type RetryReason =
  | "stop_reason_failure"
  | "completion_tool_missing"
  | "schema_invalid"
  | "implementer_failed"
  | "review_requires_rework";

export type HaltReason =
  | "retries_exhausted"
  | "finalizer_not_committed"
  | "contract_violation_unrecoverable";

export type RetryDecision =
  | { kind: "advance"; completionInput: CompletionInput }
  | { kind: "retry"; reason: RetryReason; reinforcement?: PromptReinforcement }
  | { kind: "halt"; reason: HaltReason };