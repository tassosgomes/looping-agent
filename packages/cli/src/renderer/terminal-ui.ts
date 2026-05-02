import ora from "ora";

import { createColors } from "./colors.js";
import { formatNotification } from "./notification-formatter.js";
import type {
  PhaseEndedMeta,
  PhaseStartedMeta,
  SpinnerFactory,
  SpinnerLike,
  TerminalUi,
  TerminalUiOptions
} from "./types.js";

interface ActivePhaseState {
  phase: string;
  attempt: number;
  maxRetries: number;
}

type AgentMessageNotification = Extract<Parameters<TerminalUi["notification"]>[0], { type: "agent_message_chunk" }>;

export function createTerminalUi(options: TerminalUiOptions = {}): TerminalUi {
  const stream = options.stream ?? process.stdout;
  const isTTY = options.isTTY ?? Boolean(stream.isTTY);
  const colors = createColors({
    isTTY,
    ...(options.noColor !== undefined ? { noColor: options.noColor } : {}),
    ...(options.env !== undefined ? { env: options.env } : {})
  });
  const spinnerFactory = options.spinnerFactory ?? defaultSpinnerFactory;
  const spinner = spinnerFactory({ stream, isEnabled: isTTY });

  let activePhase: ActivePhaseState | null = null;
  let pendingAgentMessage: AgentMessageNotification | null = null;

  const flushPendingAgentMessage = (): void => {
    if (pendingAgentMessage === null) {
      return;
    }

    const line = `  ${formatNotification(pendingAgentMessage, {
      colors,
      ...(options.debug !== undefined ? { debug: options.debug } : {})
    })}`;

    pendingAgentMessage = null;

    withSpinnerPause(spinner, activePhase, colors, () => {
      writeLine(stream, line);
    });
  };

  return {
    runStarted(meta) {
      flushPendingAgentMessage();
      stopSpinner(spinner);
      writeLine(stream, `${colors.bold("Looping Agent")} ${colors.muted(meta.prdSlug)}`);
      writeLine(stream, `${colors.info("Run")} tasks=${String(meta.tasksTotal)}`);
    },

    taskStarted(meta) {
      flushPendingAgentMessage();
      stopSpinner(spinner);
      writeLine(stream, "");
      writeLine(stream, `${colors.task(`Task ${String(meta.taskNumber)}`)} ${colors.bold(meta.title)}`);
    },

    phaseStarted(meta) {
      flushPendingAgentMessage();
      activePhase = {
        phase: meta.phase,
        attempt: meta.attempt,
        maxRetries: meta.maxRetries
      };

      const text = buildPhaseText(meta, colors);

      if (isTTY) {
        spinner.start(text);
        return;
      }

      writeLine(stream, text);
    },

    notification(notification) {
      if (notification.type === "agent_message_chunk") {
        pendingAgentMessage = pendingAgentMessage === null
          ? notification
          : { type: "agent_message_chunk", text: `${pendingAgentMessage.text}${notification.text}` };
        return;
      }

      flushPendingAgentMessage();

      const line = `  ${formatNotification(notification, {
        colors,
        ...(options.debug !== undefined ? { debug: options.debug } : {})
      })}`;
      withSpinnerPause(spinner, activePhase, colors, () => {
        writeLine(stream, line);
      });
    },

    phaseEnded(meta) {
      flushPendingAgentMessage();
      const text = buildPhaseOutcomeText(meta, colors);

      if (isTTY && spinner.isSpinning) {
        if (meta.outcome === "advance") {
          spinner.succeed(text);
        } else if (meta.outcome === "retry") {
          spinner.warn(text);
        } else {
          spinner.fail(text);
        }
      } else {
        writeLine(stream, text);
      }

      activePhase = null;
    },

    taskEnded(meta) {
      flushPendingAgentMessage();
      stopSpinner(spinner);
      const text = meta.status === "completed"
        ? `${colors.success("Task completed")} ${String(meta.taskNumber)}`
        : `${colors.error("Task halted")} ${String(meta.taskNumber)}`;
      writeLine(stream, text);
    },

    halt(meta) {
      flushPendingAgentMessage();
      stopSpinner(spinner);
      writeLine(stream, `${colors.error("HALT")} ${meta.reason}`);
      if (meta.telemetryPath !== undefined) {
        writeLine(stream, `${colors.muted("Telemetry")} ${meta.telemetryPath}`);
      }
    },

    runEnded(meta) {
      flushPendingAgentMessage();
      stopSpinner(spinner);
      const status = meta.status === "completed"
        ? colors.success("Run completed")
        : colors.error("Run halted");
      writeLine(stream, `${status} ${meta.summaryPath}`);
    }
  };
}

function defaultSpinnerFactory(options: Parameters<SpinnerFactory>[0]): SpinnerLike {
  return ora({
    stream: options.stream,
    isEnabled: options.isEnabled,
    color: "cyan",
    discardStdin: false,
    hideCursor: false
  });
}

function withSpinnerPause(
  spinner: SpinnerLike,
  activePhase: ActivePhaseState | null,
  colors: ReturnType<typeof createColors>,
  action: () => void
): void {
  const phaseToResume = spinner.isSpinning ? activePhase : null;

  if (phaseToResume !== null) {
    spinner.stop();
  }

  action();

  if (phaseToResume !== null) {
    spinner.start(buildPhaseText(phaseToResume, colors));
  }
}

function stopSpinner(spinner: SpinnerLike): void {
  if (spinner.isSpinning) {
    spinner.stop();
  }
}

function buildPhaseText(meta: PhaseStartedMeta | ActivePhaseState, colors: ReturnType<typeof createColors>): string {
  return `${colors.phase(capitalize(meta.phase))} attempt ${String(meta.attempt)}/${String(meta.maxRetries)}`;
}

function buildPhaseOutcomeText(meta: PhaseEndedMeta, colors: ReturnType<typeof createColors>): string {
  if (meta.outcome === "advance") {
    return `${colors.success(capitalize(meta.phase))} advanced`;
  }

  if (meta.outcome === "retry") {
    return `${colors.warning(capitalize(meta.phase))} retry scheduled`;
  }

  return `${colors.error(capitalize(meta.phase))} halted`;
}

function writeLine(stream: NodeJS.WriteStream, text: string): void {
  stream.write(`${text}\n`);
}

function capitalize(value: string): string {
  if (value.length === 0) {
    return value;
  }

  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}