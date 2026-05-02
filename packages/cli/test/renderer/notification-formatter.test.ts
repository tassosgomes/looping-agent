import { describe, expect, it } from "vitest";

import {
  formatAgentMessage,
  formatNotification,
  formatPlan,
  formatToolCall,
  formatToolCallUpdate
} from "../../src/index.js";

describe("notification formatter", () => {
  it("renders a stable snapshot for plans", () => {
    expect(formatPlan({
      type: "plan",
      content: [
        { step: "Read the task" },
        { step: "Run renderer tests" }
      ]
    })).toMatchInlineSnapshot('"[plan] [{\"step\":\"Read the task\"},{\"step\":\"Run renderer tests\"}]"');
  });

  it("renders a stable snapshot for agent message chunks", () => {
    expect(formatAgentMessage({
      type: "agent_message_chunk",
      text: "Streaming implementation update"
    })).toMatchInlineSnapshot('"[agent] Streaming implementation update"');
  });

  it("renders a stable snapshot for tool calls and includes the tool name", () => {
    const output = formatToolCall({
      type: "tool_call",
      id: "tool-7",
      name: "report_implementer_result",
      input: {
        status: "completed",
        files_changed: ["packages/cli/src/renderer/terminal-ui.ts"]
      }
    });

    expect(output).toContain("report_implementer_result");
    expect(output).toMatchInlineSnapshot('"[tool] report_implementer_result id=tool-7 input={\"status\":\"completed\",\"files_changed\":[\"packages/cli/src/renderer/terminal-ui.ts\"]}"');
  });

  it("renders a stable snapshot for tool call updates", () => {
    expect(formatToolCallUpdate({
      type: "tool_call_update",
      id: "tool-9",
      status: "completed",
      output: { copied: 19 }
    })).toMatchInlineSnapshot('"[tool:update] id=tool-9 status=completed output={\"copied\":19}"');
  });

  it("switches on notification type with a shared entrypoint", () => {
    expect(formatNotification({
      type: "tool_call",
      id: "tool-2",
      name: "report_review_result",
      input: {
        approved: true
      }
    })).toContain("report_review_result");
  });
});