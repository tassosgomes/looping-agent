import { existsSync } from "node:fs";
import { lstat, readFile, readlink, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { createMcpServer } from "@looping-agent/mcp-server";

import { normalizedSha256 } from "../hash-utils.js";
import { createColors, type RendererColors } from "../renderer/colors.js";
import { EXPECTED_SKILLS, type ExpectedSkillName } from "../skills-list.js";

export interface OutputStream {
  write(chunk: string): boolean;
  isTTY?: boolean;
}

export interface CommandRuntimeOptions {
  projectDir?: string;
  sourceDir?: string;
  stdout?: OutputStream;
  stderr?: OutputStream;
  noColor?: boolean;
}

export interface McpSmokeTestResult {
  toolNames: string[];
}

export const EXPECTED_MCP_TOOL_NAMES = [
  "report_finalizer_result",
  "report_implementer_result",
  "report_review_result"
] as const;

class MemoryTransport implements Transport {
  peer: MemoryTransport | undefined;
  onclose: () => void = () => undefined;
  onerror: (error: Error) => void = () => undefined;
  onmessage: <T extends JSONRPCMessage>(message: T) => void = () => undefined;
  private closed = false;

  start(): Promise<void> {
    this.closed = false;
    return Promise.resolve();
  }

  send(message: JSONRPCMessage): Promise<void> {
    const peer = this.peer;
    if (peer === undefined) {
      throw new Error("Memory transport peer is not connected.");
    }

    queueMicrotask(() => {
      if (!this.closed) {
        peer.onmessage(message);
      }
    });

    return Promise.resolve();
  }

  close(): Promise<void> {
    if (this.closed) {
      return Promise.resolve();
    }

    this.closed = true;
    this.onclose();
    return Promise.resolve();
  }
}

function createTransportPair(): [MemoryTransport, MemoryTransport] {
  const client = new MemoryTransport();
  const server = new MemoryTransport();
  client.peer = server;
  server.peer = client;
  return [client, server];
}

export function getDefaultProjectDir(): string {
  return process.cwd();
}

export function getDefaultSkillsSourceDir(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(moduleDir, "../../../../skills"),
    path.resolve(moduleDir, "../../skills"),
    path.resolve(moduleDir, "../skills"),
    path.resolve(moduleDir, "./skills")
  ];

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "flow-prd-creator", "SKILL.md"))) {
      return candidate;
    }
  }

  throw new Error(`Could not locate the bundled skills directory from ${moduleDir}.`);
}

export function getSkillsInstallDir(projectDir: string): string {
  return path.join(projectDir, ".agents", "skills");
}

export function getClaudeSkillsCompatPath(projectDir: string): string {
  return path.join(projectDir, ".claude", "skills");
}

export function getSkillInstallPath(projectDir: string, skillName: ExpectedSkillName): string {
  return path.join(getSkillsInstallDir(projectDir), skillName, "SKILL.md");
}

export function getSkillBackupPath(projectDir: string, skillName: ExpectedSkillName): string {
  return path.join(getSkillsInstallDir(projectDir), `${skillName}.bak`);
}

export function resolveCommandContext(options: CommandRuntimeOptions): {
  projectDir: string;
  sourceDir: string;
  stdout: OutputStream;
  stderr: OutputStream;
} {
  return {
    projectDir: options.projectDir ?? getDefaultProjectDir(),
    sourceDir: options.sourceDir ?? getDefaultSkillsSourceDir(),
    stdout: options.stdout ?? process.stdout,
    stderr: options.stderr ?? process.stderr
  };
}

export function colorsForStream(options: CommandRuntimeOptions, stream: OutputStream): RendererColors {
  return createColors({
    isTTY: Boolean(stream.isTTY),
    ...(options.noColor !== undefined ? { noColor: options.noColor } : {})
  });
}

export function writeLine(stream: OutputStream, text: string): void {
  stream.write(`${text}\n`);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function describeRuntime(runtime: { kind: string; path: string; version: string | null }): string {
  const version = runtime.version ?? "version unavailable";
  return `${runtime.kind} (${version}) at ${runtime.path}`;
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

export async function readSymlinkTarget(targetPath: string): Promise<string | null> {
  try {
    const details = await lstat(targetPath);
    if (!details.isSymbolicLink()) {
      return null;
    }

    return await readlink(targetPath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function loadExpectedSkillHashes(sourceDir: string): Promise<Record<ExpectedSkillName, string>> {
  const hashes = {} as Record<ExpectedSkillName, string>;

  for (const skillName of EXPECTED_SKILLS) {
    const skillPath = path.join(sourceDir, skillName, "SKILL.md");
    hashes[skillName] = normalizedSha256(await readFile(skillPath, "utf8"));
  }

  return hashes;
}

export async function listPendingBackups(projectDir: string): Promise<ExpectedSkillName[]> {
  const pending: ExpectedSkillName[] = [];

  for (const skillName of EXPECTED_SKILLS) {
    if (await pathExists(getSkillBackupPath(projectDir, skillName))) {
      pending.push(skillName);
    }
  }

  return pending;
}

export async function runMcpSmokeTest(): Promise<McpSmokeTestResult> {
  const [clientTransport, serverTransport] = createTransportPair();
  const handle = createMcpServer({
    onToolCall: () => undefined,
    transportFactory: () => serverTransport
  });
  const client = new Client({
    name: "looping-agent-cli-smoke-test",
    version: "0.0.0"
  });

  try {
    await handle.start();
    await client.connect(clientTransport);

    const listedTools = await client.listTools();
    const toolNames = listedTools.tools.map((tool) => tool.name).sort();

    if (!hasExpectedTools(toolNames)) {
      throw new Error(
        `MCP smoke test returned unexpected tools: ${toolNames.join(", ")}. Expected ${EXPECTED_MCP_TOOL_NAMES.join(", ")}.`
      );
    }

    return { toolNames };
  } finally {
    await client.close().catch(() => undefined);
    await handle.stop().catch(() => undefined);
  }
}

function hasExpectedTools(toolNames: string[]): boolean {
  return toolNames.length === EXPECTED_MCP_TOOL_NAMES.length
    && EXPECTED_MCP_TOOL_NAMES.every((toolName, index) => toolNames[index] === toolName);
}
