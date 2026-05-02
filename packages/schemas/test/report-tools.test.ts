import { describe, expect, it } from "vitest";

import {
  ReportFinalizerResult,
  ReportImplementerResult,
  ReportReviewResult
} from "../src/index.js";

describe("report tool schemas", () => {
  it("accepts a valid implementer result", () => {
    expect(ReportImplementerResult.parse({
      status: "completed",
      files_changed: ["packages/schemas/src/report-tools.ts"],
      build_passed: true,
      tests_passed: true,
      summary: "Implemented schemas.",
      issues_encountered: [
        { severity: "info", description: "No blockers." }
      ]
    })).toMatchObject({ status: "completed" });
  });

  it("rejects invalid implementer result fields", () => {
    expect(() => ReportImplementerResult.parse({
      status: "done",
      files_changed: [],
      build_passed: true,
      tests_passed: true,
      summary: "Invalid status.",
      issues_encountered: []
    })).toThrow();

    expect(() => ReportImplementerResult.parse({
      status: "failed",
      files_changed: [],
      build_passed: false,
      tests_passed: false,
      summary: "",
      issues_encountered: []
    })).toThrow();

    expect(() => ReportImplementerResult.parse({
      status: "failed",
      files_changed: [],
      build_passed: false,
      tests_passed: false,
      summary: "Has extra field.",
      issues_encountered: [],
      extra: true
    })).toThrow();
  });

  it("accepts a valid review result", () => {
    expect(ReportReviewResult.parse({
      approved: false,
      issues: [{
        severity: "high",
        category: "Falha de validação",
        description: "Schema accepts invalid state.",
        file_path: "packages/schemas/src/report-tools.ts",
        line: 12
      }],
      severity_counts: { critical: 0, high: 1, medium: 0, low: 0 },
      requires_rework: true,
      review_file_path: "docs/reviews/2.md"
    })).toMatchObject({ requires_rework: true });
  });

  it("rejects invalid review result fields", () => {
    expect(() => ReportReviewResult.parse({
      approved: true,
      issues: [{ severity: "blocker", category: "X", description: "Invalid severity." }],
      severity_counts: { critical: 0, high: 0, medium: 0, low: 0 },
      requires_rework: false,
      review_file_path: "docs/reviews/2.md"
    })).toThrow();

    expect(() => ReportReviewResult.parse({
      approved: true,
      issues: [],
      severity_counts: { critical: -1, high: 0, medium: 0, low: 0 },
      requires_rework: false,
      review_file_path: "docs/reviews/2.md"
    })).toThrow();

    expect(() => ReportReviewResult.parse({
      approved: true,
      issues: [{
        severity: "low",
        category: "Teste inadequado",
        description: "Line must be an integer.",
        line: 1.5
      }],
      severity_counts: { critical: 0, high: 0, medium: 0, low: 1 },
      requires_rework: false,
      review_file_path: "docs/reviews/2.md"
    })).toThrow();
  });

  it("accepts a valid finalizer result", () => {
    expect(ReportFinalizerResult.parse({
      committed: true,
      sha: "abc123",
      merged: false,
      branch_deleted: false,
      files_committed: ["packages/schemas/src/index.ts"]
    })).toMatchObject({ committed: true });
  });

  it("rejects invalid finalizer result fields", () => {
    expect(() => ReportFinalizerResult.parse({
      committed: "yes",
      sha: null,
      merged: false,
      branch_deleted: false,
      files_committed: []
    })).toThrow();

    expect(() => ReportFinalizerResult.parse({
      committed: false,
      sha: null,
      merged: false,
      branch_deleted: false
    })).toThrow();
  });
});
