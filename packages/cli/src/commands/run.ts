import { basename, join, resolve } from "node:path";

import {
  DefaultTasksReader,
  runLoop,
  type AcpNotification,
  type EffortLevel,
  type ProgressEvent,
  type RunResult,
  type RuntimeKind
} from "@looping-agent/orchestrator";

import {
  EXIT_HALT_CONTRACT,
  EXIT_HALT_NO_COMMIT,
  EXIT_HALT_RETRIES,
  EXIT_NO_TASKS_MD,
  EXIT_RUNTIME_UNAVAILABLE
} from "../exit-codes.js";
import { createTerminalUi } from "../renderer/terminal-ui.js";
import type { SpinnerFactory, TerminalUi } from "../renderer/types.js";

import {
  errorMessage,
  pathExists,
  resolveCommandContext,
  writeLine,
  type CommandRuntimeOptions
} from "./shared.js";

interface TasksReaderLike {
  listAll(): Promise<{ number: number; title: string; status: "pending" | "in_progress" | "completed" }[]>;
}

interface SignalSource {
  on(event: "SIGINT", listener: () => void): unknown;
  off?(event: "SIGINT", listener: () => void): unknown;
  removeListener?(event: "SIGINT", listener: () => void): unknown;
}

export interface RunCommandOptions extends CommandRuntimeOptions {
  prdDir?: string;
  maxRetries?: number;
  runtime?: RuntimeKind;
  model?: string;
  effort?: EffortLevel;
  verbose?: boolean;
  debug?: boolean;
  env?: NodeJS.ProcessEnv;
  spinnerFactory?: SpinnerFactory;
  signal?: AbortSignal;
  signalSource?: SignalSource;
  runLoop?: typeof runLoop;
  createTerminalUi?: (options?: Parameters<typeof createTerminalUi>[0]) => TerminalUi;
  createTasksReader?: (tasksFilePath: string) => TasksReaderLike;
}

export async function runRun(options: RunCommandOptions = {}): Promise<number> {
  const { projectDir, stdout, stderr } = resolveCommandContext(options);
  const prdDirInput = options.prdDir?.trim();

  if (!prdDirInput) {
    writeLine(stderr, "Missing required option --prd-dir <path>.");
    return EXIT_NO_TASKS_MD;
  }

  const prdDir = resolve(projectDir, prdDirInput);
  const tasksFilePath = join(prdDir, "tasks.md");

  if (!await pathExists(tasksFilePath)) {
    writeLine(stderr, `Could not find ${tasksFilePath}.`);
    writeLine(stderr, `Suggested command: verify ${prdDir} contains tasks.md before rerunning looping-agent run --prd-dir ${prdDirInput}`);
    return EXIT_NO_TASKS_MD;
  }

  const createTasksReaderFn = options.createTasksReader ?? ((tasksPath: string) => new DefaultTasksReader(tasksPath));
  let tasksTotal = 0;

  try {
    const tasks = await createTasksReaderFn(tasksFilePath).listAll();
    tasksTotal = tasks.filter((task) => task.status !== "completed").length;
  } catch (error) {
    writeLine(stderr, `Could not read ${tasksFilePath}: ${errorMessage(error)}`);
    writeLine(stderr, `Suggested command: inspect ${tasksFilePath} and fix the task list before rerunning looping-agent run --prd-dir ${prdDirInput}`);
    return EXIT_NO_TASKS_MD;
  }

  const createTerminalUiFn = options.createTerminalUi ?? createTerminalUi;
  const ui = createTerminalUiFn({
    stream: stdout as NodeJS.WriteStream,
    isTTY: Boolean(stdout.isTTY),
    ...(options.noColor !== undefined ? { noColor: options.noColor } : {}),
    ...(options.debug !== undefined ? { debug: options.debug } : {}),
    ...(options.env !== undefined ? { env: options.env } : {}),
    ...(options.spinnerFactory ? { spinnerFactory: options.spinnerFactory } : {})
  });

  ui.runStarted({
    prdSlug: basename(prdDir),
    tasksTotal
  });

  const runLoopFn = options.runLoop ?? runLoop;
  const verbose = options.verbose === true || options.debug === true;
  const interruptController = new AbortController();
  const signal = options.signal === undefined
    ? interruptController.signal
    : AbortSignal.any([options.signal, interruptController.signal]);
  const signalSource = options.signalSource ?? process;
  let interrupted = false;

  const handleSigint = (): void => {
    if (interrupted) {
      return;
    }

    interrupted = true;
    interruptController.abort();
    ui.halt({ reason: "interrupted" });
  };

  attachSigintHandler(signalSource, handleSigint);

  try {
    const result = await runLoopFn({
      prdDir,
      ...(options.maxRetries !== undefined ? { maxRetries: options.maxRetries } : {}),
      ...(options.runtime !== undefined ? { preferredRuntime: options.runtime } : {}),
      ...(options.model !== undefined ? { model: options.model } : {}),
      ...(options.effort !== undefined ? { effort: options.effort } : {}),
      signal,
      onProgress: (event) => {
        if (verbose) {
          writeLine(stderr, formatVerboseEvent(event));
        }

        renderProgressEvent(ui, event, options.maxRetries ?? 3);
      }
    });

    if (result.status === "halted") {
      ui.halt({ reason: result.haltReason ?? "halted" });
    }

    ui.runEnded({
      status: result.status,
      summaryPath: result.summaryPath
    });

    return mapRunResultToExitCode(result);
  } catch (error) {
    if (isAbortError(error)) {
      return 130;
    }

    if (isRuntimeUnavailableError(error)) {
      writeLine(stderr, errorMessage(error));
      writeLine(stderr, "Note: the selected ACP runtime is also the agent tool choice for this loop today.");
      writeLine(stderr, `Suggested command: install an ACP runtime or retry with --runtime <claude-agent-acp|codex-acp|copilot-acp>.`);
      return EXIT_RUNTIME_UNAVAILABLE;
    }

    writeLine(stderr, `Run failed for ${prdDir}: ${errorMessage(error)}`);
    return EXIT_RUNTIME_UNAVAILABLE;
  } finally {
    detachSigintHandler(signalSource, handleSigint);
  }
}

