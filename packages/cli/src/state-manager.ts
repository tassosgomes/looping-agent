import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { InstallState, type InstallStateT } from "@looping-agent/schemas";

export const LOOPING_AGENT_STATE_FILE = ".looping-agent-state.json";

export function getStateFilePath(projectDir: string): string {
  return path.join(projectDir, ".claude", LOOPING_AGENT_STATE_FILE);
}

export async function readState(projectDir: string): Promise<InstallStateT | null> {
  const stateFilePath = getStateFilePath(projectDir);

  try {
    const raw = await readFile(stateFilePath, "utf8");
    return InstallState.parse(JSON.parse(raw));
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    throw error;
  }
}

export async function writeState(projectDir: string, state: InstallStateT): Promise<void> {
  const stateFilePath = getStateFilePath(projectDir);
  const validatedState = InstallState.parse(state);

  await mkdir(path.dirname(stateFilePath), { recursive: true });
  await writeFile(stateFilePath, JSON.stringify(validatedState, null, 2) + "\n", "utf8");
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}