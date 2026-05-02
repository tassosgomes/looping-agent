#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Command, CommanderError, InvalidArgumentError } from "commander";
import type { EffortLevel, RuntimeKind } from "@looping-agent/orchestrator";

import { runDoctor } from "./commands/doctor.js";
import type { OutputStream } from "./commands/shared.js";
import { runRun } from "./commands/run.js";
import { runSetup } from "./commands/setup.js";
import { runUpdate } from "./commands/update.js";
import { buildCliHelpText, buildRunHelpText } from "./help.js";

export interface CliDependencies {
	version?: string;
	stdout?: OutputStream;
	stderr?: OutputStream;
	runSetup?: typeof runSetup;
	runUpdate?: typeof runUpdate;
	runRun?: typeof runRun;
	runDoctor?: typeof runDoctor;
}

interface ColorCliOptions {
	color?: boolean;
}

interface SetupCliOptions extends ColorCliOptions {
	force?: boolean;
}

interface RunCliOptions extends ColorCliOptions {
	prdDir: string;
	maxRetries: number;
	runtime?: RuntimeKind;
	model?: string;
	effort?: EffortLevel;
	verbose?: boolean;
	debug?: boolean;
}

interface GlobalCliOptions {
	color?: boolean;
	debug?: boolean;
}

type NoColorOption = { noColor: true } | Record<string, never>;

export async function createCliProgram(dependencies: CliDependencies = {}): Promise<{
	program: Command;
	getExitCode(): number;
}> {
	const stdout = dependencies.stdout ?? process.stdout;
	const stderr = dependencies.stderr ?? process.stderr;
	const version = dependencies.version ?? await readPackageVersion();
	const runSetupFn = dependencies.runSetup ?? runSetup;
	const runUpdateFn = dependencies.runUpdate ?? runUpdate;
	const runRunFn = dependencies.runRun ?? runRun;
	const runDoctorFn = dependencies.runDoctor ?? runDoctor;
	let exitCode = 0;
	const getExitCode = (): number => exitCode;

	const program = new Command()
		.name("looping-agent")
		.description("Deterministic CLI for the looping-agent workflow.")
		.version(version)
		.option("--debug", "Enable debug output across the selected command.")
		.option("--no-color", "Disable ANSI colors in output.")
		.showHelpAfterError()
		.configureOutput({
			writeOut: (text) => {
				stdout.write(text);
			},
			writeErr: (text) => {
				stderr.write(text);
			}
		})
		.addHelpText("afterAll", buildCliHelpText("looping-agent"));

	const setupCommand = new Command("setup")
		.description("Install bundled skills into the current project.")
		.option("--force", "Overwrite installed files even when hashes match.")
		.option("--no-color", "Disable ANSI colors in output.")
		.action(async (...args: readonly unknown[]) => {
			const options = getSetupCliOptions(args[0]);
			const command = getCommandArg(args[1]);
			const globalOptions = getGlobalCliOptions(command);
			const colorOptions = buildNoColorOption(options, globalOptions);

			exitCode = await runSetupFn({
				...(options.force === true ? { force: true } : {}),
				...colorOptions,
				stdout,
				stderr
			});
		});

	const updateCommand = new Command("update")
		.description("Refresh installed skills and create .bak backups when needed.")
		.option("--force", "Overwrite installed files even when hashes match.")
		.option("--no-color", "Disable ANSI colors in output.")
		.action(async (...args: readonly unknown[]) => {
			const options = getSetupCliOptions(args[0]);
			const command = getCommandArg(args[1]);
			const globalOptions = getGlobalCliOptions(command);
			const colorOptions = buildNoColorOption(options, globalOptions);

			exitCode = await runUpdateFn({
				...(options.force === true ? { force: true } : {}),
				...colorOptions,
				stdout,
				stderr
			});
		});

	const runCommand = new Command("run")
		.description("Execute the orchestrator loop for a PRD directory.")
		.requiredOption("--prd-dir <path>", "Path to the PRD directory containing tasks.md.")
		.option("--max-retries <n>", "Maximum retries per phase (default: 3).", parsePositiveInteger, 3)
		.option("--runtime <name>", "Override runtime detection.", parseRuntimeKind)
		.option("--model <name>", "Override the model used by the runtime (passes through to its --model flag).")
		.option("--effort <level>", "Reasoning effort: low | medium | high | xhigh (Copilot only).", parseEffortLevel)
		.option("--no-color", "Disable ANSI colors in output.")
		.option("--verbose", "Write raw progress events to stderr.")
		.option("--debug", "Enable full notification payloads and verbose progress.")
		.addHelpText("afterAll", buildRunHelpText("looping-agent"))
		.action(async (...args: readonly unknown[]) => {
			const options = getRunCliOptions(args[0]);
			const command = getCommandArg(args[1]);
			const globalOptions = getGlobalCliOptions(command);
			const colorOptions = buildNoColorOption(options, globalOptions);

			exitCode = await runRunFn({
				prdDir: options.prdDir,
				maxRetries: options.maxRetries,
				...(options.runtime !== undefined ? { runtime: options.runtime } : {}),
				...(options.model !== undefined ? { model: options.model } : {}),
				...(options.effort !== undefined ? { effort: options.effort } : {}),
				...colorOptions,
				...(options.verbose !== undefined ? { verbose: options.verbose } : {}),
				debug: options.debug === true || globalOptions.debug === true,
				stdout,
				stderr
			});
		});

	const doctorCommand = new Command("doctor")
		.description("Validate runtime, installed skills, backups, and MCP availability.")
		.option("--no-color", "Disable ANSI colors in output.")
		.action(async (...args: readonly unknown[]) => {
			const options = getColorCliOptions(args[0]);
			const command = getCommandArg(args[1]);
			const globalOptions = getGlobalCliOptions(command);
			const colorOptions = buildNoColorOption(options, globalOptions);

			exitCode = await runDoctorFn({
				...colorOptions,
				stdout,
				stderr
			});
		});

	program.addCommand(setupCommand);
	program.addCommand(updateCommand);
	program.addCommand(runCommand);
	program.addCommand(doctorCommand);

	return {
		program,
		getExitCode
	};
}

