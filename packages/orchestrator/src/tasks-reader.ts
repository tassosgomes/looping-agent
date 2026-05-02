import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { getLegacyTaskFileName, getTaskFileName } from "./task-file-path.js";
import type { TaskEntry, TaskStatus } from "./tasks-reader-types.js";

const TASKS_SECTION_HEADER = /^##\s+Tarefas\s*$/i;
const SECTION_HEADER = /^##\s+/;
const TASK_LINE = /^\s*-\s*\[( |x|X|~)\]\s*(\d+)\.0\s+(.+?)\s*$/;

export interface TasksReaderErrorOptions {
  code: string;
  path: string;
  cause?: unknown;
}

export class TasksReaderError extends Error {
  readonly code: string;
  readonly path: string;

  constructor(message: string, options: TasksReaderErrorOptions) {
    super(`${message}: ${options.path}`, { cause: options.cause });
    this.name = "TasksReaderError";
    this.code = options.code;
    this.path = options.path;
  }
}

export class DefaultTasksReader {
  constructor(private readonly tasksFilePath: string) {}

  async listAll(): Promise<TaskEntry[]> {
    const content = await readTasksFile(this.tasksFilePath);

    return parseTasksDocument(content, this.tasksFilePath);
  }

  async getNextPending(): Promise<TaskEntry | null> {
    const entries = await this.listAll();

    return entries.find((entry) => entry.status !== "completed") ?? null;
  }

  async getTaskFile(number: number): Promise<string> {
    const primaryTaskFilePath = resolveTaskFilePath(this.tasksFilePath, number);
    const legacyTaskFilePath = resolveLegacyTaskFilePath(this.tasksFilePath, number);

    try {
      return await readFile(primaryTaskFilePath, "utf8");
    } catch (error) {
      const errorWithCode = error as NodeJS.ErrnoException;

      if (errorWithCode.code === "ENOENT" && legacyTaskFilePath !== primaryTaskFilePath) {
        try {
          return await readFile(legacyTaskFilePath, "utf8");
        } catch {
          // Fall through so the typed error reports the canonical zero-padded path.
        }
      }

      throw new TasksReaderError("Task file could not be read", {
        code: "TASK_FILE_READ_FAILED",
        path: primaryTaskFilePath,
        cause: error
      });
    }
  }
}

export function parseTasksDocument(content: string, tasksFilePath: string): TaskEntry[] {
  const lines = content.split(/\r?\n/u);
  const sectionStart = lines.findIndex((line) => TASKS_SECTION_HEADER.test(line.trim()));

  if (sectionStart === -1) {
    throw new TasksReaderError('Tasks section "## Tarefas" was not found', {
      code: "TASKS_SECTION_NOT_FOUND",
      path: tasksFilePath
    });
  }

  const entries: TaskEntry[] = [];
  const baseDir = dirname(tasksFilePath);

  for (const line of lines.slice(sectionStart + 1)) {
    if (SECTION_HEADER.test(line.trim())) {
      break;
    }

    const match = line.match(TASK_LINE);

    if (!match) {
      continue;
    }

    const marker = match[1];
    const numberText = match[2];
    const rawTitle = match[3];

    if (!marker || !numberText || !rawTitle) {
      continue;
    }

    const number = Number.parseInt(numberText, 10);

    entries.push({
      number,
      title: rawTitle.trim(),
      status: toTaskStatus(marker),
      filePath: resolve(baseDir, getTaskFileName(number))
    });
  }

  return entries;
}

async function readTasksFile(tasksFilePath: string): Promise<string> {
  try {
    return await readFile(tasksFilePath, "utf8");
  } catch (error) {
    throw new TasksReaderError("Tasks file could not be read", {
      code: "TASKS_FILE_READ_FAILED",
      path: tasksFilePath,
      cause: error
    });
  }
}

function toTaskStatus(marker: string): TaskStatus {
  if (marker === "x" || marker === "X") {
    return "completed";
  }

  if (marker === "~") {
    return "in_progress";
  }

  return "pending";
}

function resolveTaskFilePath(tasksFilePath: string, number: number): string {
  return resolve(dirname(tasksFilePath), getTaskFileName(number));
}

function resolveLegacyTaskFilePath(tasksFilePath: string, number: number): string {
  return resolve(dirname(tasksFilePath), getLegacyTaskFileName(number));
}
