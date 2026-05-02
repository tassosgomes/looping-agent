import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from "node:child_process";
import { Readable } from "node:stream";

import {
  ClientSideConnection,
  PROTOCOL_VERSION,
  ndJsonStream,
  type Client,
  type McpServer,
  type PromptResponse,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification
} from "@agentclientprotocol/sdk";

import type { AcpClient, AcpFinalResult, AcpNotification, AcpSession, AcpStopReason, AcpTokenUsage, EffortLevel } from "./acp-types.js";
import type { DetectedRuntime } from "./runtime-detector.js";

// Keep this wrapper as the only direct dependency on ACP SDK shapes so package
// or protocol-surface migrations stay localized.
type SpawnRuntime = (
  command: string,
  args: readonly string[],
  options: SpawnOptionsWithoutStdio
) => ChildProcessWithoutNullStreams;

export interface DefaultAcpClientOptions {
  spawnRuntime?: SpawnRuntime;
}

export class DefaultAcpClient implements AcpClient {
  private readonly sessions = new Set<DefaultAcpSession>();
  private disposed = false;
  private readonly spawnRuntime: SpawnRuntime;

  constructor(options: DefaultAcpClientOptions = {}) {
    this.spawnRuntime = options.spawnRuntime ?? spawn;
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    await Promise.all([...this.sessions].map(async (session) => session.close()));
  }

  async openSession(opts: {
    runtime: DetectedRuntime;
    mcpServer: McpServer;
    cwd?: string;
    signal?: AbortSignal;
    model?: string;
    effort?: EffortLevel;
  }): Promise<AcpSession> {
    if (this.disposed) {
      throw new Error("Cannot open an ACP session because the client has already been disposed.");
    }

    throwIfAborted(opts.signal);

    const runtimeArgs = buildRuntimeArgs(opts.runtime, opts.mcpServer, {
      ...(opts.model !== undefined ? { model: opts.model } : {}),
      ...(opts.effort !== undefined ? { effort: opts.effort } : {})
    });
    const child = this.spawnRuntime(opts.runtime.path, runtimeArgs, {
      cwd: opts.cwd ?? process.cwd(),
      stdio: ["pipe", "pipe", "pipe"]
    });
    const childExit = createChildExitPromise(child, opts.runtime);
    const notifications = new Set<(notification: AcpNotification) => void>();
    const client = new OrchestratorAcpPeer(notifications);
    const input = writableToWeb(child.stdin);
    const output = Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>;
    const connection = new ClientSideConnection(() => client, ndJsonStream(input, output));

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      if (process.env.LOOPING_AGENT_DEBUG_ACP === "1") {
        process.stderr.write(chunk);
      }
    });

    try {
      await raceWithAbort(
        raceProcessExit(
        connection.initialize({
          protocolVersion: PROTOCOL_VERSION,
          clientCapabilities: {}
        }),
        childExit
      ),
        opts.signal,
        async () => terminateChild(child)
      );

      const session = await raceWithAbort(
        raceProcessExit(
        connection.newSession({
          cwd: opts.cwd ?? process.cwd(),
          mcpServers: [opts.mcpServer]
        }),
        childExit
      ),
        opts.signal,
        async () => terminateChild(child)
      );

      const acpSession = new DefaultAcpSession(
        connection,
        session.sessionId,
        notifications,
        child,
        childExit,
        () => {
          this.sessions.delete(acpSession);
        }
      );
      this.sessions.add(acpSession);

      return acpSession;
    } catch (error) {
      await terminateChild(child);

      if (isAbortError(error)) {
        throw error;
      }

      throw wrapRuntimeError(opts.runtime, error);
    }
  }
}

class DefaultAcpSession implements AcpSession {
  private finalPromise: Promise<AcpFinalResult> | null = null;
  private closed = false;

  constructor(
    private readonly connection: ClientSideConnection,
    private readonly sessionId: string,
    private readonly notifications: Set<(notification: AcpNotification) => void>,
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly childExit: Promise<never>,
    private readonly onClosed: () => void
  ) {}

  sendPrompt(text: string): Promise<void> {
    if (this.closed) {
      throw new Error("Cannot send prompt because the ACP session is already closed.");
    }

    if (this.finalPromise) {
      throw new Error("Cannot send a second prompt on the same ACP session.");
    }

    this.finalPromise = raceProcessExit(
      this.connection.prompt({
        sessionId: this.sessionId,
        prompt: [{ type: "text", text }]
      }),
      this.childExit
    )
      .then(toFinalResult)
      .catch((error: unknown) => {
        throw error instanceof Error ? error : new Error(String(error));
      });

    return Promise.resolve();
  }

