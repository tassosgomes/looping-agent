import { describe, expect, it, vi } from "vitest";

import { invokeReportTool } from "../src/tool-handlers.js";
import type { ToolCallEvent } from "../src/types.js";

describe("invokeReportTool", () => {
  it("validates input and routes parsed implementer payloads", async () => {
    const calls: ToolCallEvent[] = [];

    const result = await invokeReportTool({
      tool: "report_implementer_result",
      rawInput: {
        status: "completed",
        files_changed: ["packages/mcp-server/src/server.ts"],
        build_passed: true,
        tests_passed: true,
        summary: "MCP server implemented.",
        issues_encountered: []
      },
      onToolCall: (evt) => calls.push(evt)
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      ok: true,
      tool: "report_implementer_result",
      input: { build_passed: true, tests_passed: true, status: "completed" }
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      tool: "report_implementer_result",
      input: { build_passed: true, tests_passed: true }
    });
  });

  it("returns a structured schema error without calling the callback", async () => {
    const onToolCall = vi.fn();

    const result = await invokeReportTool({
      tool: "report_review_result",
      rawInput: {
        approved: true,
        issues: [],
        severity_counts: { critical: -1, high: 0, medium: 0, low: 0 },
        requires_rework: false,
        review_file_path: "reviews/3.md"
      },
      onToolCall
    });

    expect(onToolCall).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);

    const text = result.content[0]?.type === "text" ? result.content[0].text : "";
    expect(text).toContain("schema_validation_failed");
    expect(text).toContain("severity_counts.critical");
  });

  it("reports callback failures through onError", async () => {
    const err = new Error("orchestrator unavailable");
    const onError = vi.fn();

    const result = await invokeReportTool({
      tool: "report_finalizer_result",
      rawInput: {
        committed: false,
        sha: null,
        merged: false,
        branch_deleted: false,
        files_committed: []
      },
      onToolCall: () => {
        throw err;
      },
      onError
    });

    expect(onError).toHaveBeenCalledWith(err);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.type === "text" ? result.content[0].text : "").toContain("tool_callback_failed");
  });
});
