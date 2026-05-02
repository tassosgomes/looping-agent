import { describe, expect, it } from "vitest";

import { decide, type RetryInput } from "../src/index.js";

const implementerCompleted = {
  status: "completed",
  files_changed: ["packages/orchestrator/src/retry-policy.ts"],
  build_passed: true,
  tests_passed: true,
  summary: "implemented retry policy",
  issues_encountered: []
} as const;

const implementerFailed = {
  status: "failed",
  files_changed: ["packages/orchestrator/src/retry-policy.ts"],
  build_passed: false,
  tests_passed: false,
  summary: "implementation blocked",
  issues_encountered: [{ severity: "blocker", description: "build failed" }]
} as const;

const reviewerApproved = {
  approved: true,
  issues: [],
  severity_counts: { critical: 0, high: 0, medium: 0, low: 0 },
  requires_rework: false,
  review_file_path: "reviews/7.md"
} as const;

const reviewerRework = {
  approved: false,
  issues: [
    {
      severity: "high",
      category: "logic",
      description: "missing retry guard",
      file_path: "packages/orchestrator/src/retry-policy.ts",
      line: 1
    }
  ],
  severity_counts: { critical: 0, high: 1, medium: 0, low: 0 },
  requires_rework: true,
  review_file_path: "reviews/7.md"
} as const;

const finalizerCommitted = {
  committed: true,
  sha: "abc123",
  merged: false,
  branch_deleted: false,
  files_committed: ["packages/orchestrator/src/retry-policy.ts"]
} as const;

const finalizerNotCommitted = {
  committed: false,
  sha: null,
  merged: false,
  branch_deleted: false,
  files_committed: []
} as const;

