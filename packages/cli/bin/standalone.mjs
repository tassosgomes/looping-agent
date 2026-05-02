// src/mcp-standalone.ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// ../mcp-server/dist/server.js
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// ../schemas/dist/install-state.js
import { z as z2 } from "zod";

// ../schemas/dist/skill-frontmatter.js
import { z } from "zod";
var PIPELINE_STAGES = [
  "vision",
  "domain",
  "prd",
  "contract",
  "techspec",
  "tasks",
  "implementer",
  "reviewer",
  "finalizer",
  "runtime"
];
var SKILL_CONSUMERS = [
  "planning",
  "orchestrator",
  "implementer",
  "reviewer",
  "finalizer"
];
var PHASE_PIPELINE_STAGES = [
  "implementer",
  "reviewer",
  "finalizer"
];
var COMPLETION_TOOLS = [
  "report_implementer_result",
  "report_review_result",
  "report_finalizer_result"
];
var FlowSkillName = z.string().regex(/^flow-/);
var PipelineStage = z.enum(PIPELINE_STAGES);
var SkillConsumer = z.enum(SKILL_CONSUMERS);
var CompletionToolName = z.enum(COMPLETION_TOOLS);
var BaseSkillFrontmatter = z.object({
  name: FlowSkillName,
  description: z.string().min(1),
  pipeline_stage: PipelineStage,
  consumed_by: z.array(SkillConsumer),
  requires: z.array(z.string()),
  produces: z.array(z.string())
}).strict();
var PhaseSkillFrontmatter = BaseSkillFrontmatter.extend({
  pipeline_stage: z.enum(PHASE_PIPELINE_STAGES),
  consumed_by: z.array(z.literal("orchestrator")),
  loads_skills: z.array(FlowSkillName),
  completion_tool: CompletionToolName
}).strict();

// ../schemas/dist/install-state.js
var Timestamp = z2.string().datetime({ offset: true });
var SkillInstallState = z2.object({
  hash: z2.string().regex(/^sha256:[a-fA-F0-9]{64}$/),
  installed_version: z2.string().min(1)
}).strict();
var InstallState = z2.object({
  looping_agent_version: z2.string().min(1),
  installed_at: Timestamp,
  skills: z2.record(FlowSkillName, SkillInstallState)
}).strict();

// ../schemas/dist/report-tools.js
import { z as z3 } from "zod";
var ImplementerIssue = z3.object({
  severity: z3.enum(["blocker", "warning", "info"]),
  description: z3.string().min(1)
}).strict();
var ReportImplementerResult = z3.object({
  status: z3.enum(["completed", "failed"]),
  files_changed: z3.array(z3.string()),
  build_passed: z3.boolean(),
  tests_passed: z3.boolean(),
  summary: z3.string().min(1),
  issues_encountered: z3.array(ImplementerIssue)
}).strict();
var ReviewIssue = z3.object({
  severity: z3.enum(["critical", "high", "medium", "low"]),
  category: z3.string().min(1),
  description: z3.string().min(1),
  file_path: z3.string().min(1).optional(),
  line: z3.number().int().nonnegative().optional()
}).strict();
var SeverityCounts = z3.object({
  critical: z3.number().int().nonnegative(),
  high: z3.number().int().nonnegative(),
  medium: z3.number().int().nonnegative(),
  low: z3.number().int().nonnegative()
}).strict();
var ReportReviewResult = z3.object({
  approved: z3.boolean(),
  issues: z3.array(ReviewIssue),
  severity_counts: SeverityCounts,
  requires_rework: z3.boolean(),
  review_file_path: z3.string().min(1)
}).strict();
var ReportFinalizerResult = z3.object({
  committed: z3.boolean(),
  sha: z3.string().nullable(),
  merged: z3.boolean(),
  branch_deleted: z3.boolean(),
  files_committed: z3.array(z3.string())
}).strict();
var CompletionToolInput = z3.union([
  ReportImplementerResult,
  ReportReviewResult,
  ReportFinalizerResult
]);

// ../schemas/dist/telemetry.js
import { z as z4 } from "zod";
var TelemetrySchemaVersion = z4.literal("1.0");
var PhaseName = z4.enum(PHASE_PIPELINE_STAGES);
var TelemetryStatus = z4.enum(["completed", "failed", "halted"]);
var TokenUsage = z4.object({
  input: z4.number().int().nonnegative(),
  output: z4.number().int().nonnegative()
}).strict();
var Timestamp2 = z4.string().datetime({ offset: true });
var AttemptTelemetry = z4.object({
  attempt: z4.number().int().positive(),
  started_at: Timestamp2,
  ended_at: Timestamp2,
  duration_ms: z4.number().int().nonnegative(),
  stop_reason: z4.string().min(1),
  tokens: TokenUsage.optional(),
  tokens_unavailable: z4.boolean(),
  tool_call_count: z4.number().int().nonnegative(),
  completion_tool_invoked: z4.boolean(),
  completion_input: CompletionToolInput.nullable(),
  notifications_log_path: z4.string().min(1)
}).strict();
var PhaseTelemetry = z4.object({
  name: PhaseName,
  attempts: z4.array(AttemptTelemetry)
}).strict();
var RunTelemetrySummary = z4.object({
  total_iterations: z4.number().int().nonnegative(),
  total_tokens: TokenUsage.optional(),
  tokens_unavailable_in_any_phase: z4.boolean(),
  review_issues: z4.array(ReviewIssue)
}).strict();
var TaskTelemetry = z4.object({
  telemetry_schema_version: TelemetrySchemaVersion,
  task_id: z4.number().int().positive(),
  prd_slug: z4.string().min(1),
  started_at: Timestamp2,
  ended_at: Timestamp2,
  duration_ms: z4.number().int().nonnegative(),
  status: TelemetryStatus,
  halt_reason: z4.string().min(1).nullable(),
  phases: z4.array(PhaseTelemetry),
  summary: RunTelemetrySummary
}).strict();

