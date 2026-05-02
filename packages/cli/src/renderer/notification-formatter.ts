import type { RendererColors } from "./colors.js";
import type { AcpNotificationView, NotificationFormatOptions } from "./types.js";

const DEFAULT_INLINE_LIMIT = 180;
const identity = (text: string): string => text;

export function formatPlan(
  notification: Extract<AcpNotificationView, { type: "plan" }>,
  options: NotificationFormatOptions = {}
): string {
  return `${formatLabel("plan", options.colors, "info")} ${serializeInline(notification.content, options.debug)}`;
}

export function formatAgentMessage(
  notification: Extract<AcpNotificationView, { type: "agent_message_chunk" }>,
  options: NotificationFormatOptions = {}
): string {
  return `${formatLabel("agent", options.colors, "muted")} ${serializeInline(notification.text, options.debug)}`;
}

export function formatToolCall(
  notification: Extract<AcpNotificationView, { type: "tool_call" }>,
  options: NotificationFormatOptions = {}
): string {
  return `${formatLabel("tool", options.colors, "tool")} ${notification.name} id=${notification.id} input=${serializeInline(notification.input, options.debug)}`;
}

export function formatToolCallUpdate(
  notification: Extract<AcpNotificationView, { type: "tool_call_update" }>,
  options: NotificationFormatOptions = {}
): string {
  const base = `${formatLabel("tool:update", options.colors, "warning")} id=${notification.id} status=${notification.status}`;

  if (notification.output === undefined) {
    return base;
  }

  return `${base} output=${serializeInline(notification.output, options.debug)}`;
}

export function formatNotification(notification: AcpNotificationView, options: NotificationFormatOptions = {}): string {
  switch (notification.type) {
    case "plan":
      return formatPlan(notification, options);
    case "agent_message_chunk":
      return formatAgentMessage(notification, options);
    case "tool_call":
      return formatToolCall(notification, options);
    case "tool_call_update":
      return formatToolCallUpdate(notification, options);
  }
}

function formatLabel(
  name: string,
  colors: RendererColors | undefined,
  colorKey: "info" | "muted" | "tool" | "warning"
): string {
  return colorizeLabel(colors, colorKey, `[${name}]`);
}

function colorizeLabel(
  colors: RendererColors | undefined,
  colorKey: "info" | "muted" | "tool" | "warning",
  text: string
): string {
  if (colors === undefined) {
    return identity(text);
  }

  switch (colorKey) {
    case "info":
      return colors.info(text);
    case "muted":
      return colors.muted(text);
    case "tool":
      return colors.tool(text);
    case "warning":
      return colors.warning(text);
  }
}

function serializeInline(value: unknown, debug = false): string {
  const rendered = stringifyValue(value);

  if (debug || rendered.length <= DEFAULT_INLINE_LIMIT) {
    return rendered;
  }

  return `${rendered.slice(0, DEFAULT_INLINE_LIMIT - 3)}...`;
}

function stringifyValue(value: unknown): string {
  if (typeof value === "string") {
    return normalizeWhitespace(value);
  }

  if (value === undefined || typeof value === "function" || typeof value === "symbol") {
    return "undefined";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}