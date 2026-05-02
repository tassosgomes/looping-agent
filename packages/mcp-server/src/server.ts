import { fileURLToPath } from "node:url";

import type { McpServer as AcpMcpServer } from "@agentclientprotocol/sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ReportFinalizerResult,
  ReportImplementerResult,
  ReportReviewResult
} from "@looping-agent/schemas";

import { invokeReportTool } from "./tool-handlers.js";
import type {
  CreateMcpServerOptions,
  McpServerHandle,
  OnToolCall,
  OnToolCallError
} from "./types.js";

const serverInfo = {
  name: "@looping-agent/mcp-server",
  version: "0.0.0"
} as const;

const standaloneScriptPath = fileURLToPath(new URL("../bin/standalone.mjs", import.meta.url));

export function createMcpServer(options: CreateMcpServerOptions): McpServerHandle {
  let activeServer: McpServer | undefined;
  const toolCallListeners = new Set<OnToolCall>([options.onToolCall]);
  const toolCallErrorListeners = new Set<OnToolCallError>();
  const createTransport = options.transportFactory;

  if (options.onToolCallError) {
    toolCallErrorListeners.add(options.onToolCallError);
  }

  const dispatchToolCall: OnToolCall = async (evt) => {
    for (const listener of toolCallListeners) {
      await listener(evt);
    }
  };

  const dispatchToolCallError: OnToolCallError = async (evt) => {
    for (const listener of toolCallErrorListeners) {
      await listener(evt);
    }
  };

  return {
    async start(): Promise<void> {
      if (activeServer !== undefined || createTransport === undefined) {
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
        await transport.close().catch((closeErr: unknown) => {
          options.onError?.(closeErr instanceof Error ? closeErr : new Error(String(closeErr)));
        });
        throw error;
      }
    },

    async stop(): Promise<void> {
      const server = activeServer;
      activeServer = undefined;

      if (server === undefined) {
        return;
      }

      try {
        await server.close();
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        options.onError?.(error);
      }
    },

    getServerConfig(): AcpMcpServer {
      return {
        name: serverInfo.name,
        command: process.execPath,
        args: [standaloneScriptPath],
        env: []
      };
    },

    addToolCallListener(listener: OnToolCall): () => void {
      toolCallListeners.add(listener);

      return () => {
        toolCallListeners.delete(listener);
      };
    },

    addToolCallErrorListener(listener: OnToolCallError): () => void {
      toolCallErrorListeners.add(listener);

      return () => {
        toolCallErrorListeners.delete(listener);
      };
    }
  };
}

function createConfiguredServer(
  options: CreateMcpServerOptions,
  onToolCall: OnToolCall,
  onToolCallError: OnToolCallError
): McpServer {
  const server = new McpServer(serverInfo, {
    capabilities: {
      tools: {}
    }
  });

  server.registerTool(
    "report_implementer_result",
    {
      description: "Reports the implementer phase outcome to the local orchestrator.",
      inputSchema: ReportImplementerResult
    },
    (rawInput) =>
      invokeReportTool({
        tool: "report_implementer_result",
        rawInput,
        onToolCall,
        onToolCallError,
        onError: options.onError
      })
  );

  server.registerTool(
    "report_review_result",
    {
      description: "Reports the review phase outcome and quality issues to the local orchestrator.",
      inputSchema: ReportReviewResult
    },
    (rawInput) =>
      invokeReportTool({
        tool: "report_review_result",
        rawInput,
        onToolCall,
        onToolCallError,
        onError: options.onError
      })
  );

  server.registerTool(
    "report_finalizer_result",
    {
      description: "Reports the finalizer phase commit and cleanup outcome to the local orchestrator.",
      inputSchema: ReportFinalizerResult
    },
    (rawInput) =>
      invokeReportTool({
        tool: "report_finalizer_result",
        rawInput,
        onToolCall,
        onToolCallError,
        onError: options.onError
      })
  );

  return server;
}
