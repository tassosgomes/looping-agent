import type {
  ReportFinalizerResultT,
  ReportImplementerResultT,
  ReportReviewResultT
} from "@looping-agent/schemas";

import type {
  CompletionInput,
  PromptReinforcement,
  RetryDecision,
  RetryInput,
  RetryReason
} from "./retry-types.js";

export function decide(input: RetryInput): RetryDecision {
  if (input.stopReason !== "end_turn") {
    return retryOrHalt(input, "stop_reason_failure");
  }

  if (input.schemaErrorMessage) {
    return retryOrHalt(input, "schema_invalid", {
      kind: "schema",
      errorMessage: input.schemaErrorMessage
    });
  }

  if (!input.completionToolSeen) {
    if (hasRetriesRemaining(input)) {
      return {
        kind: "retry",
        reason: "completion_tool_missing",
        reinforcement: { kind: "contract" }
      };
    }

    return { kind: "halt", reason: "contract_violation_unrecoverable" };
  }

  if (input.completionInput === null) {
    return retryOrHalt(input, "schema_invalid", {
      kind: "schema",
      errorMessage: "Completion tool input was missing."
    });
  }

  switch (input.phase) {
    case "implementer":
      return decideImplementer(input, input.completionInput);
    case "reviewer":
      return decideReviewer(input, input.completionInput);
    case "finalizer":
      return decideFinalizer(input, input.completionInput);
  }
}

function decideImplementer(input: RetryInput, completionInput: CompletionInput): RetryDecision {
  if (!isImplementerResult(completionInput)) {
    return retryOrHalt(input, "schema_invalid", {
      kind: "schema",
      errorMessage: "Implementer completion input did not match the expected schema."
    });
  }

  if (completionInput.status === "completed") {
    return { kind: "advance", completionInput };
  }

  return retryOrHalt(input, "implementer_failed");
}

function decideReviewer(input: RetryInput, completionInput: CompletionInput): RetryDecision {
  if (!isReviewerResult(completionInput)) {
    return retryOrHalt(input, "schema_invalid", {
      kind: "schema",
      errorMessage: "Reviewer completion input did not match the expected schema."
    });
  }

  if (!completionInput.requires_rework) {
    return { kind: "advance", completionInput };
  }

  return retryOrHalt(input, "review_requires_rework", {
    kind: "rework",
    issues: completionInput.issues
  });
}

function decideFinalizer(input: RetryInput, completionInput: CompletionInput): RetryDecision {
  if (!isFinalizerResult(completionInput)) {
    return retryOrHalt(input, "schema_invalid", {
      kind: "schema",
      errorMessage: "Finalizer completion input did not match the expected schema."
    });
  }

  if (completionInput.committed) {
    return { kind: "advance", completionInput };
  }

  return { kind: "halt", reason: "finalizer_not_committed" };
}

function retryOrHalt(
  input: RetryInput,
  reason: RetryReason,
  reinforcement?: PromptReinforcement
): RetryDecision {
  if (hasRetriesRemaining(input)) {
    return reinforcement
      ? { kind: "retry", reason, reinforcement }
      : { kind: "retry", reason };
  }

  return { kind: "halt", reason: "retries_exhausted" };
}

function hasRetriesRemaining(input: Pick<RetryInput, "attempt" | "maxRetries">): boolean {
  return input.attempt < input.maxRetries;
}

function isImplementerResult(value: CompletionInput): value is ReportImplementerResultT {
  return value !== null && "status" in value;
}

function isReviewerResult(value: CompletionInput): value is ReportReviewResultT {
  return value !== null && "requires_rework" in value;
}

function isFinalizerResult(value: CompletionInput): value is ReportFinalizerResultT {
  return value !== null && "committed" in value;
}