import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { existsSync } from "node:fs";
import { access, cp, mkdir, mkdtemp, readdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { delimiter, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type RuntimeKind = "claude-agent-acp" | "codex-acp" | "copilot-acp";
export type Sequence = string[];

export interface SmokeOptions {
  runtime: RuntimeKind;
  fixture: string;
  resultsDir: string;
  runId?: string;
  maxRetries: number;
  debug: boolean;
}

interface RuntimeDetails {
  kind: RuntimeKind;
  binary: string;
  args: string[];
  path: string | null;
  version: string | null;
}

interface CommandRecord {
  label: string;
  command: string;
  cwd: string;
  exitCode: number;
  durationMs: number;
  stdoutPath: string;
  stderrPath: string;
}

interface ExecutedCommand extends CommandRecord {
  stdoutText: string;
  stderrText: string;
}

interface TelemetrySnapshot {
  taskTelemetryPath: string | null;
  runSummaryPath: string | null;
  status: string | null;
  sequence: Sequence;
}

export interface SmokeManifest {
  schemaVersion: "1.0";
  runId: string;
  fixture: string;
  runtime: RuntimeDetails;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  resultsDir: string;
  workspaceDir: string;
  manifestPath: string;
  commands: {
    bootstrap: CommandRecord[];
    setup: CommandRecord;
    run: CommandRecord;
  };
  telemetry: TelemetrySnapshot;
  success: boolean;
  notes: string[];
}

interface TelemetryFile {
  status: string | null;
  phases: {
    name: string;
    attempts: {
      attempt: number;
    }[];
  }[];
}

const REPO_ROOT = findRepoRoot(fileURLToPath(new URL(".", import.meta.url)));
const FIXTURES_DIR = join(REPO_ROOT, "tests", "e2e", "fixtures");
const DEFAULT_RESULTS_DIR = join(REPO_ROOT, "tests", "e2e", "results");
const CLI_ENTRY = join(REPO_ROOT, "packages", "cli", "dist", "index.js");
const QUALITY_LEDGER_SEED = "# Quality Ledger\n\n";

function findRepoRoot(moduleDir: string): string {
  const candidates = [resolve(moduleDir, "../.."), resolve(moduleDir, "../../..")] as const;

  for (const candidate of candidates) {
    if (existsSync(join(candidate, "package.json")) && existsSync(join(candidate, "packages", "cli"))) {
      return candidate;
    }
  }

  throw new Error(`Could not resolve the repository root from ${moduleDir}.`);
}

export async function runSmoke(options: SmokeOptions): Promise<SmokeManifest> {
  await ensureBuiltCli();

  const fixtureDir = join(FIXTURES_DIR, options.fixture);
  const fixtureTasksPath = join(fixtureDir, "tasks.md");
  const notes: string[] = [];

  if (!await pathExists(fixtureTasksPath)) {
    throw new Error(`Fixture not found: ${fixtureTasksPath}`);
  }

  const startedAt = new Date();
  const runId = options.runId ?? buildRunId(options.fixture, options.runtime, startedAt);
  const resultsDir = resolve(options.resultsDir);
  const runDir = join(resultsDir, runId);
  const stagingDir = await mkdtemp(join(resolve(REPO_ROOT, ".."), "looping-agent-smoke-"));
  const stagedWorkspaceDir = join(stagingDir, "workspace");
  const workspaceDir = join(runDir, "workspace");
  const fixtureRelativePath = ["tests", "e2e", "fixtures", options.fixture].join("/");
  const copiedFixtureDir = join(workspaceDir, "tests", "e2e", "fixtures", options.fixture);

  await mkdir(runDir, { recursive: true });
  await copyWorkspace(stagedWorkspaceDir);
  await rename(stagedWorkspaceDir, workspaceDir);
  await rm(stagingDir, { recursive: true, force: true });
  await linkNodeModules(workspaceDir, notes);
  await seedAuxiliaryDocs(workspaceDir);

  const runtimeDetails = await readRuntimeDetails(options.runtime);
  const bootstrapCommands = await bootstrapGitWorkspace(runDir, workspaceDir, options.fixture, options.runtime);
  const setupResult = await executeLoggedCommand({
    label: "setup",
    cwd: workspaceDir,
    command: ["node", CLI_ENTRY, "setup", "--force", "--no-color"],
    logDir: runDir
  });

  applySetupRuntimeDetails(runtimeDetails, setupResult.stdoutText);

  const runCommand = [
    "node",
    CLI_ENTRY,
    "run",
    "--prd-dir",
    fixtureRelativePath,
    "--runtime",
    options.runtime,
    "--max-retries",
    String(options.maxRetries),
    "--no-color"
  ];

  if (options.debug) {
    runCommand.push("--debug");
  }

  const runResult = await executeLoggedCommand({
    label: "run",
    cwd: workspaceDir,
    command: runCommand,
    logDir: runDir
  });
  const telemetry = await collectTelemetrySnapshot(copiedFixtureDir);
  const endedAt = new Date();
  const manifestPath = join(runDir, "smoke-manifest.json");
  const manifest: SmokeManifest = {
    schemaVersion: "1.0",
    runId,
    fixture: options.fixture,
    runtime: runtimeDetails,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: endedAt.getTime() - startedAt.getTime(),
    resultsDir: runDir,
    workspaceDir,
    manifestPath,
    commands: {
      bootstrap: bootstrapCommands.map(toCommandRecord),
      setup: toCommandRecord(setupResult),
      run: toCommandRecord(runResult)
    },
    telemetry,
    success: bootstrapCommands.every((result) => result.exitCode === 0)
      && setupResult.exitCode === 0
      && runResult.exitCode === 0
      && telemetry.taskTelemetryPath !== null,
    notes
  };

  if (telemetry.taskTelemetryPath === null) {
    manifest.notes.push(`No task telemetry was produced under ${copiedFixtureDir}.`);
  }

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

export function normalizeRuntimeKind(value: string): RuntimeKind {
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
      throw new Error(
        `Unsupported runtime ${JSON.stringify(value)}. Expected one of: claude-agent-acp, claude-acp, codex-acp, copilot-acp.`
      );
  }
}

export function extractSequence(telemetry: TelemetryFile): Sequence {
  const sequence: Sequence = [];

  for (const phase of telemetry.phases) {
    for (const attempt of phase.attempts) {
      sequence.push(`${phase.name}#${String(attempt.attempt)}`);
    }
  }

  return sequence;
}

async function ensureBuiltCli(): Promise<void> {
  if (!await pathExists(CLI_ENTRY)) {
    throw new Error(`Missing ${CLI_ENTRY}. Run npm run build before executing the smoke harness.`);
  }
}

function buildRunId(fixture: string, runtime: RuntimeKind, startedAt: Date): string {
  const timestamp = startedAt.toISOString().replace(/[:.]/gu, "-");
  return `${fixture}-${runtime}-${timestamp}`;
}

async function copyWorkspace(workspaceDir: string): Promise<void> {
  await cp(REPO_ROOT, workspaceDir, {
    recursive: true,
    filter: (sourcePath) => shouldCopyPath(sourcePath)
  });
}

function shouldCopyPath(sourcePath: string): boolean {
  const relativePath = relative(REPO_ROOT, sourcePath);

  if (relativePath === "") {
    return true;
  }

  const segments = relativePath.split(/[\\/]+/u);
  const leaf = segments.at(-1);

  if (segments[0] === "tests" && segments[1] === "e2e" && segments[2] === "results") {
    return false;
  }

  if (leaf === ".git" || leaf === ".claude" || leaf === "node_modules") {
    return false;
  }

  if (segments.includes("coverage") || segments.includes("dist")) {
    return false;
  }

  return !(leaf?.endsWith(".tsbuildinfo") ?? false);
}

async function linkNodeModules(workspaceDir: string, notes: string[]): Promise<void> {
  const sourceNodeModules = join(REPO_ROOT, "node_modules");
  const targetNodeModules = join(workspaceDir, "node_modules");

  if (!await pathExists(sourceNodeModules)) {
    notes.push(`node_modules was not found at ${sourceNodeModules}; npm install is required before running smoke tests.`);
    return;
  }

  await symlink(sourceNodeModules, targetNodeModules, process.platform === "win32" ? "junction" : "dir");
}

async function seedAuxiliaryDocs(workspaceDir: string): Promise<void> {
  const ledgerPath = join(workspaceDir, "docs", "ai-dev", "quality-ledger.md");
  const summariesDir = join(workspaceDir, "docs", "ai-dev", "prd-summaries");

  await mkdir(summariesDir, { recursive: true });

  if (!await pathExists(ledgerPath)) {
    await writeFile(ledgerPath, QUALITY_LEDGER_SEED, "utf8");
  }
}

async function bootstrapGitWorkspace(
  runDir: string,
  workspaceDir: string,
  fixture: string,
  runtime: RuntimeKind
): Promise<ExecutedCommand[]> {
  const remoteDir = join(runDir, "origin.git");
  const branchName = `smoke/${fixture}-${runtime}`;
  const commands: ExecutedCommand[] = [];

  commands.push(await executeLoggedCommand({
    label: "git-init-bare",
    cwd: runDir,
    command: ["git", "init", "--bare", remoteDir],
    logDir: runDir
  }));
  commands.push(await executeLoggedCommand({
    label: "git-init-workspace",
    cwd: workspaceDir,
    command: ["git", "init", "--initial-branch=main"],
    logDir: runDir
  }));
  commands.push(await executeLoggedCommand({
    label: "git-config-name",
    cwd: workspaceDir,
    command: ["git", "config", "user.name", "Looping Agent Smoke"],
    logDir: runDir
  }));
  commands.push(await executeLoggedCommand({
    label: "git-config-email",
    cwd: workspaceDir,
    command: ["git", "config", "user.email", "looping-agent-smoke@example.com"],
    logDir: runDir
  }));
  commands.push(await executeLoggedCommand({
    label: "git-add-seed",
    cwd: workspaceDir,
    command: ["git", "add", "."],
    logDir: runDir
  }));
  commands.push(await executeLoggedCommand({
    label: "git-commit-seed",
    cwd: workspaceDir,
    command: ["git", "commit", "-m", "chore: seed smoke workspace"],
    logDir: runDir
  }));
  commands.push(await executeLoggedCommand({
    label: "git-remote-add-origin",
    cwd: workspaceDir,
    command: ["git", "remote", "add", "origin", remoteDir],
    logDir: runDir
  }));
  commands.push(await executeLoggedCommand({
    label: "git-push-main",
    cwd: workspaceDir,
    command: ["git", "push", "-u", "origin", "main"],
    logDir: runDir
  }));
  commands.push(await executeLoggedCommand({
    label: "git-switch-feature",
    cwd: workspaceDir,
    command: ["git", "switch", "-c", branchName],
    logDir: runDir
  }));

  for (const result of commands) {
    if (result.exitCode !== 0) {
      throw new Error(`Git bootstrap failed at ${result.label}. See ${result.stderrPath}.`);
    }
  }

  return commands;
}

async function readRuntimeDetails(kind: RuntimeKind): Promise<RuntimeDetails> {
  const candidate = runtimeCandidate(kind);
  const executablePath = await findExecutable(candidate.binary);
  const version = executablePath === null ? null : await readRuntimeVersion(executablePath);

  return {
    kind,
    binary: candidate.binary,
    args: [...candidate.args],
    path: executablePath,
    version
  };
}

function runtimeCandidate(kind: RuntimeKind): { binary: string; args: string[] } {
  switch (kind) {
    case "claude-agent-acp":
      return { binary: "claude-agent-acp", args: [] };
    case "codex-acp":
      return { binary: "codex-acp", args: [] };
    case "copilot-acp":
      return { binary: "copilot", args: ["--acp"] };
  }
}

async function findExecutable(binary: string): Promise<string | null> {
  if (isAbsolute(binary)) {
    return await isExecutable(binary) ? binary : null;
  }

  for (const directory of getPathEntries()) {
    const candidate = join(directory, binary);

    if (await isExecutable(candidate)) {
      return candidate;
    }
  }

  return null;
}

function getPathEntries(): string[] {
  return (process.env.PATH ?? "")
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

async function isExecutable(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function readRuntimeVersion(binaryPath: string): Promise<string | null> {
  const result = await spawnCommand(binaryPath, ["--version"], REPO_ROOT);
  const output = `${result.stdoutText}\n${result.stderrText}`.trim();
  return output.length > 0 ? (output.split(/\r?\n/u, 1)[0] ?? null) : null;
}

function applySetupRuntimeDetails(runtime: RuntimeDetails, setupOutput: string): void {
  const match = setupOutput.match(/^Runtime\s+(\S+)\s+\((.+)\)\s+at\s+(.+)$/mu);

  if (!match) {
    return;
  }

  const kind = match[1];
  const version = match[2];
  const path = match[3];

  if (!kind || !version || !path) {
    return;
  }

  if (kind === runtime.kind) {
    runtime.version = version === "version unavailable" ? null : version;
    runtime.path = path;
  }
}

async function collectTelemetrySnapshot(prdDir: string): Promise<TelemetrySnapshot> {
  const telemetryDir = join(prdDir, "telemetry");
  const taskTelemetryPath = join(telemetryDir, "1_telemetry.json");
  const runSummaryPath = await findLatestRunSummary(telemetryDir);

  if (!await pathExists(taskTelemetryPath)) {
    return {
      taskTelemetryPath: null,
      runSummaryPath,
      status: null,
      sequence: []
    };
  }

  const telemetry = parseTelemetryFile(await readFile(taskTelemetryPath, "utf8"));

  return {
    taskTelemetryPath,
    runSummaryPath,
    status: telemetry?.status ?? null,
    sequence: telemetry ? extractSequence(telemetry) : []
  };
}

async function findLatestRunSummary(telemetryDir: string): Promise<string | null> {
  if (!await pathExists(telemetryDir)) {
    return null;
  }

  const entries = await readdir(telemetryDir, { withFileTypes: true });
  const runSummaries = entries
    .filter((entry) => entry.isFile() && /^run-summary-.*\.json$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const latest = runSummaries.at(-1);

  return latest ? join(telemetryDir, latest) : null;
}

function parseTelemetryFile(raw: string): TelemetryFile | null {
  const parsed = JSON.parse(raw) as unknown;

  if (!isRecord(parsed)) {
    return null;
  }

  const status = typeof parsed.status === "string" ? parsed.status : null;
  const phasesValue = parsed.phases;

  if (!Array.isArray(phasesValue)) {
    return null;
  }

  const phases: TelemetryFile["phases"] = [];

  for (const phaseValue of phasesValue) {
    if (!isRecord(phaseValue)) {
      continue;
    }

    const name = phaseValue.name;
    const attemptsValue = phaseValue.attempts;

    if (typeof name !== "string" || !Array.isArray(attemptsValue)) {
      continue;
    }

    const attempts: { attempt: number }[] = [];

    for (const attemptValue of attemptsValue) {
      if (!isRecord(attemptValue)) {
        continue;
      }

      const attempt = attemptValue.attempt;

      if (typeof attempt === "number" && Number.isInteger(attempt) && attempt > 0) {
        attempts.push({ attempt });
      }
    }

    phases.push({ name, attempts });
  }

  return { status, phases };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function executeLoggedCommand(options: {
  label: string;
  cwd: string;
  command: string[];
  logDir: string;
}): Promise<ExecutedCommand> {
  const result = await spawnCommand(options.command[0] ?? "", options.command.slice(1), options.cwd);
  const labelSlug = slugifyLabel(options.label);
  const stdoutPath = join(options.logDir, `${labelSlug}.stdout.log`);
  const stderrPath = join(options.logDir, `${labelSlug}.stderr.log`);

  await writeFile(stdoutPath, result.stdoutText, "utf8");
  await writeFile(stderrPath, result.stderrText, "utf8");

  return {
    label: options.label,
    command: formatCommand(options.command),
    cwd: options.cwd,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    stdoutPath,
    stderrPath,
    stdoutText: result.stdoutText,
    stderrText: result.stderrText
  };
}

async function spawnCommand(binary: string, args: string[], cwd: string): Promise<{
  exitCode: number;
  stdoutText: string;
  stderrText: string;
  durationMs: number;
}> {
  const startedAt = Date.now();

  return new Promise((resolvePromise) => {
    const child = spawn(binary, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdoutText = "";
    let stderrText = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdoutText += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderrText += chunk;
    });
    child.on("error", (error) => {
      stderrText += `${error.message}\n`;
    });
    child.on("close", (code) => {
      resolvePromise({
        exitCode: code ?? 1,
        stdoutText,
        stderrText,
        durationMs: Date.now() - startedAt
      });
    });
  });
}

function toCommandRecord(result: ExecutedCommand): CommandRecord {
  return {
    label: result.label,
    command: result.command,
    cwd: result.cwd,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    stdoutPath: result.stdoutPath,
    stderrPath: result.stderrPath
  };
}

function formatCommand(command: string[]): string {
  return command
    .map((part) => (/\s/u.test(part) ? JSON.stringify(part) : part))
    .join(" ");
}

function slugifyLabel(label: string): string {
  return label.replace(/[^a-z0-9]+/giu, "-").replace(/^-|-$/gu, "");
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function parseSmokeCliOptions(argv: readonly string[]): SmokeOptions {
  let runtime: RuntimeKind | null = null;
  let fixture = "prd-smoke";
  let resultsDir = DEFAULT_RESULTS_DIR;
  let runId: string | undefined;
  let maxRetries = 3;
  let debug = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token) {
      continue;
    }

    switch (token) {
      case "--runtime": {
        const value = argv[index + 1];

        if (!value) {
          throw new Error("Missing value for --runtime.");
        }

        runtime = normalizeRuntimeKind(value);
        index += 1;
        break;
      }
      case "--fixture": {
        const value = argv[index + 1];

        if (!value) {
          throw new Error("Missing value for --fixture.");
        }

        fixture = value;
        index += 1;
        break;
      }
      case "--results-dir": {
        const value = argv[index + 1];

        if (!value) {
          throw new Error("Missing value for --results-dir.");
        }

        resultsDir = isAbsolute(value) ? value : resolve(REPO_ROOT, value);
        index += 1;
        break;
      }
      case "--run-id": {
        const value = argv[index + 1];

        if (!value) {
          throw new Error("Missing value for --run-id.");
        }

        runId = value;
        index += 1;
        break;
      }
      case "--max-retries": {
        const value = argv[index + 1];

        if (!value) {
          throw new Error("Missing value for --max-retries.");
        }

        const parsed = Number.parseInt(value, 10);

        if (!Number.isInteger(parsed) || parsed <= 0) {
          throw new Error(`Expected a positive integer for --max-retries, received ${JSON.stringify(value)}.`);
        }

        maxRetries = parsed;
        index += 1;
        break;
      }
      case "--debug":
        debug = true;
        break;
      case "--help":
        printSmokeHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option ${JSON.stringify(token)}.`);
    }
  }

  if (runtime === null) {
    throw new Error("Missing required option --runtime <claude-agent-acp|codex-acp|copilot-acp>.");
  }

  return {
    runtime,
    fixture,
    resultsDir,
    ...(runId ? { runId } : {}),
    maxRetries,
    debug
  };
}

function printSmokeHelp(): void {
  process.stdout.write(
    [
      "Usage: node tests/e2e/dist/run-smoke.js --runtime <name> [options]",
      "",
      "Options:",
      "  --runtime <name>      claude-agent-acp | claude-acp | codex-acp | copilot-acp",
      "  --fixture <name>      Fixture directory under tests/e2e/fixtures (default: prd-smoke)",
      "  --results-dir <path>  Output directory for logs and manifests (default: tests/e2e/results)",
      "  --run-id <id>         Stable identifier for the run directory",
      "  --max-retries <n>     Override the CLI retry budget (default: 3)",
      "  --debug               Forward --debug to looping-agent run",
      "  --help                Show this message"
    ].join("\n") + "\n"
  );
}

async function main(): Promise<void> {
  const options = parseSmokeCliOptions(process.argv.slice(2));
  const manifest = await runSmoke(options);
  const status = manifest.success ? "PASS" : "FAIL";

  process.stdout.write(
    [
      `${status} ${manifest.runId}`,
      `Results: ${manifest.resultsDir}`,
      `Runtime: ${manifest.runtime.kind}${manifest.runtime.version ? ` (${manifest.runtime.version})` : ""}`,
      `Telemetry: ${manifest.telemetry.taskTelemetryPath ?? "not produced"}`
    ].join("\n") + "\n"
  );

  if (!manifest.success) {
    process.exitCode = manifest.commands.run.exitCode === 0 ? 1 : manifest.commands.run.exitCode;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}