import { describe, expect, it } from "vitest";

import { createTerminalUi, type SpinnerFactory, type SpinnerLike } from "../../src/index.js";

describe("terminal ui", () => {
  it("streams notifications while pausing and resuming the active spinner", () => {
    const stream = createTestStream(true);
    const spinner = new FakeSpinner();
    const ui = createTerminalUi({
      isTTY: true,
      noColor: true,
      stream,
      spinnerFactory: createSpinnerFactory(spinner)
    });

    ui.runStarted({ prdSlug: "prd-orquestrador-em-codigo", tasksTotal: 2 });
    ui.taskStarted({ taskNumber: 13, title: "CLI terminal renderer" });
    ui.phaseStarted({ phase: "implementer", attempt: 1, maxRetries: 3 });
    ui.notification({ type: "plan", content: [{ step: "Render progress" }] });
    ui.notification({
      type: "tool_call",
      id: "tool-1",
      name: "report_implementer_result",
      input: { status: "completed" }
    });

    expect(spinner.events).toEqual([
      "start:Implementer attempt 1/3",
      "stop:Implementer attempt 1/3",
      "start:Implementer attempt 1/3",
      "stop:Implementer attempt 1/3",
      "start:Implementer attempt 1/3"
    ]);
    expect(stream.output).toContain("Looping Agent prd-orquestrador-em-codigo");
    expect(stream.output).toContain("Task 13 CLI terminal renderer");
    expect(stream.output).toContain("[plan] [{\"step\":\"Render progress\"}]");
    expect(stream.output).toContain("report_implementer_result");
  });

  it("renders phase and task outcomes through spinner terminal states", () => {
    const stream = createTestStream(true);
    const spinner = new FakeSpinner();
    const ui = createTerminalUi({
      isTTY: true,
      noColor: true,
      stream,
      spinnerFactory: createSpinnerFactory(spinner)
    });

    ui.phaseStarted({ phase: "reviewer", attempt: 2, maxRetries: 3 });
    ui.phaseEnded({ phase: "reviewer", outcome: "retry" });
    ui.phaseStarted({ phase: "reviewer", attempt: 3, maxRetries: 3 });
    ui.phaseEnded({ phase: "reviewer", outcome: "halt" });
    ui.taskEnded({ taskNumber: 13, status: "halted" });
    ui.runEnded({ status: "halted", summaryPath: "/tmp/run-summary.json" });

    expect(spinner.events).toEqual([
      "start:Reviewer attempt 2/3",
      "warn:Reviewer retry scheduled",
      "start:Reviewer attempt 3/3",
      "fail:Reviewer halted"
    ]);
    expect(stream.output).toContain("Task halted 13");
    expect(stream.output).toContain("Run halted /tmp/run-summary.json");
  });

  it("falls back to plain line output when the stream is not a TTY", () => {
    const stream = createTestStream(false);
    const spinner = new FakeSpinner();
    const ui = createTerminalUi({
      isTTY: false,
      noColor: true,
      stream,
      spinnerFactory: createSpinnerFactory(spinner)
    });

    ui.phaseStarted({ phase: "finalizer", attempt: 1, maxRetries: 3 });
    ui.phaseEnded({ phase: "finalizer", outcome: "advance" });
    ui.taskEnded({ taskNumber: 13, status: "completed" });
    ui.halt({ reason: "contract_violation_completion_tool_missing", telemetryPath: "/tmp/13_telemetry.json" });

    expect(spinner.events).toEqual([]);
    expect(stream.output).toContain("Finalizer attempt 1/3");
    expect(stream.output).toContain("Finalizer advanced");
    expect(stream.output).toContain("Task completed 13");
    expect(stream.output).toContain("HALT contract_violation_completion_tool_missing");
    expect(stream.output).toContain("Telemetry /tmp/13_telemetry.json");
  });

  it("coalesces streamed agent chunks into a single rendered line", () => {
    const stream = createTestStream(true);
    const spinner = new FakeSpinner();
    const ui = createTerminalUi({
      isTTY: true,
      noColor: true,
      stream,
      spinnerFactory: createSpinnerFactory(spinner)
    });

    ui.phaseStarted({ phase: "implementer", attempt: 1, maxRetries: 3 });
    ui.notification({ type: "agent_message_chunk", text: "En" });
    ui.notification({ type: "agent_message_chunk", text: "cont" });
    ui.notification({ type: "agent_message_chunk", text: "rei" });
    ui.notification({
      type: "tool_call",
      id: "tool-1",
      name: "report_implementer_result",
      input: { status: "completed" }
    });

    expect(stream.output).toContain("[agent] Encontrei");
    expect(stream.output).toContain("report_implementer_result");
    expect(stream.output.match(/\[agent\]/gu)).toHaveLength(1);
    expect(spinner.events).toEqual([
      "start:Implementer attempt 1/3",
      "stop:Implementer attempt 1/3",
      "start:Implementer attempt 1/3",
      "stop:Implementer attempt 1/3",
      "start:Implementer attempt 1/3"
    ]);
  });
});

class FakeSpinner implements SpinnerLike {
  text = "";
  isSpinning = false;
  readonly events: string[] = [];

  start(text?: string): SpinnerLike {
    this.text = text ?? this.text;
    this.isSpinning = true;
    this.events.push(`start:${this.text}`);
    return this;
  }

  stop(): SpinnerLike {
    this.events.push(`stop:${this.text}`);
    this.isSpinning = false;
    return this;
  }

  succeed(text?: string): SpinnerLike {
    this.text = text ?? this.text;
    this.events.push(`succeed:${this.text}`);
    this.isSpinning = false;
    return this;
  }

  warn(text?: string): SpinnerLike {
    this.text = text ?? this.text;
    this.events.push(`warn:${this.text}`);
    this.isSpinning = false;
    return this;
  }

  fail(text?: string): SpinnerLike {
    this.text = text ?? this.text;
    this.events.push(`fail:${this.text}`);
    this.isSpinning = false;
    return this;
  }
}

function createSpinnerFactory(spinner: FakeSpinner): SpinnerFactory {
  return () => spinner;
}

function createTestStream(isTTY: boolean): NodeJS.WriteStream & { output: string } {
  let output = "";

  return {
    isTTY,
    write(chunk: string | Uint8Array): boolean {
      output += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
      return true;
    },
    get output(): string {
      return output;
    }
  } as NodeJS.WriteStream & { output: string };
}