function renderProgressEvent(ui: TerminalUi, event: ProgressEvent, maxRetries: number): void {
  switch (event.type) {
    case "runtime_detected":
    case "task_skipped":
    case "mcp_restarted":
    case "run_finished":
      return;
    case "task_started":
      ui.taskStarted({
        taskNumber: event.taskNumber,
        title: event.title
      });
      return;
    case "phase_started":
      ui.phaseStarted({
        phase: event.phase,
        attempt: event.attempt,
        maxRetries
      });
      return;
    case "phase_finished":
      ui.phaseEnded({
        phase: event.phase,
        outcome: event.decision.kind
      });
      return;
    case "notification":
      ui.notification(toNotificationView(event.notification));
      return;
    case "task_finished":
      ui.taskEnded({
        taskNumber: event.taskNumber,
        status: event.status
      });
      return;
  }
}

function toNotificationView(notification: AcpNotification): AcpNotification {
  return notification;
}

function formatVerboseEvent(event: ProgressEvent): string {
  switch (event.type) {
    case "notification":
      return `[progress] ${event.phase}#${String(event.attempt)} ${JSON.stringify(event.notification)}`;
    case "task_started":
      return `[progress] task_started task=${String(event.taskNumber)} title=${JSON.stringify(event.title)}`;
    case "phase_started":
      return `[progress] phase_started task=${String(event.taskNumber)} phase=${event.phase} attempt=${String(event.attempt)}`;
    case "phase_finished":
      return `[progress] phase_finished task=${String(event.taskNumber)} phase=${event.phase} attempt=${String(event.attempt)} outcome=${event.decision.kind} stop=${event.stopReason}`;
    case "task_finished":
      return `[progress] task_finished task=${String(event.taskNumber)} status=${event.status}${event.haltReason !== undefined ? ` reason=${event.haltReason}` : ""}`;
    case "runtime_detected": {
      const parts = [
        `kind=${event.runtime.kind}`,
        `binary=${event.runtime.binary}`,
        `path=${event.runtime.path}`,
        `version=${event.runtime.version ?? "unknown"}`,
        `model=${event.model ?? "default"}`,
        `effort=${event.effort ?? "default"}`
      ];
      return `[progress] runtime_detected ${parts.join(" ")}`;
    }
    case "task_skipped":
      return `[progress] task_skipped task=${String(event.taskNumber)} title=${JSON.stringify(event.title)}`;
    case "mcp_restarted":
      return `[progress] mcp_restarted task=${String(event.taskNumber)} phase=${event.phase} attempt=${String(event.attempt)} message=${JSON.stringify(event.message)}`;
    case "run_finished":
      return `[progress] run_finished status=${event.result.status} completed=${String(event.result.tasksCompleted)} halted=${String(event.result.tasksHalted)}`;
  }
}

function mapRunResultToExitCode(result: RunResult): number {
  if (result.status === "completed") {
    return 0;
  }

  switch (result.haltReason) {
    case "retries_exhausted":
      return EXIT_HALT_RETRIES;
    case "finalizer_not_committed":
      return EXIT_HALT_NO_COMMIT;
    case "contract_violation_unrecoverable":
      return EXIT_HALT_CONTRACT;
    default:
      return EXIT_RUNTIME_UNAVAILABLE;
  }
}

function isRuntimeUnavailableError(error: unknown): boolean {
  return /No ACP runtime was detected on PATH/i.test(errorMessage(error));
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function attachSigintHandler(signalSource: SignalSource, handler: () => void): void {
  signalSource.on("SIGINT", handler);
}

function detachSigintHandler(signalSource: SignalSource, handler: () => void): void {
  if (typeof signalSource.off === "function") {
    signalSource.off("SIGINT", handler);
    return;
  }

  signalSource.removeListener?.("SIGINT", handler);
}
