import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { getStateFilePath, readState, writeState } from "../src/index.js";

describe("state-manager", () => {
  it("returns null when the state file does not exist", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "looping-agent-state-"));

    await expect(readState(projectDir)).resolves.toBeNull();
  });

  it("writes and reads validated state", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "looping-agent-state-"));
    const state = {
      looping_agent_version: "1.0.0",
      installed_at: "2026-04-27T10:00:00.000Z",
      skills: {
        "flow-prd-creator": {
          hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          installed_version: "1.0.0"
        }
      }
    } as const;

    await writeState(projectDir, state);

    await expect(readState(projectDir)).resolves.toEqual(state);
    await expect(readFile(getStateFilePath(projectDir), "utf8")).resolves.toContain('"flow-prd-creator"');
  });

  it("rejects invalid state payloads before writing", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "looping-agent-state-"));

    await expect(writeState(projectDir, {
      looping_agent_version: "1.0.0",
      installed_at: "not-a-date",
      skills: {}
    })).rejects.toThrow();
  });
});