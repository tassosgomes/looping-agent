import { z } from "zod";

export const ImplementerIssue = z.object({
  severity: z.enum(["blocker", "warning", "info"]),
  description: z.string().min(1)
}).strict();
export type ImplementerIssueT = z.infer<typeof ImplementerIssue>;

export const ReportImplementerResult = z.object({
  status: z.enum(["completed", "failed"]),
  files_changed: z.array(z.string()),
  build_passed: z.boolean(),
  tests_passed: z.boolean(),
  summary: z.string().min(1),
  issues_encountered: z.array(ImplementerIssue)
}).strict();
export type ReportImplementerResultT = z.infer<typeof ReportImplementerResult>;

export const ReviewIssue = z.object({
  severity: z.enum(["critical", "high", "medium", "low"]),
  category: z.string().min(1),
  description: z.string().min(1),
  file_path: z.string().min(1).optional(),
  line: z.number().int().nonnegative().optional()
}).strict();
export type ReviewIssueT = z.infer<typeof ReviewIssue>;

export const SeverityCounts = z.object({
  critical: z.number().int().nonnegative(),
  high: z.number().int().nonnegative(),
  medium: z.number().int().nonnegative(),
  low: z.number().int().nonnegative()
}).strict();
export type SeverityCountsT = z.infer<typeof SeverityCounts>;

export const ReportReviewResult = z.object({
  approved: z.boolean(),
  issues: z.array(ReviewIssue),
  severity_counts: SeverityCounts,
  requires_rework: z.boolean(),
  review_file_path: z.string().min(1)
}).strict();
export type ReportReviewResultT = z.infer<typeof ReportReviewResult>;

export const ReportFinalizerResult = z.object({
  committed: z.boolean(),
  sha: z.string().nullable(),
  merged: z.boolean(),
  branch_deleted: z.boolean(),
  files_committed: z.array(z.string())
}).strict();
export type ReportFinalizerResultT = z.infer<typeof ReportFinalizerResult>;

export const CompletionToolInput = z.union([
  ReportImplementerResult,
  ReportReviewResult,
  ReportFinalizerResult
]);
export type CompletionToolInputT = z.infer<typeof CompletionToolInput>;
