import { access, mkdir, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve } from "node:path";

import type { MemoryPaths, MemorySizeStatus } from "./memory-types.js";

const SHARED_MEMORY_FILE_NAME = "MEMORY.md";
const TASK_MEMORY_DIRECTORY_NAME = "memory";

const SHARED_MEMORY_HEADER = [
  "# Workflow Memory",
  "",
  "Memoria compartilhada do workflow. Atualizada pelos agentes via skill `flow-workflow-memory`."
].join("\n");

export const DEFAULT_MEMORY_SIZE_THRESHOLD_BYTES = 50 * 1024;

export class MemoryManagerError extends Error {
  readonly code: string;
  readonly path: string;

  constructor(message: string, options: { code: string; path: string; cause?: unknown }) {
    super(`${message}: ${options.path}`, { cause: options.cause });
    this.name = "MemoryManagerError";
    this.code = options.code;
    this.path = options.path;
  }
}

export class DefaultMemoryManager {
  constructor(private readonly thresholdBytes = DEFAULT_MEMORY_SIZE_THRESHOLD_BYTES) {}

  async initialize(prdDir: string): Promise<void> {
    const resolvedPrdDir = resolve(prdDir);
    const sharedPath = getSharedMemoryPath(resolvedPrdDir);
    const taskMemoryDir = getTaskMemoryDirectoryPath(resolvedPrdDir);

    await ensureDirectoryExists(resolvedPrdDir);
    await ensureDirectoryExists(taskMemoryDir);
    await ensureFileExists(sharedPath, SHARED_MEMORY_HEADER);
  }

  async pathsForTask(prdDir: string, taskNumber: number): Promise<MemoryPaths> {
    validateTaskNumber(taskNumber);

    const resolvedPrdDir = resolve(prdDir);
    await this.initialize(resolvedPrdDir);

    const sharedPath = getSharedMemoryPath(resolvedPrdDir);
    const taskPath = getTaskMemoryPath(resolvedPrdDir, taskNumber);

    await ensureFileExists(taskPath, taskMemoryTemplate(taskNumber));

    return {
      sharedPath,
      taskPath
    };
  }

  async checkSize(path: string): Promise<MemorySizeStatus> {
    const resolvedPath = resolve(path);

    try {
      const fileStat = await stat(resolvedPath);

      return {
        withinLimit: fileStat.size <= this.thresholdBytes,
        sizeBytes: fileStat.size,
        thresholdBytes: this.thresholdBytes
      };
    } catch (error) {
      throw new MemoryManagerError("Memory file size could not be determined", {
        code: "MEMORY_SIZE_CHECK_FAILED",
        path: resolvedPath,
        cause: error
      });
    }
  }
}

function getSharedMemoryPath(prdDir: string): string {
  return join(prdDir, SHARED_MEMORY_FILE_NAME);
}

function getTaskMemoryDirectoryPath(prdDir: string): string {
  return join(prdDir, TASK_MEMORY_DIRECTORY_NAME);
}

function getTaskMemoryPath(prdDir: string, taskNumber: number): string {
  return join(getTaskMemoryDirectoryPath(prdDir), `${String(taskNumber)}_task.md`);
}

async function ensureDirectoryExists(path: string): Promise<void> {
  try {
    await mkdir(path, { recursive: true });
  } catch (error) {
    throw new MemoryManagerError("Memory directory could not be created", {
      code: "MEMORY_DIRECTORY_CREATE_FAILED",
      path,
      cause: error
    });
  }
}

async function ensureFileExists(path: string, content: string): Promise<void> {
  try {
    await access(path, constants.F_OK);
    return;
  } catch (error) {
    const errorWithCode = error as NodeJS.ErrnoException;

    if (errorWithCode.code !== "ENOENT") {
      throw new MemoryManagerError("Memory file could not be accessed", {
        code: "MEMORY_FILE_ACCESS_FAILED",
        path,
        cause: error
      });
    }
  }

  try {
    await writeFile(path, `${content}\n`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    const errorWithCode = error as NodeJS.ErrnoException;

    if (errorWithCode.code === "EEXIST") {
      return;
    }

    throw new MemoryManagerError("Memory file could not be created", {
      code: "MEMORY_FILE_CREATE_FAILED",
      path,
      cause: error
    });
  }
}

function validateTaskNumber(taskNumber: number): void {
  if (!Number.isInteger(taskNumber) || taskNumber <= 0) {
    throw new MemoryManagerError("Task number must be a positive integer", {
      code: "INVALID_TASK_NUMBER",
      path: String(taskNumber)
    });
  }
}

function taskMemoryTemplate(taskNumber: number): string {
  return [
    `# Task ${String(taskNumber)} Memory`,
    "",
    "## Snapshot do Objetivo",
    "<!-- 1-3 linhas: o que esta tarefa precisa entregar -->",
    "",
    "## Decisões Importantes",
    "<!-- Decisões não óbvias tomadas durante a execução -->",
    "",
    "## Learnings",
    "<!-- Aprendizados locais à tarefa -->",
    "",
    "## Arquivos / Superfícies",
    "<!-- Arquivos e componentes tocados -->",
    "",
    "## Erros / Correções",
    "<!-- Erros encontrados e como foram corrigidos -->",
    "",
    "## Ready for Next Run",
    "<!-- Notas para quem pegar essa tarefa de novo ou uma relacionada -->"
  ].join("\n");
}