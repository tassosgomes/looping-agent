import { describe, expect, it } from "vitest";

import { TaskTelemetry } from "../src/index.js";

const validTelemetry = {
  telemetry_schema_version: "1.0",
  task_id: 3,
  prd_slug: "orquestrador-em-codigo",
  started_at: "2026-04-26T13:00:00Z",
  ended_at: "2026-04-26T13:14:32Z",
  duration_ms: 872000,
  status: "completed",
  halt_reason: null,
  phases: [{
    name: "implementer",
    attempts: [{
      attempt: 1,
      started_at: "2026-04-26T13:00:00Z",
      ended_at: "2026-04-26T13:08:00Z",
      duration_ms: 480000,
      stop_reason: "end_turn",
      tokens: { input: 12450, output: 3200 },
      tokens_unavailable: false,
      tool_call_count: 7,
      completion_tool_invoked: true,
      completion_input: {
        status: "completed",
        files_changed: ["packages/schemas/src/telemetry.ts"],
        build_passed: true,
        tests_passed: true,
        summary: "Implemented telemetry schema.",
        issues_encountered: []
      },
      notifications_log_path: "./3_telemetry/implementer-attempt-1-notifications.jsonl"
    }]
  }],
  summary: {
    total_iterations: 1,
    total_tokens: { input: 12450, output: 3200 },
    tokens_unavailable_in_any_phase: false,
    review_issues: []
  }
} as const;

describe("telemetry schemas", () => {
  it("accepts valid task telemetry", () => {
    expect(TaskTelemetry.parse(validTelemetry)).toMatchObject({
      telemetry_schema_version: "1.0",
      status: "completed"
    });
  });

  it("accepts telemetry when tokens are unavailable", () => {
    const telemetry = {
      ...validTelemetry,
      phases: [{
        ...validTelemetry.phases[0],
        attempts: [{
          ...validTelemetry.phases[0].attempts[0],
          tokens: undefined,
          tokens_unavailable: true
        }]
      }],
      summary: {
        total_iterations: 1,
        tokens_unavailable_in_any_phase: true,
        review_issues: []
      }
    };

    expect(TaskTelemetry.parse(telemetry)).toMatchObject({
      summary: { tokens_unavailable_in_any_phase: true }
    });
  });

  it("rejects invalid task telemetry fields", () => {
    expect(() => TaskTelemetry.parse({
      ...validTelemetry,
      telemetry_schema_version: "2.0"
    })).toThrow();

    expect(() => TaskTelemetry.parse({
      ...validTelemetry,
      task_id: 0
    })).toThrow();

    expect(() => TaskTelemetry.parse({
      ...validTelemetry,
      status: "paused"
    })).toThrow();

    expect(() => TaskTelemetry.parse({
      ...validTelemetry,
      extra: true
    })).toThrow();
  });

  it("rejects invalid attempt telemetry fields", () => {
    expect(() => TaskTelemetry.parse({
      ...validTelemetry,
      phases: [{
        ...validTelemetry.phases[0],
        attempts: [{
          ...validTelemetry.phases[0].attempts[0],
          attempt: -1
        }]
      }]
    })).toThrow();

    expect(() => TaskTelemetry.parse({
      ...validTelemetry,
      phases: [{
        ...validTelemetry.phases[0],
        attempts: [{
          ...validTelemetry.phases[0].attempts[0],
          completion_input: { status: "completed" }
        }]
      }]
    })).toThrow();

    expect(() => TaskTelemetry.parse({
      ...validTelemetry,
      phases: [{
        ...validTelemetry.phases[0],
        attempts: [{
          ...validTelemetry.phases[0].attempts[0],
          notifications_log_path: ""
        }]
      }]
    })).toThrow();
  });
});
