import type { McpServer } from "@agentclientprotocol/sdk";
import type { DetectedRuntime } from "./runtime-detector.js";

export type AcpStopReason = "end_turn" | "refusal" | "max_tokens" | "max_turn_requests" | "error";

export type AcpNotification =
  | { type: "plan"; content: unknown }
  | { type: "agent_message_chunk"; text: string }
  | { type: "tool_call"; name: string; input: unknown; id: string }
  | { type: "tool_call_update"; id: string; status: string; output?: unknown };

export interface AcpTokenUsage {
  input: number;
  output: number;
}

export interface AcpFinalResult {
  stopReason: AcpStopReason;
  tokens: AcpTokenUsage | null;
}

export interface AcpSession {
  sendPrompt(text: string): Promise<void>;
  onNotification(cb: (notification: AcpNotification) => void): void;
  awaitFinal(): Promise<AcpFinalResult>;
  close(): Promise<void>;
}

export type EffortLevel = "low" | "medium" | "high" | "xhigh";

export interface AcpClient {
  openSession(opts: {
    runtime: DetectedRuntime;
    mcpServer: McpServer;
    cwd?: string;
    signal?: AbortSignal;
    model?: string;
    effort?: EffortLevel;
  }): Promise<AcpSession>;

  dispose(): Promise<void>;
}
