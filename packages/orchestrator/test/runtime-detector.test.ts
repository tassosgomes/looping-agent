import { chmod, mkdir, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { detectRuntime } from "../src/runtime-detector.js";

const originalPath = process.env.PATH;

afterEach(() => {
  process.env.PATH = originalPath;
});

describe("detectRuntime", () => {
  it("detects the preferred runtime and captures its version", async () => {
    const binDir = await makeTempBin();
    const binary = join(binDir, "codex-acp");
    await writeExecutable(
      binary,
      `#!/bin/sh
echo "codex-acp 1.2.3"
`
    );
    process.env.PATH = `${binDir}${delimiter}${originalPath ?? ""}`;

    const runtime = await detectRuntime("codex-acp");

    expect(runtime).toEqual({
      kind: "codex-acp",
      binary: "codex-acp",
      args: [],
      path: binary,
      version: "codex-acp 1.2.3"
    });
  });

  it("detects copilot ACP with the required --acp runtime argument", async () => {
    const binDir = await makeTempBin();
    const binary = join(binDir, "copilot");
    await writeExecutable(
      binary,
      `#!/bin/sh
echo "copilot 0.9.0"
`
    );
    process.env.PATH = `${binDir}${delimiter}${originalPath ?? ""}`;

    const runtime = await detectRuntime("copilot-acp");

    expect(runtime.kind).toBe("copilot-acp");
    expect(runtime.binary).toBe("copilot");
    expect(runtime.args).toEqual(["--acp"]);
    expect(runtime.path).toBe(binary);
    expect(runtime.version).toBe("copilot 0.9.0");
  });

  it("throws a remediation message when no supported runtime is on PATH", async () => {
    process.env.PATH = "";

    await expect(detectRuntime()).rejects.toThrow(
      "Expected one of: (claude-agent-acp|claude-code-acp), codex-acp, copilot --acp"
    );
    await expect(detectRuntime()).rejects.toThrow(
      "npm i -g @agentclientprotocol/claude-agent-acp"
    );
  });

  it("reports installed Claude and Codex CLIs when they do not match supported ACP runtime names", async () => {
    const binDir = await makeTempBin();
    await writeExecutable(
      join(binDir, "claude"),
      `#!/bin/sh
echo "claude 1.0.0"
`
    );
    await writeExecutable(
      join(binDir, "codex"),
      `#!/bin/sh
echo "codex 1.0.0"
`
    );
    process.env.PATH = binDir;

    await expect(detectRuntime()).rejects.toThrow("Found 'claude'");
    await expect(detectRuntime()).rejects.toThrow("Found 'codex'");
  });
});

async function makeTempBin(): Promise<string> {
  const dir = join(tmpdir(), `looping-agent-runtime-${process.pid}-${Date.now()}-${Math.random()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function writeExecutable(path: string, content: string): Promise<void> {
  await writeFile(path, content, "utf8");
  await chmod(path, 0o755);
}