  onNotification(cb: (notification: AcpNotification) => void): void {
    this.notifications.add(cb);
  }

  async awaitFinal(): Promise<AcpFinalResult> {
    if (!this.finalPromise) {
      throw new Error("Cannot await final ACP result before sendPrompt() is called.");
    }

    try {
      return await this.finalPromise;
    } finally {
      await this.close();
    }
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.notifications.clear();
    await terminateChild(this.child);
    this.onClosed();
  }
}

class OrchestratorAcpPeer implements Client {
  constructor(private readonly listeners: Set<(notification: AcpNotification) => void>) {}

  requestPermission(params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    const option = params.options.find((item) => item.kind === "allow_once") ?? params.options[0];

    if (!option) {
      return Promise.resolve({ outcome: { outcome: "cancelled" } });
    }

    return Promise.resolve({ outcome: { outcome: "selected", optionId: option.optionId } });
  }

  sessionUpdate(params: SessionNotification): Promise<void> {
    const notification = toAcpNotification(params);

    if (!notification) {
      return Promise.resolve();
    }

    for (const listener of this.listeners) {
      listener(notification);
    }

    return Promise.resolve();
  }
}

function toAcpNotification(params: SessionNotification): AcpNotification | null {
  const update = params.update;

  switch (update.sessionUpdate) {
    case "plan":
      return { type: "plan", content: update.entries };
    case "agent_message_chunk":
      return { type: "agent_message_chunk", text: contentBlockToText(update.content) };
    case "tool_call":
      return {
        type: "tool_call",
        id: update.toolCallId,
        name: update.title,
        input: update.rawInput ?? null
      };
    case "tool_call_update": {
      const base = {
        type: "tool_call_update" as const,
        id: update.toolCallId,
        status: update.status ?? "pending"
      };

      return update.rawOutput === undefined ? base : { ...base, output: update.rawOutput };
    }
    default:
      return null;
  }
}

function contentBlockToText(content: SessionNotification["update"] extends infer Update
  ? Update extends { content: infer Content }
    ? Content
    : never
  : never): string {
  if (isTextContentBlock(content)) {
    return typeof content.text === "string" ? content.text : "";
  }

  return "";
}

function isTextContentBlock(value: unknown): value is { type: "text"; text?: unknown } {
  return isRecord(value) && value.type === "text";
}

function toFinalResult(response: PromptResponse): AcpFinalResult {
  return {
    stopReason: normalizeStopReason(response.stopReason),
    tokens: parseTokenUsage(response._meta)
  };
}

function normalizeStopReason(stopReason: PromptResponse["stopReason"]): AcpStopReason {
  return stopReason === "cancelled" ? "error" : stopReason;
}

function parseTokenUsage(meta: unknown): AcpTokenUsage | null {
  if (!isRecord(meta)) {
    return null;
  }

  const direct = readTokenPair(meta.tokens);
  const usage = readTokenPair(meta.usage);

  return direct ?? usage;
}

function readTokenPair(value: unknown): AcpTokenUsage | null {
  if (!isRecord(value)) {
    return null;
  }

  const input = readNumber(value, ["input", "inputTokens", "input_tokens"]);
  const output = readNumber(value, ["output", "outputTokens", "output_tokens"]);

  return input === null || output === null ? null : { input, output };
}

function readNumber(record: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createChildExitPromise(child: ChildProcessWithoutNullStreams, runtime: DetectedRuntime): Promise<never> {
  return new Promise((_, reject) => {
    child.on("error", (error) => {
      reject(wrapRuntimeError(runtime, error));
    });
    child.on("exit", (code, signal) => {
      const exitCode = code === null ? "null" : String(code);
      const exitSignal = signal ?? "null";

      reject(
        new Error(
          `ACP runtime ${runtime.kind} exited before completing the session (code=${exitCode}, signal=${exitSignal}). Check that ${runtime.binary} is installed, authenticated, and supports ACP stdio.`
        )
      );
    });
  });
}

function writableToWeb(writable: ChildProcessWithoutNullStreams["stdin"]): WritableStream<Uint8Array> {
  return new WritableStream<Uint8Array>({
    write(chunk) {
      return new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => {
          writable.off("drain", onDrain);
          reject(error);
        };
        const onDrain = () => {
          writable.off("error", onError);
          resolve();
        };
        const flushed = writable.write(Buffer.from(chunk));

        if (flushed) {
          resolve();
          return;
        }

        writable.once("drain", onDrain);
        writable.once("error", onError);
      });
    },
    close() {
      writable.end();
    },
    abort() {
      writable.destroy();
    }
  });
}

