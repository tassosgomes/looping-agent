import type { McpServer as AcpMcpServer } from "@agentclientprotocol/sdk";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
  ReportFinalizerResultT,
  ReportImplementerResultT,
  ReportReviewResultT
} from "@looping-agent/schemas";

export type ToolName =
  | "report_implementer_result"
  | "report_review_result"
  | "report_finalizer_result";

export type ToolCallEvent =
  | { tool: "report_implementer_result"; input: ReportImplementerResultT }
  | { tool: "report_review_result"; input: ReportReviewResultT }
  | { tool: "report_finalizer_result"; input: ReportFinalizerResultT };

export type OnToolCall = (evt: ToolCallEvent) => Promise<void> | void;
export type OnToolCallError = (evt: ToolCallErrorEvent) => Promise<void> | void;

export interface ToolCallErrorEvent {
  tool: ToolName;
  rawInput: unknown;
  code: "schema_validation_failed";
  message: string;
}

export interface McpServerHandle {
  start(): Promise<void>;
  stop(): Promise<void>;
  getServerConfig(): AcpMcpServer;
  addToolCallListener(listener: OnToolCall): () => void;
  addToolCallErrorListener(listener: OnToolCallError): () => void;
}

export interface CreateMcpServerOptions {
  onToolCall: OnToolCall;
  onToolCallError?: OnToolCallError;
  onError?: (err: Error) => void;
  transportFactory?: () => Transport;
}
