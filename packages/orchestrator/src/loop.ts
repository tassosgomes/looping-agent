import { basename, join, resolve } from "node:path";

import { createMcpServer, type CreateMcpServerOptions, type McpServerHandle } from "@looping-agent/mcp-server";

import { DefaultAcpClient } from "./acp-client.js";
import type { AcpClient, AcpNotification, AcpStopReason, AcpTokenUsage, EffortLevel } from "./acp-types.js";
import { DefaultMemoryManager } from "./memory-manager.js";
import type { MemoryPaths } from "./memory-types.js";
import { PhaseRunner } from "./phase-runner.js";
import type { PhaseRunnerOptions, PhaseRunnerResult } from "./phase-runner-types.js";
import { buildRunSummary, persistRunSummary as persistRunSummaryFile, type RunSummary } from "./run-summary.js";
import type { PhaseName, PromptReinforcement, RetryDecision } from "./retry-types.js";
import { detectRuntime, type DetectedRuntime, type RuntimeKind } from "./runtime-detector.js";
import { DefaultTasksReader } from "./tasks-reader.js";
import type { TaskEntry } from "./tasks-reader-types.js";
import type { TaskTelemetryHandle } from "./telemetry-types.js";
import { TelemetryWriter } from "./telemetry-writer.js";

export interface RunLoopOptions {
  prdDir: string;
  maxRetries?: number;
  preferredRuntime?: RuntimeKind;
  model?: string;
  effort?: EffortLevel;
  onProgress?(event: ProgressEvent): void;
  signal?: AbortSignal;
}

export interface RunResult {
  status: "completed" | "halted";
  tasksTotal: number;
  tasksCompleted: number;
  tasksHalted: number;
  haltTaskNumber?: number;
  haltReason?: string;
  totalIterations: number;
  totalTokens: AcpTokenUsage | null;
  totalDurationMs: number;
  summaryPath: string;
}

export type ProgressEvent =
  | {
      type: "runtime_detected";
      runtime: DetectedRuntime;
      model: string | null;
      effort: EffortLevel | null;
    }
  | { type: "task_skipped"; taskNumber: number; title: string }
  | { type: "task_started"; taskNumber: number; title: string }
  | { type: "phase_started"; taskNumber: number; phase: PhaseName; attempt: number }
  | {
      type: "phase_finished";
      taskNumber: number;
      phase: PhaseName;
      attempt: number;
      decision: RetryDecision;
      stopReason: AcpStopReason;
    }
  | {
      type: "notification";
      taskNumber: number;
      phase: PhaseName;
      attempt: number;
      notification: AcpNotification;
    }
  | {
      type: "mcp_restarted";
      taskNumber: number;
      phase: PhaseName;
      attempt: number;
      message: string;
    }
  | { type: "task_finished"; taskNumber: number; status: "completed" | "halted"; haltReason?: string }
  | { type: "run_finished"; result: RunResult };

interface TasksReaderLike {
  listAll(): Promise<TaskEntry[]>;
  getTaskFile(number: number): Promise<string>;
}

interface MemoryManagerLike {
  initialize(prdDir: string): Promise<void>;
  pathsForTask(prdDir: string, taskNumber: number): Promise<MemoryPaths>;
}

interface TelemetryWriterLike {
  startTask(taskNumber: number, prdSlug: string): TaskTelemetryHandle;
}

interface PhaseRunnerLike {
  run(opts: PhaseRunnerOptions): Promise<PhaseRunnerResult>;
}

export interface RunLoopDependencies {
  detectRuntime(preferred?: RuntimeKind): Promise<DetectedRuntime>;
  createAcpClient(): AcpClient;
  createMcpServer(options: CreateMcpServerOptions): McpServerHandle;
  createPhaseRunner(): PhaseRunnerLike;
  createTasksReader(tasksFilePath: string): TasksReaderLike;
  createMemoryManager(): MemoryManagerLike;
  createTelemetryWriter(prdDir: string): TelemetryWriterLike;
  persistRunSummary(prdDir: string, summary: RunSummary): Promise<string>;
  now(): Date;
  cwd(): string;
}

