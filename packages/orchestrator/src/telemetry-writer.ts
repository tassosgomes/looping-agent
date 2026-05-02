import { appendFile, mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  COMPLETION_TOOLS,
  PHASE_PIPELINE_STAGES,
  TaskTelemetry,
  type AttemptTelemetryT,
  type CompletionToolInputT,
  type PhaseNameT,
  type ReviewIssueT,
  type TaskTelemetryT,
  type TelemetryStatusT,
  type TokenUsageT
} from "@looping-agent/schemas";

import type { AcpNotification, AcpStopReason } from "./acp-types.js";
import type { PhaseAttemptSummary, TaskTelemetryHandle } from "./telemetry-types.js";

const TELEMETRY_SCHEMA_VERSION = "1.0";
const COMPLETION_TOOL_NAMES = new Set<string>(COMPLETION_TOOLS);

interface AttemptState {
  readonly attempt: number;
  readonly startedAt: string;
  readonly notificationsLogPath: string;
  readonly notificationsAbsolutePath: string;
  toolCallCount: number;
  completionToolInvoked: boolean;
  completionInput: CompletionToolInputT | null;
  tokens: TokenUsageT | null;
  stopReason: AcpStopReason | null;
  endedAt: string | null;
}

interface PhaseState {
  readonly name: PhaseNameT;
  readonly attempts: AttemptState[];
}

export class TelemetryWriter {
  constructor(private readonly prdDir: string) {}

  startTask(taskNumber: number, prdSlug: string): TaskTelemetryHandle {
    return new FileTaskTelemetryHandle(this.prdDir, taskNumber, prdSlug);
  }
}

class FileTaskTelemetryHandle implements TaskTelemetryHandle {
  private readonly taskStartedAt = timestampNow();
  private readonly telemetryDir: string;
  private readonly taskDetailDir: string;
  private readonly taskSummaryPath: string;
  private readonly phases = new Map<PhaseNameT, PhaseState>();

  private directoriesReady: Promise<void> | null = null;
  private pendingWrites: Promise<void> = Promise.resolve();
  private finalized = false;

  constructor(
    private readonly prdDir: string,
    private readonly taskNumber: number,
    private readonly prdSlug: string
  ) {
    this.telemetryDir = join(prdDir, "telemetry");
    this.taskDetailDir = join(this.telemetryDir, `${String(taskNumber)}_telemetry`);
    this.taskSummaryPath = join(this.telemetryDir, `${String(taskNumber)}_telemetry.json`);
  }

  recordPhaseStart(phase: PhaseNameT, attempt: number): void {
    this.assertOpen();

    const phaseState = this.getOrCreatePhase(phase);
    if (phaseState.attempts.some((entry) => entry.attempt === attempt)) {
      throw new Error(`Telemetry for ${phase} attempt ${String(attempt)} has already started.`);
    }

    phaseState.attempts.push({
      attempt,
      startedAt: timestampNow(),
      notificationsLogPath: this.relativeNotificationsPath(phase, attempt),
      notificationsAbsolutePath: this.absoluteNotificationsPath(phase, attempt),
      toolCallCount: 0,
      completionToolInvoked: false,
      completionInput: null,
      tokens: null,
      stopReason: null,
      endedAt: null
    });

    this.queueWrite(async () => {
      await this.ensureDirectories();
    });
  }

  recordNotification(phase: PhaseNameT, attempt: number, notif: AcpNotification): void {
    this.assertOpen();

    const attemptState = this.getAttemptState(phase, attempt);
    if (notif.type === "tool_call") {
      attemptState.toolCallCount += 1;
      if (COMPLETION_TOOL_NAMES.has(notif.name)) {
        attemptState.completionToolInvoked = true;
      }
    }

    const line = `${JSON.stringify(notif)}\n`;
    this.queueWrite(async () => {
      await this.ensureDirectories();
      await appendFile(attemptState.notificationsAbsolutePath, line, "utf8");
    });
  }

  recordPhaseEnd(phase: PhaseNameT, attempt: number, summary: PhaseAttemptSummary): void {
    this.assertOpen();

    const attemptState = this.getAttemptState(phase, attempt);
    if (attemptState.endedAt !== null) {
      throw new Error(`Telemetry for ${phase} attempt ${String(attempt)} has already ended.`);
    }

    attemptState.endedAt = timestampNow();
    attemptState.stopReason = summary.stopReason;
    attemptState.tokens = summary.tokens;
    attemptState.completionToolInvoked = summary.completionToolInvoked;
    attemptState.completionInput = summary.completionInput;
  }

  async finalize(status: TelemetryStatusT, haltReason?: string): Promise<void> {
    this.assertOpen();
    this.finalized = true;

    if (status === "halted" && (!haltReason || haltReason.trim().length === 0)) {
      throw new Error("haltReason is required when finalizing halted telemetry.");
    }

    await this.ensureDirectories();
    await this.pendingWrites;

    const taskEndedAt = timestampNow();
    const telemetry = this.buildTaskTelemetry(status, haltReason ?? null, taskEndedAt);
    TaskTelemetry.parse(telemetry);

    await writeJsonAtomically(this.taskSummaryPath, telemetry);
  }