export async function runCli(argv: readonly string[] = process.argv, dependencies: CliDependencies = {}): Promise<number> {
	const cliProgram = await createCliProgram(dependencies);
	const normalizedArgv = argv.length <= 2 ? [...argv, "--help"] : [...argv];

	cliProgram.program.exitOverride();

	try {
		await cliProgram.program.parseAsync(normalizedArgv, { from: "node" });
		return cliProgram.getExitCode();
	} catch (error) {
		if (error instanceof CommanderError) {
			return error.code === "commander.executeSubCommandAsync" ? cliProgram.getExitCode() : error.exitCode;
		}

		throw error;
	}
}

function parsePositiveInteger(value: string): number {
	const parsed = Number.parseInt(value, 10);

	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new InvalidArgumentError(`Expected a positive integer, received ${JSON.stringify(value)}.`);
	}

	return parsed;
}

function buildNoColorOption(
	options: ColorCliOptions,
	globalOptions: GlobalCliOptions = {}
): NoColorOption {
	return options.color === false || globalOptions.color === false ? { noColor: true } : {};
}

function getCommandArg(value: unknown): Command {
	if (value instanceof Command) {
		return value;
	}

	throw new Error("Commander did not provide a command context.");
}

function getGlobalCliOptions(command: Command): GlobalCliOptions {
	const rawOptions = command.optsWithGlobals() as unknown;
	return getColorAndDebugOptions(rawOptions);
}

function getColorCliOptions(value: unknown): ColorCliOptions {
	return getColorAndDebugOptions(value);
}

function getSetupCliOptions(value: unknown): SetupCliOptions {
	const baseOptions = getColorCliOptions(value);

	if (!isRecord(value)) {
		return baseOptions;
	}

	const force = value.force;

	return {
		...baseOptions,
		...(typeof force === "boolean" ? { force } : {})
	};
}

