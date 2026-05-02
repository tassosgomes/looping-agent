import { safeParseToolCall, type ToolName } from "@looping-agent/mcp-server";

import { phasePrompt, retryContractPrompt, retryReworkPrompt } from "./prompts/index.js";
import { decide } from "./retry-policy.js";
import type { AcpSession } from "./acp-types.js";
import type { CompletionInput, PhaseName, PromptReinforcement } from "./retry-types.js";
import type { PhaseRunnerOptions, PhaseRunnerResult } from "./phase-runner-types.js";

const COMPLETION_TOOL_BY_PHASE: Record<PhaseName, ToolName> = {
  implementer: "report_implementer_result",
  reviewer: "report_review_result",
  finalizer: "report_finalizer_result"
};

export class PhaseRunner {
  async run(opts: PhaseRunnerOptions): Promise<PhaseRunnerResult> {
    const startedAt = performance.now();
    const completionTool = COMPLETION_TOOL_BY_PHASE[opts.phase];
    const prompt = buildPrompt(opts, completionTool);
    const completionObserved = createDeferred();

    let completionInput: CompletionInput = null;
    let completionToolSeen = false;
    let schemaErrorMessage: string | null = null;
    let phaseEnded = false;
    let session: AcpSession | null = null;

    // Map ACP tool_call ids whose name matches the completion tool, so we can
    // recover the validated input from the matching `tool_call_update.output`
    // when the runtime did not echo rawInput on the original `tool_call`
    // notification (e.g. the Claude Code wrapper).
    const pendingCompletionCallIds = new Set<string>();

    opts.telemetryHandle.recordPhaseStart(opts.phase, opts.attempt);

    try {
      session = await raceWithAbort(
        opts.acpClient.openSession({
          runtime: opts.runtime,
          mcpServer: opts.mcpHandle.getServerConfig(),
          cwd: opts.cwd ?? process.cwd(),
          ...(opts.signal ? { signal: opts.signal } : {}),
          ...(opts.model !== undefined ? { model: opts.model } : {}),
          ...(opts.effort !== undefined ? { effort: opts.effort } : {})
        }),
        opts.signal
      );

      session.onNotification((notification) => {
        opts.telemetryHandle.recordNotification(opts.phase, opts.attempt, notification);
        opts.onNotification?.(notification);

        if (completionToolSeen) {
          return;
        }

        if (notification.type === "tool_call" && matchesCompletionTool(notification.name, completionTool)) {
          // Path 1 — Copilot-style: rawInput is included on the tool_call.
          const parsed = safeParseToolCall(completionTool, notification.input);
          if (parsed.success) {
            completionToolSeen = true;
            completionInput = parsed.event.input;
            schemaErrorMessage = null;
            completionObserved.resolve();
            return;
          }
          // Otherwise remember the call id so we can recover the input from
          // the corresponding tool_call_update.output (Claude-style).
          pendingCompletionCallIds.add(notification.id);
          if (schemaErrorMessage === null) {
            schemaErrorMessage = parsed.message;
          }
          return;
        }

        if (
          notification.type === "tool_call_update" &&
          notification.status === "completed" &&
          pendingCompletionCallIds.has(notification.id)
        ) {
          // Path 2 — Claude-style: pull the validated input back from the
          // structured payload the MCP server echoed in its response.
          const recovered = extractInputFromToolCallOutput(notification.output);
          const parsed = recovered === undefined
            ? { success: false as const, message: "MCP response did not include the validated input." }
            : safeParseToolCall(completionTool, recovered);
          if (parsed.success) {
            completionToolSeen = true;
            completionInput = parsed.event.input;
            schemaErrorMessage = null;
            completionObserved.resolve();
          } else if (schemaErrorMessage === null) {
            schemaErrorMessage = parsed.message;
          }
        }
      });

      await raceWithAbort(session.sendPrompt(prompt), opts.signal);

      const finalPromise = raceWithAbort(session.awaitFinal(), opts.signal);
      await raceWithAbort(Promise.race([finalPromise, completionObserved.promise]), opts.signal);
      const finalResult = await finalPromise;

      const decision = decide({
        phase: opts.phase,
        stopReason: finalResult.stopReason,
        completionToolSeen,
        completionInput,
        attempt: opts.attempt,
        maxRetries: opts.maxRetries,
        schemaErrorMessage
      });

      opts.telemetryHandle.recordPhaseEnd(opts.phase, opts.attempt, {
        stopReason: finalResult.stopReason,
        tokens: finalResult.tokens,
        completionToolInvoked: completionToolSeen,
        completionInput
      });
      phaseEnded = true;

      return {
        decision,
        attemptDuration_ms: elapsedMilliseconds(startedAt),
        stopReason: finalResult.stopReason,
        tokens: finalResult.tokens,
        completionToolSeen
      };
    } catch (error) {
      if (!phaseEnded) {
        opts.telemetryHandle.recordPhaseEnd(opts.phase, opts.attempt, {
          stopReason: "error",
          tokens: null,
          completionToolInvoked: completionToolSeen,
          completionInput
        });
      }

      throw error;
    } finally {
      if (session) {
        await session.close();
      }
    }
  }
}

