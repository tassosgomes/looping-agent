import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { DetectedRuntime } from "@looping-agent/orchestrator";

import { installAll } from "../../src/skills-installer.js";
import type { OutputStream } from "../../src/commands/shared.js";

export const WORKSPACE_ROOT = "/home/tsgomes/looping-agent";
export const SOURCE_SKILLS_DIR = path.join(WORKSPACE_ROOT, "skills");

export const MOCK_RUNTIME: DetectedRuntime = {
  kind: "codex-acp",
  binary: "codex-acp",
  args: [],
  path: "/usr/bin/codex-acp",
  version: "codex-acp 1.0.0"
};

export function createOutputCapture(): { stream: OutputStream; text(): string } {
  let output = "";

  return {
    stream: {
      isTTY: false,
      write(chunk: string): boolean {
        output += chunk;
        return true;
      }
    },
    text(): string {
      return output;
    }
  };
}

export async function createInstalledProject(): Promise<string> {
  const projectDir = await mkdtemp(path.join(os.tmpdir(), "looping-agent-commands-"));
  await installAll({ sourceDir: SOURCE_SKILLS_DIR, projectDir });
  return projectDir;
}