  private buildTaskTelemetry(
    status: TelemetryStatusT,
    haltReason: string | null,
    taskEndedAt: string
  ): TaskTelemetryT {
    const phases = PHASE_PIPELINE_STAGES.flatMap((phaseName) => {
      const phaseState = this.phases.get(phaseName);
      if (!phaseState || phaseState.attempts.length === 0) {
        return [];
      }

      return [{
        name: phaseState.name,
        attempts: phaseState.attempts
          .slice()
          .sort((left, right) => left.attempt - right.attempt)
          .map((attemptState) => this.toAttemptTelemetry(attemptState, taskEndedAt))
      }];
    });

    const tokensUnavailableInAnyPhase = phases.some((phase) =>
      phase.attempts.some((attempt) => attempt.tokens_unavailable)
    );

    const reviewIssues = phases.flatMap((phase) =>
      phase.attempts.flatMap((attempt) => extractReviewIssues(attempt.completion_input))
    );

    const summary: TaskTelemetryT["summary"] = {
      total_iterations: phases.reduce((total, phase) => total + phase.attempts.length, 0),
      tokens_unavailable_in_any_phase: tokensUnavailableInAnyPhase,
      review_issues: reviewIssues
    };

    if (!tokensUnavailableInAnyPhase) {
      summary.total_tokens = phases.reduce<TokenUsageT>(
        (totals, phase) => {
          for (const attempt of phase.attempts) {
            if (attempt.tokens) {
              totals.input += attempt.tokens.input;
              totals.output += attempt.tokens.output;
            }
          }

          return totals;
        },
        { input: 0, output: 0 }
      );
    }

    return {
      telemetry_schema_version: TELEMETRY_SCHEMA_VERSION,
      task_id: this.taskNumber,
      prd_slug: this.prdSlug,
      started_at: this.taskStartedAt,
      ended_at: taskEndedAt,
      duration_ms: durationBetween(this.taskStartedAt, taskEndedAt),
      status,
      halt_reason: status === "halted" ? haltReason : null,
      phases,
      summary
    };
  }

  private toAttemptTelemetry(attemptState: AttemptState, taskEndedAt: string): AttemptTelemetryT {
    const endedAt = attemptState.endedAt ?? taskEndedAt;
    const attemptTelemetryBase = {
      attempt: attemptState.attempt,
      started_at: attemptState.startedAt,
      ended_at: endedAt,
      duration_ms: durationBetween(attemptState.startedAt, endedAt),
      stop_reason: attemptState.stopReason ?? "error",
      tokens_unavailable: attemptState.tokens === null,
      tool_call_count: attemptState.toolCallCount,
      completion_tool_invoked: attemptState.completionToolInvoked,
      completion_input: attemptState.completionInput,
      notifications_log_path: attemptState.notificationsLogPath
    };

    if (attemptState.tokens === null) {
      return attemptTelemetryBase;
    }

    return {
      ...attemptTelemetryBase,
      tokens: attemptState.tokens
    };
  }

  private getOrCreatePhase(name: PhaseNameT): PhaseState {
    const existingPhase = this.phases.get(name);
    if (existingPhase) {
      return existingPhase;
    }

    const phaseState: PhaseState = { name, attempts: [] };
    this.phases.set(name, phaseState);
    return phaseState;
  }

  private getAttemptState(phase: PhaseNameT, attempt: number): AttemptState {
    const phaseState = this.phases.get(phase);
    if (!phaseState) {
      throw new Error(`Telemetry for phase ${phase} has not started.`);
    }

    const attemptState = phaseState.attempts.find((entry) => entry.attempt === attempt);
    if (!attemptState) {
      throw new Error(`Telemetry for ${phase} attempt ${String(attempt)} has not started.`);
    }

    return attemptState;
  }

  private relativeNotificationsPath(phase: PhaseNameT, attempt: number): string {
    return `./${String(this.taskNumber)}_telemetry/${phase}-attempt-${String(attempt)}-notifications.jsonl`;
  }

  private absoluteNotificationsPath(phase: PhaseNameT, attempt: number): string {
    return join(this.taskDetailDir, `${phase}-attempt-${String(attempt)}-notifications.jsonl`);
  }

  private ensureDirectories(): Promise<void> {
    if (this.directoriesReady === null) {
      this.directoriesReady = (async () => {
        await mkdir(this.telemetryDir, { recursive: true });
        await mkdir(this.taskDetailDir, { recursive: true });
      })();
    }

    return this.directoriesReady;
  }

  private queueWrite(writeOperation: () => Promise<void>): void {
    this.pendingWrites = this.pendingWrites.then(writeOperation);
  }

  private assertOpen(): void {
    if (this.finalized) {
      throw new Error("Telemetry handle is already finalized.");
    }
  }
}

function extractReviewIssues(completionInput: CompletionToolInputT | null): ReviewIssueT[] {
  if (completionInput === null || !("issues" in completionInput)) {
    return [];
  }

  return completionInput.issues;
}

function timestampNow(): string {
  return new Date().toISOString();
}

function durationBetween(startedAt: string, endedAt: string): number {
  return Math.max(0, Date.parse(endedAt) - Date.parse(startedAt));
}

async function writeJsonAtomically(filePath: string, data: TaskTelemetryT): Promise<void> {
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}