// ../mcp-server/dist/tool-handlers.js
var toolSchemas = {
  report_implementer_result: ReportImplementerResult,
  report_review_result: ReportReviewResult,
  report_finalizer_result: ReportFinalizerResult
};
async function invokeReportTool({ tool, rawInput, onToolCall, onToolCallError, onError }) {
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
function safeParseToolCall(tool, rawInput) {
  const schema = toolSchemas[tool];
  const result = schema.safeParse(rawInput);
  if (!result.success) {
    return { success: false, message: formatZodError(tool, result.error) };
  }
  return { success: true, event: toToolCallEvent(tool, result.data) };
}
async function notifyToolCallError({ tool, rawInput, message, onToolCallError, onError }) {
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
function toToolCallEvent(tool, input) {
  switch (tool) {
    case "report_implementer_result":
      return { tool, input: ReportImplementerResult.parse(input) };
    case "report_review_result":
      return { tool, input: ReportReviewResult.parse(input) };
    case "report_finalizer_result":
      return { tool, input: ReportFinalizerResult.parse(input) };
  }
}
function formatZodError(tool, error) {
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
function toolError(code, message) {
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

// ../mcp-server/dist/server.js
var serverInfo = {
  name: "@looping-agent/mcp-server",
  version: "0.0.0"
};
var standaloneScriptPath = fileURLToPath(new URL("../bin/standalone.mjs", import.meta.url));
function createMcpServer(options) {
  let activeServer;
  const toolCallListeners = /* @__PURE__ */ new Set([options.onToolCall]);
  const toolCallErrorListeners = /* @__PURE__ */ new Set();
  const createTransport = options.transportFactory;
  if (options.onToolCallError) {
    toolCallErrorListeners.add(options.onToolCallError);
  }
  const dispatchToolCall = async (evt) => {
    for (const listener of toolCallListeners) {
      await listener(evt);
    }
  };
  const dispatchToolCallError = async (evt) => {
    for (const listener of toolCallErrorListeners) {
      await listener(evt);
    }
  };
  return {
    async start() {
      if (activeServer !== void 0 || createTransport === void 0) {
        return;
      }
      const server = createConfiguredServer(options, dispatchToolCall, dispatchToolCallError);
      const transport = createTransport();
      transport.onerror = (err) => {
        options.onError?.(err);
      };
      try {
        await server.connect(transport);
        activeServer = server;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        options.onError?.(error);
        await transport.close().catch((closeErr) => {
          options.onError?.(closeErr instanceof Error ? closeErr : new Error(String(closeErr)));
        });
        throw error;
      }
    },
    async stop() {
      const server = activeServer;
      activeServer = void 0;
      if (server === void 0) {
        return;
      }
      try {
        await server.close();
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        options.onError?.(error);
      }
    },
    getServerConfig() {
      return {
        name: serverInfo.name,
        command: process.execPath,
        args: [standaloneScriptPath],
        env: []
      };
    },
    addToolCallListener(listener) {
      toolCallListeners.add(listener);
      return () => {
        toolCallListeners.delete(listener);
      };
    },
    addToolCallErrorListener(listener) {
      toolCallErrorListeners.add(listener);
      return () => {
        toolCallErrorListeners.delete(listener);
      };
    }
  };
}
function createConfiguredServer(options, onToolCall, onToolCallError) {
  const server = new McpServer(serverInfo, {
    capabilities: {
      tools: {}
    }
  });
  server.registerTool("report_implementer_result", {
    description: "Reports the implementer phase outcome to the local orchestrator.",
    inputSchema: ReportImplementerResult
  }, (rawInput) => invokeReportTool({
    tool: "report_implementer_result",
    rawInput,
    onToolCall,
    onToolCallError,
    onError: options.onError
  }));
  server.registerTool("report_review_result", {
    description: "Reports the review phase outcome and quality issues to the local orchestrator.",
    inputSchema: ReportReviewResult
  }, (rawInput) => invokeReportTool({
    tool: "report_review_result",
    rawInput,
    onToolCall,
    onToolCallError,
    onError: options.onError
  }));
  server.registerTool("report_finalizer_result", {
    description: "Reports the finalizer phase commit and cleanup outcome to the local orchestrator.",
    inputSchema: ReportFinalizerResult
  }, (rawInput) => invokeReportTool({
    tool: "report_finalizer_result",
    rawInput,
    onToolCall,
    onToolCallError,
    onError: options.onError
  }));
  return server;
}

// src/mcp-standalone.ts
var handle = createMcpServer({
  onToolCall: () => void 0,
  onError: (error) => {
    process.stderr.write(`${error.message}
`);
  },
  transportFactory: () => new StdioServerTransport()
});
var shutdown = async (exitCode = 0) => {
  await handle.stop().catch(() => void 0);
  process.exit(exitCode);
};
process.once("SIGINT", () => {
  void shutdown(0);
});
process.once("SIGTERM", () => {
  void shutdown(0);
});
process.on("unhandledRejection", (error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}
`);
  void shutdown(1);
});
process.on("uncaughtException", (error) => {
  process.stderr.write(`${error.stack ?? error.message}
`);
  void shutdown(1);
});
await handle.start();
//# sourceMappingURL=standalone.mjs.map
