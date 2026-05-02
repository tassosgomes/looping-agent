import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  ReportFinalizerResult,
  ReportImplementerResult,
  ReportReviewResult
} from "@looping-agent/schemas";
import type { z } from "zod";

import type { OnToolCall, OnToolCallError, ToolCallEvent, ToolName } from "./types.js";

interface ToolSchemaMap {
  report_implementer_result: typeof ReportImplementerResult;
  report_review_result: typeof ReportReviewResult;
  report_finalizer_result: typeof ReportFinalizerResult;
}

export const toolSchemas: ToolSchemaMap = {
  report_implementer_result: ReportImplementerResult,
  report_review_result: ReportReviewResult,
  report_finalizer_result: ReportFinalizerResult
};

export const toolDefinitions = [
  {
    name: "report_implementer_result",
    description: "Reports the implementer phase outcome to the local orchestrator.",
    schema: ReportImplementerResult
  },
  {
    name: "report_review_result",
    description: "Reports the review phase outcome and quality issues to the local orchestrator.",
    schema: ReportReviewResult
  },
  {
    name: "report_finalizer_result",
    description: "Reports the finalizer phase commit and cleanup outcome to the local orchestrator.",
    schema: ReportFinalizerResult
  }
] as const;

interface InvokeReportToolOptions {
  tool: ToolName;
  rawInput: unknown;
  onToolCall: OnToolCall;
  onToolCallError?: OnToolCallError;
  onError?: ((err: Error) => void) | undefined;
}

export async function invokeReportTool({
  tool,
  rawInput,
  onToolCall,
  onToolCallError,
  onError
}: InvokeReportToolOptions): Promise<CallToolResult> {
  const parsed = safeParseToolCall(tool, rawInput);

  if (!parsed.success) {
    await notifyToolCallError({
      tool,
      rawInput,
      message: parsed.message,
      onToolCallError,
      onError
    });

    return toolError("schema_validation_failed", parsed.message);
  }

  try {
    await onToolCall(parsed.event);
    // Echo the validated input back in the MCP response so the orchestrator can
    // recover it from `tool_call_update.output` even when the ACP runtime
    // strips rawInput from the `tool_call` notification (Claude Code wrapper
    // does this — only Copilot echoes rawInput on the call itself).
    const payload = { ok: true, tool, input: parsed.event.input };
    return {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      structuredContent: payload
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    onError?.(error);

    return toolError("tool_callback_failed", error.message);
  }
}

export function safeParseToolCall(
  tool: ToolName,
  rawInput: unknown
): { success: true; event: ToolCallEvent } | { success: false; message: string } {
  const schema = toolSchemas[tool];
  const result = schema.safeParse(rawInput);

  if (!result.success) {
    return { success: false, message: formatZodError(tool, result.error) };
  }

  return { success: true, event: toToolCallEvent(tool, result.data) };
}

async function notifyToolCallError({
  tool,
  rawInput,
  message,
  onToolCallError,
  onError
}: {
  tool: ToolName;
  rawInput: unknown;
  message: string;
  onToolCallError: OnToolCallError | undefined;
  onError?: ((err: Error) => void) | undefined;
}): Promise<void> {
  if (!onToolCallError) {
    return;
  }

  try {
    await onToolCallError({
      tool,
      rawInput,
      code: "schema_validation_failed",
      message
    });
  } catch (err) {
    onError?.(err instanceof Error ? err : new Error(String(err)));
  }
}

function toToolCallEvent(
  tool: ToolName,
  input: z.infer<ToolSchemaMap[ToolName]>
): ToolCallEvent {
  switch (tool) {
    case "report_implementer_result":
      return { tool, input: ReportImplementerResult.parse(input) };
    case "report_review_result":
      return { tool, input: ReportReviewResult.parse(input) };
    case "report_finalizer_result":
      return { tool, input: ReportFinalizerResult.parse(input) };
  }
}

function formatZodError(tool: ToolName, error: z.ZodError): string {
  const issues = error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join(".") : "<root>",
    message: issue.message
  }));

  return JSON.stringify({
    ok: false,
    code: "schema_validation_failed",
    tool,
    message: `Invalid input for ${tool}`,
    issues,
    formatted: error.format()
  });
}

function toolError(code: string, message: string): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify({
          ok: false,
          code,
          message
        })
      }
    ]
  };
}