interface RunAggregateState {
  tasksTotal: number;
  tasksCompleted: number;
  tasksHalted: number;
  haltTaskNumber?: number;
  haltReason?: string;
  totalIterations: number;
  totalTokens: AcpTokenUsage;
  tokensAvailable: boolean;
}

const DEFAULT_MAX_RETRIES = 3;

const defaultDependencies: RunLoopDependencies = {
  detectRuntime,
  createAcpClient: () => new DefaultAcpClient(),
  createMcpServer,
  createPhaseRunner: () => new PhaseRunner(),
  createTasksReader: (tasksFilePath) => new DefaultTasksReader(tasksFilePath),
  createMemoryManager: () => new DefaultMemoryManager(),
  createTelemetryWriter: (prdDir) => new TelemetryWriter(prdDir),
  persistRunSummary: persistRunSummaryFile,
  now: () => new Date(),
  cwd: () => process.cwd()
};

export async function runLoop(opts: RunLoopOptions): Promise<RunResult> {
  return runLoopWithDependencies(opts, defaultDependencies);
}

export async function runLoopWithDependencies(
  opts: RunLoopOptions,
  deps: RunLoopDependencies
): Promise<RunResult> {
  const prdDir = resolve(opts.prdDir);
  const prdSlug = basename(prdDir);
  const maxRetries = normalizeMaxRetries(opts.maxRetries);
  const aggregate: RunAggregateState = {
    tasksTotal: 0,
    tasksCompleted: 0,
    tasksHalted: 0,
    totalIterations: 0,
    totalTokens: { input: 0, output: 0 },
    tokensAvailable: true
  };
  const runStartedAt = deps.now().toISOString();
  const tasksReader = deps.createTasksReader(join(prdDir, "tasks.md"));
  const memoryManager = deps.createMemoryManager();
  const telemetryWriter = deps.createTelemetryWriter(prdDir);
  const phaseRunner = deps.createPhaseRunner();

  let acpClient: AcpClient | null = null;
  let mcpHandle: McpServerHandle | null = null;
  let lastMcpError: Error | null = null;

  const startMcpServer = async (): Promise<McpServerHandle> => {
    lastMcpError = null;

    const handle = deps.createMcpServer({
      onToolCall: () => undefined,
      onError: (error) => {
        lastMcpError = error;
      }
    });

    await handle.start();
    return handle;
  };

  try {
    throwIfAborted(opts.signal);
    const runtime = await deps.detectRuntime(opts.preferredRuntime);
    opts.onProgress?.({
      type: "runtime_detected",
      runtime,
      model: opts.model ?? null,
      effort: opts.effort ?? null
    });

    throwIfAborted(opts.signal);
    mcpHandle = await startMcpServer();
    acpClient = deps.createAcpClient();

    await memoryManager.initialize(prdDir);
    const allTasks = await tasksReader.listAll();
    const pendingTasks = allTasks.filter((task) => task.status !== "completed");
    aggregate.tasksTotal = pendingTasks.length;

    for (const task of allTasks) {
      if (task.status === "completed") {
        opts.onProgress?.({ type: "task_skipped", taskNumber: task.number, title: task.title });
      }
    }

    taskLoop:
    for (const task of pendingTasks) {
      throwIfAborted(opts.signal);

      const memoryPaths = await memoryManager.pathsForTask(prdDir, task.number);
      const taskContent = await tasksReader.getTaskFile(task.number);
      const telemetryHandle = telemetryWriter.startTask(task.number, prdSlug);
      const attemptByPhase: Record<PhaseName, number> = {
        implementer: 1,
        reviewer: 1,
        finalizer: 1
      };
      let reinforcementByPhase: Partial<Record<PhaseName, PromptReinforcement>> = {};
      let currentPhase: PhaseName = "implementer";
      let taskFinalized = false;

      opts.onProgress?.({ type: "task_started", taskNumber: task.number, title: task.title });

      try {
        while (!taskFinalized) {
          throwIfAborted(opts.signal);

          const attempt = attemptByPhase[currentPhase];
          const reinforcement = reinforcementByPhase[currentPhase];
          lastMcpError = null;
          opts.onProgress?.({
            type: "phase_started",
            taskNumber: task.number,
            phase: currentPhase,
            attempt
          });

          try {
            const result = await phaseRunner.run({
              phase: currentPhase,
              taskNumber: task.number,
              prdDir,
              taskContent,
              attempt,
              maxRetries,
              runtime,
              acpClient,
              mcpHandle,
              telemetryHandle,
              sharedMemoryPath: memoryPaths.sharedPath,
              taskMemoryPath: memoryPaths.taskPath,
              cwd: deps.cwd(),
              ...(reinforcement ? { reinforcement } : {}),
              ...(opts.signal ? { signal: opts.signal } : {}),
              ...(opts.model !== undefined ? { model: opts.model } : {}),
              ...(opts.effort !== undefined ? { effort: opts.effort } : {}),
              onNotification: (notification) => {
                opts.onProgress?.({
                  type: "notification",
                  taskNumber: task.number,
                  phase: currentPhase,
                  attempt,
                  notification
                });
              }
            });

            noteAttempt(aggregate, result.tokens);
            attemptByPhase[currentPhase] = attempt + 1;

            opts.onProgress?.({
              type: "phase_finished",
              taskNumber: task.number,
              phase: currentPhase,
              attempt,
              decision: result.decision,
              stopReason: result.stopReason
            });

            if (result.decision.kind === "advance") {
              reinforcementByPhase = clearReinforcement(reinforcementByPhase, currentPhase);

              if (currentPhase === "implementer") {
                currentPhase = "reviewer";
                continue;
              }

              if (currentPhase === "reviewer") {
                currentPhase = "finalizer";
                continue;
              }

              await telemetryHandle.finalize("completed");
              taskFinalized = true;
              aggregate.tasksCompleted += 1;
              opts.onProgress?.({ type: "task_finished", taskNumber: task.number, status: "completed" });
              continue taskLoop;
            }

            if (result.decision.kind === "halt") {
              await telemetryHandle.finalize("halted", result.decision.reason);
              taskFinalized = true;
              aggregate.tasksHalted += 1;
              aggregate.haltTaskNumber = task.number;
              aggregate.haltReason = result.decision.reason;
              opts.onProgress?.({
                type: "task_finished",
                taskNumber: task.number,
                status: "halted",
                haltReason: result.decision.reason
              });
              break taskLoop;
            }

            if (
              currentPhase === "reviewer" &&
              result.decision.reason === "review_requires_rework" &&
              result.decision.reinforcement?.kind === "rework"
            ) {
              reinforcementByPhase = {
                ...clearReinforcement(reinforcementByPhase, "reviewer"),
                implementer: result.decision.reinforcement
              };
              currentPhase = "implementer";
              continue;
            }

            if (result.decision.reinforcement) {
              reinforcementByPhase[currentPhase] = result.decision.reinforcement;
            } else {
              reinforcementByPhase = clearReinforcement(reinforcementByPhase, currentPhase);
            }
          } catch (error) {
            if (isAbortError(error)) {
              throw error;
            }

            noteAttempt(aggregate, null);

            if (isRecoverableMcpCrash(error, lastMcpError)) {
              if (attempt < maxRetries) {
                attemptByPhase[currentPhase] = attempt + 1;
                const restartMessage = getRestartMessage(lastMcpError, error);
                opts.onProgress?.({
                  type: "mcp_restarted",
                  taskNumber: task.number,
                  phase: currentPhase,
                  attempt,
                  message: restartMessage
                });
                mcpHandle = await restartMcpServer(mcpHandle, startMcpServer);
                continue;
              }

              await telemetryHandle.finalize("halted", "retries_exhausted");
              taskFinalized = true;
              aggregate.tasksHalted += 1;
              aggregate.haltTaskNumber = task.number;
              aggregate.haltReason = "retries_exhausted";
              opts.onProgress?.({
                type: "task_finished",
                taskNumber: task.number,
                status: "halted",
                haltReason: "retries_exhausted"
              });
              break taskLoop;
            }

            await telemetryHandle.finalize("failed");
            taskFinalized = true;
            throw error;
          }
        }
      } catch (error) {
          await telemetryHandle.finalize("failed");

        throw error;
      }
    }

    const runEndedAt = deps.now().toISOString();
    const runSummary = buildRunSummary({
      runStartedAt,
      runEndedAt,
      runtime: {
        kind: runtime.kind,
        binary: runtime.binary,
        path: runtime.path,
        version: runtime.version,
        model: opts.model ?? null,
        effort: opts.effort ?? null
      },
      tasksTotal: aggregate.tasksTotal,
      tasksCompleted: aggregate.tasksCompleted,
      tasksHalted: aggregate.tasksHalted,
      totalIterations: aggregate.totalIterations,
      totalTokens: aggregate.tokensAvailable ? aggregate.totalTokens : null,
      ...(aggregate.haltTaskNumber !== undefined ? { haltTaskNumber: aggregate.haltTaskNumber } : {}),
      ...(aggregate.haltReason !== undefined ? { haltReason: aggregate.haltReason } : {})
    });
    const summaryPath = await deps.persistRunSummary(prdDir, runSummary);
    const result: RunResult = {
      status: aggregate.tasksHalted > 0 ? "halted" : "completed",
      tasksTotal: runSummary.tasks_total,
      tasksCompleted: runSummary.tasks_completed,
      tasksHalted: runSummary.tasks_halted,
      totalIterations: runSummary.total_iterations,
      totalTokens: runSummary.total_tokens,
      totalDurationMs: runSummary.total_duration_ms,
      summaryPath,
      ...(runSummary.halt_task_number !== null ? { haltTaskNumber: runSummary.halt_task_number } : {}),
      ...(runSummary.halt_reason !== null ? { haltReason: runSummary.halt_reason } : {})
    };

    opts.onProgress?.({ type: "run_finished", result });
    return result;
  } finally {
    if (mcpHandle) {
      await mcpHandle.stop();
    }

    if (acpClient) {
      await acpClient.dispose();
    }
  }
}