async function raceProcessExit<T>(operation: Promise<T>, childExit: Promise<never>): Promise<T> {
  return Promise.race([operation, childExit]);
}

async function raceWithAbort<T>(
  operation: Promise<T>,
  signal: AbortSignal | undefined,
  onAbort?: () => Promise<void> | void
): Promise<T> {
  if (!signal) {
    return operation;
  }

  if (signal.aborted) {
    await onAbort?.();
    throw createAbortError();
  }

  return new Promise<T>((resolve, reject) => {
    const abortHandler = () => {
      void Promise.resolve(onAbort?.())
        .catch(() => undefined)
        .finally(() => {
          cleanup();
          reject(createAbortError());
        });
    };

    const cleanup = () => {
      signal.removeEventListener("abort", abortHandler);
    };

    signal.addEventListener("abort", abortHandler, { once: true });
    operation.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    );
  });
}

async function terminateChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.killed || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 1_000);
    child.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill();
  });
}

interface RuntimeOverrides {
  model?: string;
  effort?: EffortLevel;
}

function buildRuntimeArgs(
  runtime: DetectedRuntime,
  mcpServer: McpServer,
  overrides: RuntimeOverrides = {}
): string[] {
  const args = [...runtime.args];

  if (runtime.kind === "copilot-acp" && "command" in mcpServer) {
    // Copilot ACP ignores the per-session `mcpServers` field from ACP `newSession`;
    // it only loads MCP servers from `~/.copilot/mcp-config.json` or `--additional-mcp-config`.
    // Inject the loop's MCP server via that flag so the completion tools are exposed.
    const additionalConfig = {
      mcpServers: {
        [toCopilotServerKey(mcpServer.name)]: {
          type: "local",
          command: mcpServer.command,
          args: [...mcpServer.args],
          env: envArrayToRecord(mcpServer.env),
          tools: ["*"]
        }
      }
    };

    args.push(
      "--additional-mcp-config",
      JSON.stringify(additionalConfig),
      "--allow-all-tools"
    );
  }

  if (runtime.kind === "codex-acp" && "command" in mcpServer) {
    // codex-acp also ignores the per-session `mcpServers` field — it only reads
    // `~/.codex/config.toml`. Use its `-c key=value` overrides (TOML-encoded
    // values) to register the loop's MCP server for this session only.
    const key = toCodexServerKey(mcpServer.name);
    args.push(
      "-c", `mcp_servers.${key}.command=${tomlString(mcpServer.command)}`,
      "-c", `mcp_servers.${key}.args=${tomlStringArray(mcpServer.args)}`
    );
    if (mcpServer.env && mcpServer.env.length > 0) {
      args.push("-c", `mcp_servers.${key}.env=${tomlInlineTable(envArrayToRecord(mcpServer.env))}`);
    }
  }

  if (overrides.model !== undefined) {
    if (runtime.kind === "codex-acp") {
      // codex-acp takes the model via TOML config override.
      args.push("-c", `model=${tomlString(overrides.model)}`);
    } else {
      args.push("--model", overrides.model);
    }
  }

  // `--effort` is only supported by Copilot CLI today. Codex CLI selects effort
  // via the model name itself, and Claude Code does not expose a comparable flag.
  if (overrides.effort !== undefined && runtime.kind === "copilot-acp") {
    args.push("--effort", overrides.effort);
  }

  return args;
}

function toCodexServerKey(name: string): string {
  // TOML bare keys allow [A-Za-z0-9_-] only.
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function tomlStringArray(values: readonly string[]): string {
  return `[${values.map(tomlString).join(", ")}]`;
}

function tomlInlineTable(record: Record<string, string>): string {
  const entries = Object.entries(record).map(([k, v]) => `${k} = ${tomlString(v)}`);
  return `{ ${entries.join(", ")} }`;
}

function toCopilotServerKey(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

function envArrayToRecord(env: { name: string; value: string }[] | undefined): Record<string, string> {
  if (!env) {
    return {};
  }

  const record: Record<string, string> = {};
  for (const entry of env) {
    record[entry.name] = entry.value;
  }
  return record;
}

function wrapRuntimeError(runtime: DetectedRuntime, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);

  return new Error(
    `Failed to start or communicate with ACP runtime ${runtime.kind} at ${runtime.path}. ${message} Remediation: verify the binary is executable, run '${runtime.binary} --version', authenticate the CLI, and ensure ACP mode is supported.`
  );
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function createAbortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