// MCP tool responses come back through ACP as `tool_call_update.output`. The
// shape varies by runtime: a JSON string, a parsed object, or an array of
// content blocks. Extract our `{ ok, tool, input }` payload from any of them.
function extractInputFromToolCallOutput(output: unknown): unknown {
  const candidates = collectStructuredCandidates(output);
  for (const candidate of candidates) {
    if (isRecord(candidate) && candidate.ok === true && "input" in candidate) {
      return (candidate as { input: unknown }).input;
    }
  }
  return undefined;
}

function collectStructuredCandidates(output: unknown): unknown[] {
  if (output === undefined || output === null) {
    return [];
  }
  if (typeof output === "string") {
    const parsed = tryParseJson(output);
    return parsed === undefined ? [] : [parsed];
  }
  if (Array.isArray(output)) {
    return output.flatMap((item) => collectStructuredCandidates(item));
  }
  if (isRecord(output)) {
    const out: unknown[] = [output];
    // MCP CallToolResult shape — { content: [{ type: "text", text: "..." }] }
    if (Array.isArray(output.content)) {
      for (const block of output.content) {
        if (isRecord(block) && typeof block.text === "string") {
          const parsed = tryParseJson(block.text);
          if (parsed !== undefined) {
            out.push(parsed);
          }
        }
      }
    }
    if (output.structuredContent !== undefined) {
      out.push(output.structuredContent);
    }
    return out;
  }
  return [];
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ACP runtimes prefix MCP tool names with the server key in different ways:
//   - Copilot CLI:         `<server>-<tool>`        (e.g. "_looping_agent_mcp_server-report_implementer_result")
//   - Claude Code wrapper: `mcp__<server>__<tool>`  (e.g. "mcp___looping-agent_mcp-server__report_implementer_result")
//   - codex-acp wrapper:   `<server>/<tool>`        (e.g. "_looping-agent_mcp-server/report_implementer_result")
//   - bare:                `<tool>`                 (no prefix)
// Accept the bare name plus any of the prefixed forms when matching the completion tool.
function matchesCompletionTool(notificationName: string, completionTool: ToolName): boolean {
  return (
    notificationName === completionTool ||
    notificationName.endsWith(`__${completionTool}`) ||
    notificationName.endsWith(`/${completionTool}`) ||
    notificationName.endsWith(`-${completionTool}`)
  );
}

function buildPrompt(opts: PhaseRunnerOptions, completionTool: ToolName): string {
  const basePrompt = phasePrompt({
    phase: opts.phase,
    prdDir: opts.prdDir,
    taskNumber: opts.taskNumber,
    taskContent: opts.taskContent,
    sharedMemoryPath: opts.sharedMemoryPath,
    taskMemoryPath: opts.taskMemoryPath
  });

  return applyReinforcement(basePrompt, completionTool, opts.reinforcement);
}

function applyReinforcement(
  basePrompt: string,
  completionTool: ToolName,
  reinforcement: PromptReinforcement | undefined
): string {
  switch (reinforcement?.kind) {
    case "contract":
      return retryContractPrompt({ basePrompt, completionTool });
    case "rework":
      return retryReworkPrompt({ basePrompt, issues: reinforcement.issues });
    case "schema":
      return [
        `ATENCAO: Na tentativa anterior o tool ${completionTool} recebeu input invalido.`,
        "Corrija o payload para obedecer ao schema esperado pela skill.",
        `Erro retornado pelo MCP server: ${reinforcement.errorMessage}`,
        "",
        basePrompt
      ].join("\n");
    default:
      return basePrompt;
  }
}

function createDeferred(): {
  promise: Promise<void>;
  resolve(): void;
} {
  let resolvePromise!: () => void;

  return {
    promise: new Promise<void>((resolve) => {
      resolvePromise = resolve;
    }),
    resolve(): void {
      resolvePromise();
    }
  };
}

function elapsedMilliseconds(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

async function raceWithAbort<T>(operation: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) {
    return operation;
  }

  if (signal.aborted) {
    throw createAbortError();
  }

  return new Promise<T>((resolve, reject) => {
    const abortHandler = () => {
      cleanup();
      reject(createAbortError());
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

function createAbortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}