function getRunCliOptions(value: unknown): RunCliOptions {
	if (!isRecord(value)) {
		throw new Error("Commander did not provide run options.");
	}

	const prdDir = value.prdDir;
	const maxRetries = value.maxRetries;

	if (typeof prdDir !== "string") {
		throw new Error("Commander did not provide --prd-dir.");
	}

	if (typeof maxRetries !== "number") {
		throw new Error("Commander did not provide --max-retries.");
	}

	const runtime = value.runtime;
	const model = value.model;
	const effort = value.effort;
	const verbose = value.verbose;
	const debug = value.debug;

	return {
		...getColorCliOptions(value),
		prdDir,
		maxRetries,
		...(isRuntimeKind(runtime) ? { runtime } : {}),
		...(typeof model === "string" && model.trim().length > 0 ? { model: model.trim() } : {}),
		...(isEffortLevel(effort) ? { effort } : {}),
		...(typeof verbose === "boolean" ? { verbose } : {}),
		...(typeof debug === "boolean" ? { debug } : {})
	};
}

function getColorAndDebugOptions(value: unknown): GlobalCliOptions {
	if (!isRecord(value)) {
		return {};
	}

	const color = value.color;
	const debug = value.debug;

	return {
		...(typeof color === "boolean" ? { color } : {}),
		...(typeof debug === "boolean" ? { debug } : {})
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isRuntimeKind(value: unknown): value is RuntimeKind {
	return value === "claude-agent-acp" || value === "codex-acp" || value === "copilot-acp";
}

function isEffortLevel(value: unknown): value is EffortLevel {
	return value === "low" || value === "medium" || value === "high" || value === "xhigh";
}

function parseEffortLevel(value: string): EffortLevel {
	const normalized = value.trim().toLowerCase();
	if (isEffortLevel(normalized)) {
		return normalized;
	}
	throw new InvalidArgumentError(
		`Unsupported effort ${JSON.stringify(value)}. Expected one of: low, medium, high, xhigh.`
	);
}

function parseRuntimeKind(value: string): RuntimeKind {
	switch (value.trim()) {
		case "claude-acp":
		case "claude-agent-acp":
			return "claude-agent-acp";
		case "codex-acp":
			return "codex-acp";
		case "copilot":
		case "copilot-acp":
			return "copilot-acp";
		default:
			throw new InvalidArgumentError(
				`Unsupported runtime ${JSON.stringify(value)}. Expected one of: claude-agent-acp, claude-acp, codex-acp, copilot-acp.`
			);
	}
}

async function readPackageVersion(): Promise<string> {
	const packageJsonPath = fileURLToPath(new URL("../package.json", import.meta.url));

	try {
		const rawPackageJson = await readFile(packageJsonPath, "utf8");
		const parsed = JSON.parse(rawPackageJson) as { version?: unknown };
		return typeof parsed.version === "string" ? parsed.version : "0.0.0";
	} catch {
		return "0.0.0";
	}
}

function isExecutedAsCli(): boolean {
	const entryPath = process.argv[1];

	if (!entryPath) {
		return false;
	}

	return realPathOrResolved(entryPath) === realPathOrResolved(fileURLToPath(import.meta.url));
}

function realPathOrResolved(targetPath: string): string {
	try {
		return realpathSync(targetPath);
	} catch {
		return resolve(targetPath);
	}
}

async function main(): Promise<void> {
	try {
		process.exitCode = await runCli(process.argv);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`Unhandled CLI error: ${message}\n`);
		process.exitCode = 1;
	}
}

if (isExecutedAsCli()) {
	void main();
}

export * from "./hash-utils.js";
export * from "./commands/doctor.js";
export * from "./commands/run.js";
export * from "./commands/setup.js";
export * from "./commands/update.js";
export * from "./exit-codes.js";
export * from "./help.js";
export * from "./renderer/colors.js";
export * from "./renderer/notification-formatter.js";
export * from "./renderer/terminal-ui.js";
export * from "./renderer/types.js";
export * from "./skills-installer.js";
export * from "./skills-list.js";
export * from "./state-manager.js";
