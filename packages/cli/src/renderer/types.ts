import type { RendererColors } from "./colors.js";

export type AcpNotificationView =
  | { type: "plan"; content: unknown }
  | { type: "agent_message_chunk"; text: string }
  | { type: "tool_call"; name: string; input: unknown; id: string }
  | { type: "tool_call_update"; id: string; status: string; output?: unknown };

export interface NotificationFormatOptions {
  colors?: RendererColors;
  debug?: boolean;
}

export interface RunStartedMeta {
  prdSlug: string;
  tasksTotal: number;
}

export interface TaskStartedMeta {
  taskNumber: number;
  title: string;
}

export interface PhaseStartedMeta {
  phase: string;
  attempt: number;
  maxRetries: number;
}

export interface PhaseEndedMeta {
  phase: string;
  outcome: "advance" | "retry" | "halt";
}

export interface TaskEndedMeta {
  taskNumber: number;
  status: "completed" | "halted";
}

export interface HaltMeta {
  reason: string;
  telemetryPath?: string;
}

export interface RunEndedMeta {
  summaryPath: string;
  status: "completed" | "halted";
}

export interface SpinnerLike {
  text: string;
  isSpinning: boolean;
  start(text?: string): SpinnerLike;
  stop(): SpinnerLike;
  succeed(text?: string): SpinnerLike;
  warn(text?: string): SpinnerLike;
  fail(text?: string): SpinnerLike;
}

export interface SpinnerFactoryOptions {
  stream: NodeJS.WriteStream;
  isEnabled: boolean;
}

export type SpinnerFactory = (options: SpinnerFactoryOptions) => SpinnerLike;

export interface TerminalUiOptions {
  noColor?: boolean;
  debug?: boolean;
  env?: NodeJS.ProcessEnv;
  isTTY?: boolean;
  stream?: NodeJS.WriteStream;
  spinnerFactory?: SpinnerFactory;
}

export interface TerminalUi {
  runStarted(meta: RunStartedMeta): void;
  taskStarted(meta: TaskStartedMeta): void;
  phaseStarted(meta: PhaseStartedMeta): void;
  notification(notification: AcpNotificationView): void;
  phaseEnded(meta: PhaseEndedMeta): void;
  taskEnded(meta: TaskEndedMeta): void;
  halt(meta: HaltMeta): void;
  runEnded(meta: RunEndedMeta): void;
}