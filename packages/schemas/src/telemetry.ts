import { z } from "zod";

import { CompletionToolInput, ReviewIssue } from "./report-tools.js";
import { PHASE_PIPELINE_STAGES } from "./skill-frontmatter.js";

export const TelemetrySchemaVersion = z.literal("1.0");
export type TelemetrySchemaVersionT = z.infer<typeof TelemetrySchemaVersion>;

export const PhaseName = z.enum(PHASE_PIPELINE_STAGES);
export type PhaseNameT = z.infer<typeof PhaseName>;

export const TelemetryStatus = z.enum(["completed", "failed", "halted"]);
export type TelemetryStatusT = z.infer<typeof TelemetryStatus>;

export const TokenUsage = z.object({
  input: z.number().int().nonnegative(),
  output: z.number().int().nonnegative()
}).strict();
export type TokenUsageT = z.infer<typeof TokenUsage>;

const Timestamp = z.string().datetime({ offset: true });

export const AttemptTelemetry = z.object({
  attempt: z.number().int().positive(),
  started_at: Timestamp,
  ended_at: Timestamp,
  duration_ms: z.number().int().nonnegative(),
  stop_reason: z.string().min(1),
  tokens: TokenUsage.optional(),
  tokens_unavailable: z.boolean(),
  tool_call_count: z.number().int().nonnegative(),
  completion_tool_invoked: z.boolean(),
  completion_input: CompletionToolInput.nullable(),
  notifications_log_path: z.string().min(1)
}).strict();
export type AttemptTelemetryT = z.infer<typeof AttemptTelemetry>;

export const PhaseTelemetry = z.object({
  name: PhaseName,
  attempts: z.array(AttemptTelemetry)
}).strict();
export type PhaseTelemetryT = z.infer<typeof PhaseTelemetry>;

export const RunTelemetrySummary = z.object({
  total_iterations: z.number().int().nonnegative(),
  total_tokens: TokenUsage.optional(),
  tokens_unavailable_in_any_phase: z.boolean(),
  review_issues: z.array(ReviewIssue)
}).strict();
export type RunTelemetrySummaryT = z.infer<typeof RunTelemetrySummary>;

export const TaskTelemetry = z.object({
  telemetry_schema_version: TelemetrySchemaVersion,
  task_id: z.number().int().positive(),
  prd_slug: z.string().min(1),
  started_at: Timestamp,
  ended_at: Timestamp,
  duration_ms: z.number().int().nonnegative(),
  status: TelemetryStatus,
  halt_reason: z.string().min(1).nullable(),
  phases: z.array(PhaseTelemetry),
  summary: RunTelemetrySummary
}).strict();
export type TaskTelemetryT = z.infer<typeof TaskTelemetry>;