function normalizeMaxRetries(maxRetries: number | undefined): number {
  const normalized = maxRetries ?? DEFAULT_MAX_RETRIES;

  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new Error("maxRetries must be a positive integer.");
  }

  return normalized;
}

function noteAttempt(state: RunAggregateState, tokens: AcpTokenUsage | null): void {
  state.totalIterations += 1;

  if (tokens === null) {
    state.tokensAvailable = false;
    return;
  }

  if (!state.tokensAvailable) {
    return;
  }

  state.totalTokens.input += tokens.input;
  state.totalTokens.output += tokens.output;
}

function clearReinforcement(
  reinforcements: Partial<Record<PhaseName, PromptReinforcement>>,
  phase: PhaseName
): Partial<Record<PhaseName, PromptReinforcement>> {
  switch (phase) {
    case "implementer":
      return buildReinforcements(undefined, reinforcements.reviewer, reinforcements.finalizer);
    case "reviewer":
      return buildReinforcements(reinforcements.implementer, undefined, reinforcements.finalizer);
    case "finalizer":
      return buildReinforcements(reinforcements.implementer, reinforcements.reviewer, undefined);
  }
}

function buildReinforcements(
  implementer: PromptReinforcement | undefined,
  reviewer: PromptReinforcement | undefined,
  finalizer: PromptReinforcement | undefined
): Partial<Record<PhaseName, PromptReinforcement>> {
  return {
    ...(implementer ? { implementer } : {}),
    ...(reviewer ? { reviewer } : {}),
    ...(finalizer ? { finalizer } : {})
  };
}

function getRestartMessage(lastMcpError: Error | null, error: unknown): string {
  if (lastMcpError instanceof Error) {
    return lastMcpError.message;
  }

  return toError(error).message;
}

async function restartMcpServer(
  currentHandle: McpServerHandle,
  startMcpServer: () => Promise<McpServerHandle>
): Promise<McpServerHandle> {
  await currentHandle.stop();
  return startMcpServer();
}

function isRecoverableMcpCrash(error: unknown, lastMcpError: Error | null): boolean {
  if (lastMcpError) {
    return true;
  }

  const message = toError(error).message;
  return /mcp/i.test(message) && /(crash|closed|disconnect|transport|tool|stdio)/i.test(message);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function createAbortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}