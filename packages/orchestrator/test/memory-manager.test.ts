import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_MEMORY_SIZE_THRESHOLD_BYTES,
  DefaultMemoryManager
} from "../src/memory-manager.js";

describe("DefaultMemoryManager", () => {
  it("initializes shared memory files idempotently without overwriting existing content", async () => {
    const prdDir = await makeTempPrdDir();
    const manager = new DefaultMemoryManager();

    await manager.initialize(prdDir);

    const sharedPath = join(prdDir, "MEMORY.md");
    const memoryDir = join(prdDir, "memory");

    await expect(readFile(sharedPath, "utf8")).resolves.toContain("# Workflow Memory");
    await expect(stat(memoryDir)).resolves.toMatchObject({ isDirectory: expect.any(Function) });

    await writeFile(sharedPath, "custom shared memory\n", "utf8");
    await manager.initialize(prdDir);

    await expect(readFile(sharedPath, "utf8")).resolves.toBe("custom shared memory\n");
  });

  it("creates task memory lazily and preserves existing content on later calls", async () => {
    const prdDir = await makeTempPrdDir();
    const manager = new DefaultMemoryManager();

    const firstPaths = await manager.pathsForTask(prdDir, 3);

    expect(isAbsolute(firstPaths.sharedPath)).toBe(true);
    expect(isAbsolute(firstPaths.taskPath)).toBe(true);
    await expect(readFile(firstPaths.taskPath, "utf8")).resolves.toContain("# Task 3 Memory");

    await writeFile(firstPaths.taskPath, "task memory preserved\n", "utf8");

    const secondPaths = await manager.pathsForTask(prdDir, 3);

    expect(secondPaths).toEqual(firstPaths);
    await expect(readFile(firstPaths.taskPath, "utf8")).resolves.toBe("task memory preserved\n");
  });

  it("flags files that exceed the configured threshold", async () => {
    const prdDir = await makeTempPrdDir();
    const manager = new DefaultMemoryManager();
    const oversizedPath = join(prdDir, "MEMORY.md");

    await writeFile(oversizedPath, "a".repeat(DEFAULT_MEMORY_SIZE_THRESHOLD_BYTES + 1), "utf8");

    await expect(manager.checkSize(oversizedPath)).resolves.toEqual({
      withinLimit: false,
      sizeBytes: DEFAULT_MEMORY_SIZE_THRESHOLD_BYTES + 1,
      thresholdBytes: DEFAULT_MEMORY_SIZE_THRESHOLD_BYTES
    });
  });
});

async function makeTempPrdDir(): Promise<string> {
  const prdDir = join(tmpdir(), `looping-agent-memory-${process.pid}-${Date.now()}-${Math.random()}`);
  await mkdir(prdDir, { recursive: true });
  return prdDir;
}