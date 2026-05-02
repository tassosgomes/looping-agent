import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, isAbsolute, join } from "node:path";

export type RuntimeKind = "claude-agent-acp" | "codex-acp" | "copilot-acp";

export interface DetectedRuntime {
  kind: RuntimeKind;
  binary: string;
  args: string[];
  path: string;
  version: string | null;
}

interface RuntimeCandidate {
  kind: RuntimeKind;
  // Names searched on PATH, in priority order. The first match wins.
  // The published npm package and the binary name don't always agree, so we accept
  // a few plausible spellings per runtime (e.g. Zed publishes `claude-code-acp` —
  // not `claude-agent-acp` — but both have shipped historically).
  binaries: readonly string[];
  args: string[];
}

const RUNTIME_CANDIDATES: readonly RuntimeCandidate[] = [
  { kind: "claude-agent-acp", binaries: ["claude-agent-acp", "claude-code-acp"], args: [] },
  { kind: "codex-acp", binaries: ["codex-acp"], args: [] },
  { kind: "copilot-acp", binaries: ["copilot"], args: ["--acp"] }
];

/**
 * Install instructions surfaced by the orchestrator and `looping-agent doctor`
 * so users know exactly how to remediate a missing runtime.
 */
export interface RuntimeInstallHint {
  kind: RuntimeKind;
  packageName: string;
  installCommand: string;
  note?: string;
}

export const RUNTIME_INSTALL_HINTS: readonly RuntimeInstallHint[] = [
  {
    kind: "claude-agent-acp",
    packageName: "@agentclientprotocol/claude-agent-acp",
    installCommand: "npm i -g @agentclientprotocol/claude-agent-acp",
    note: "Provides the `claude-agent-acp` binary. The standalone `claude` CLI does not speak ACP. (Alternative: `npm i -g @zed-industries/claude-code-acp` ships `claude-code-acp`; the loop accepts either.)"
  },
  {
    kind: "codex-acp",
    packageName: "@zed-industries/codex-acp",
    installCommand: "npm i -g @zed-industries/codex-acp",
    note: "Provides the `codex-acp` binary. The standalone `codex` CLI does not speak ACP."
  },
  {
    kind: "copilot-acp",
    packageName: "@github/copilot",
    installCommand: "npm i -g @github/copilot",
    note: "ACP mode is built in via `copilot --acp`. Authenticate first with `copilot` (interactive)."
  }
];

export function getRuntimeInstallHint(kind: RuntimeKind): RuntimeInstallHint {
  const hint = RUNTIME_INSTALL_HINTS.find((entry) => entry.kind === kind);
  if (!hint) {
    throw new Error(`No install hint configured for runtime kind ${kind}.`);
  }
  return hint;
}

export async function detectRuntime(preferred?: RuntimeKind): Promise<DetectedRuntime> {
  const candidates = preferred
    ? RUNTIME_CANDIDATES.filter((candidate) => candidate.kind === preferred)
    : RUNTIME_CANDIDATES;

  for (const candidate of candidates) {
    for (const binary of candidate.binaries) {
      const resolvedPath = await findExecutable(binary);
      if (!resolvedPath) {
        continue;
      }

      return {
        kind: candidate.kind,
        binary,
        args: [...candidate.args],
        path: resolvedPath,
        version: await readRuntimeVersion(resolvedPath)
      };
    }
  }

  const installedCliNotes = await detectInstalledCliNotes();
  const installLines = RUNTIME_INSTALL_HINTS.flatMap((hint) => {
    const lines = [`  - ${hint.kind}: ${hint.installCommand}`];
    if (hint.note !== undefined) {
      lines.push(`      ${hint.note}`);
    }
    return lines;
  });

  throw new Error(
    [
      "No ACP runtime was detected on PATH.",
      `Expected one of: ${RUNTIME_CANDIDATES.map(formatRuntime).join(", ")}.`,
      "Install one of:",
      ...installLines,
      ...installedCliNotes
    ].join("\n")
  );
}

async function detectInstalledCliNotes(): Promise<string[]> {
  const notes: string[] = [];
  const claudePath = await findExecutable("claude");
  const codexPath = await findExecutable("codex");

  if (claudePath) {
    const hint = getRuntimeInstallHint("claude-agent-acp");
    notes.push(
      `Found 'claude' at ${claudePath}, but it does not speak ACP. To use Claude as the loop runtime: ${hint.installCommand}`
    );
  }

  if (codexPath) {
    const hint = getRuntimeInstallHint("codex-acp");
    notes.push(
      `Found 'codex' at ${codexPath}, but it does not speak ACP. To use Codex as the loop runtime: ${hint.installCommand}`
    );
  }

  return notes;
}

async function findExecutable(binary: string): Promise<string | null> {
  if (isAbsolute(binary)) {
    return (await isExecutable(binary)) ? binary : null;
  }

  for (const directory of getPathEntries()) {
    for (const executableName of executableNames(binary)) {
      const candidate = join(directory, executableName);

      if (await isExecutable(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function getPathEntries(): string[] {
  return (process.env.PATH ?? "")
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function executableNames(binary: string): string[] {
  if (process.platform !== "win32") {
    return [binary];
  }

  const extensions = (process.env.PATHEXT ?? ".EXE;.CMD;.BAT")
    .split(";")
    .map((extension) => extension.trim())
    .filter((extension) => extension.length > 0);

  return [binary, ...extensions.map((extension) => `${binary}${extension.toLowerCase()}`)];
}

function readRuntimeVersion(binaryPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(binaryPath, ["--version"], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      resolve(null);
    }, 5_000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", () => {
      clearTimeout(timeout);
      resolve(null);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      // If the binary rejected --version (non-zero exit), don't pollute the
      // version field with the error message — record `null` instead.
      const buffer = code === 0 ? stdout : stdout || stderr;
      const text = buffer.trim();
      if (code !== 0 || text.length === 0 || /^error:/i.test(text)) {
        resolve(null);
        return;
      }
      resolve(text.split(/\r?\n/, 1)[0] ?? null);
    });
  });
}

function formatRuntime(candidate: RuntimeCandidate): string {
  const binarySpec = candidate.binaries.length > 1
    ? `(${candidate.binaries.join("|")})`
    : candidate.binaries[0] ?? candidate.kind;
  return candidate.args.length > 0 ? `${binarySpec} ${candidate.args.join(" ")}` : binarySpec;
}