describe("decide", () => {
  it.each([
    ["refusal"],
    ["max_tokens"],
    ["max_turn_requests"],
    ["error"]
  ] as const)("retries stop reason failures for %s before the retry budget is exhausted", (stopReason) => {
    expect(
      decide(
        makeInput({
          phase: "implementer",
          stopReason,
          completionToolSeen: true,
          completionInput: implementerCompleted,
          attempt: 1
        })
      )
    ).toEqual({ kind: "retry", reason: "stop_reason_failure" });
  });

  it.each([
    ["refusal"],
    ["max_tokens"],
    ["max_turn_requests"],
    ["error"]
  ] as const)("halts when stop reason %s happens on the last allowed attempt", (stopReason) => {
    expect(
      decide(
        makeInput({
          phase: "reviewer",
          stopReason,
          completionToolSeen: true,
          completionInput: reviewerApproved,
          attempt: 3
        })
      )
    ).toEqual({ kind: "halt", reason: "retries_exhausted" });
  });

  it.each([
    ["implementer"],
    ["reviewer"],
    ["finalizer"]
  ] as const)(
    "retries contract violations for %s when the phase ends without the completion tool",
    (phase) => {
      expect(
        decide(
          makeInput({
            phase,
            stopReason: "end_turn",
            completionToolSeen: false,
            completionInput: null,
            attempt: 1
          })
        )
      ).toEqual({
        kind: "retry",
        reason: "completion_tool_missing",
        reinforcement: { kind: "contract" }
      });
    }
  );

  it.each([
    ["implementer"],
    ["reviewer"],
    ["finalizer"]
  ] as const)(
    "halts unrecoverable contract violations for %s when retries are exhausted",
    (phase) => {
      expect(
        decide(
          makeInput({
            phase,
            stopReason: "end_turn",
            completionToolSeen: false,
            completionInput: null,
            attempt: 3
          })
        )
      ).toEqual({ kind: "halt", reason: "contract_violation_unrecoverable" });
    }
  );

  it("advances implementer output that completed successfully", () => {
    expect(
      decide(
        makeInput({
          phase: "implementer",
          completionToolSeen: true,
          completionInput: implementerCompleted
        })
      )
    ).toEqual({ kind: "advance", completionInput: implementerCompleted });
  });

  it("retries implementer failures until the retry budget is exhausted", () => {
    expect(
      decide(
        makeInput({
          phase: "implementer",
          completionToolSeen: true,
          completionInput: implementerFailed,
          attempt: 2
        })
      )
    ).toEqual({ kind: "retry", reason: "implementer_failed" });

    expect(
      decide(
        makeInput({
          phase: "implementer",
          completionToolSeen: true,
          completionInput: implementerFailed,
          attempt: 3
        })
      )
    ).toEqual({ kind: "halt", reason: "retries_exhausted" });
  });

  it("advances reviewer output that does not require rework", () => {
    expect(
      decide(
        makeInput({
          phase: "reviewer",
          completionToolSeen: true,
          completionInput: reviewerApproved
        })
      )
    ).toEqual({ kind: "advance", completionInput: reviewerApproved });
  });

  it("retries reviewer rework requests and preserves the issues list", () => {
    expect(
      decide(
        makeInput({
          phase: "reviewer",
          completionToolSeen: true,
          completionInput: reviewerRework,
          attempt: 2
        })
      )
    ).toEqual({
      kind: "retry",
      reason: "review_requires_rework",
      reinforcement: {
        kind: "rework",
        issues: reviewerRework.issues
      }
    });

    expect(
      decide(
        makeInput({
          phase: "reviewer",
          completionToolSeen: true,
          completionInput: reviewerRework,
          attempt: 3
        })
      )
    ).toEqual({ kind: "halt", reason: "retries_exhausted" });
  });

  it("advances finalizer output only when the change was committed", () => {
    expect(
      decide(
        makeInput({
          phase: "finalizer",
          completionToolSeen: true,
          completionInput: finalizerCommitted
        })
      )
    ).toEqual({ kind: "advance", completionInput: finalizerCommitted });
  });

  it.each([1, 3] as const)(
    "halts immediately when finalizer reports committed=false on attempt %i",
    (attempt) => {
      expect(
        decide(
          makeInput({
            phase: "finalizer",
            completionToolSeen: true,
            completionInput: finalizerNotCommitted,
            attempt
          })
        )
      ).toEqual({ kind: "halt", reason: "finalizer_not_committed" });
    }
  );

  it("retries schema-invalid tool payloads with schema reinforcement", () => {
    expect(
      decide(
        makeInput({
          phase: "implementer",
          completionToolSeen: false,
          completionInput: null,
          schemaErrorMessage: "Invalid implementer payload"
        })
      )
    ).toEqual({
      kind: "retry",
      reason: "schema_invalid",
      reinforcement: {
        kind: "schema",
        errorMessage: "Invalid implementer payload"
      }
    });
  });

  it("halts schema-invalid tool payloads after the retry budget is exhausted", () => {
    expect(
      decide(
        makeInput({
          phase: "reviewer",
          completionToolSeen: false,
          completionInput: null,
          attempt: 3,
          schemaErrorMessage: "Invalid review payload"
        })
      )
    ).toEqual({ kind: "halt", reason: "retries_exhausted" });
  });

  it("treats null completion input with a seen tool as a schema failure", () => {
    expect(
      decide(
        makeInput({
          phase: "implementer",
          completionToolSeen: true,
          completionInput: null
        })
      )
    ).toEqual({
      kind: "retry",
      reason: "schema_invalid",
      reinforcement: {
        kind: "schema",
        errorMessage: "Completion tool input was missing."
      }
    });
  });

  it.each([
    ["implementer", reviewerApproved, "Implementer completion input did not match the expected schema."],
    ["reviewer", finalizerCommitted, "Reviewer completion input did not match the expected schema."],
    ["finalizer", implementerCompleted, "Finalizer completion input did not match the expected schema."]
  ] as const)(
    "retries mismatched phase payloads as schema failures for %s",
    (phase, completionInput, errorMessage) => {
      expect(
        decide(
          makeInput({
            phase,
            completionToolSeen: true,
            completionInput
          })
        )
      ).toEqual({
        kind: "retry",
        reason: "schema_invalid",
        reinforcement: {
          kind: "schema",
          errorMessage
        }
      });
    }
  );
});

function makeInput(overrides: Partial<RetryInput>): RetryInput {
  return {
    phase: "implementer",
    stopReason: "end_turn",
    completionToolSeen: true,
    completionInput: implementerCompleted,
    attempt: 1,
    maxRetries: 3,
    schemaErrorMessage: null,
    ...overrides
  };
}