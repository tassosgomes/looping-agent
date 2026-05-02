import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { DefaultTasksReader, TasksReaderError, parseTasksDocument } from "../src/tasks-reader.js";

const fixturePath = new URL("./fixtures/sample-tasks.md", import.meta.url);

describe("DefaultTasksReader", () => {
  it("lists only top-level tasks and resolves their file paths", async () => {
    const tasksFilePath = fixtureFilePath();
    const reader = new DefaultTasksReader(tasksFilePath);

    const entries = await reader.listAll();

    expect(entries).toEqual([
      {
        number: 1,
        title: "Setup do pacote base",
        status: "completed",
        filePath: join(dirname(tasksFilePath), "01_task.md")
      },
      {
        number: 2,
        title: "Implementar parser de tarefas",
        status: "pending",
        filePath: join(dirname(tasksFilePath), "02_task.md")
      },
      {
        number: 3,
        title: "Integrar retomada do loop",
        status: "in_progress",
        filePath: join(dirname(tasksFilePath), "03_task.md")
      },
      {
        number: 4,
        title: "Finalizar a CLI",
        status: "completed",
        filePath: join(dirname(tasksFilePath), "04_task.md")
      },
      {
        number: 5,
        title: "Publicar documentacao",
        status: "pending",
        filePath: join(dirname(tasksFilePath), "05_task.md")
      }
    ]);
  });

  it("returns the first non-completed task so in-progress work can be resumed", async () => {
    const reader = new DefaultTasksReader(fixtureFilePath());

    await expect(reader.getNextPending()).resolves.toEqual({
      number: 2,
      title: "Implementar parser de tarefas",
      status: "pending",
      filePath: join(dirname(fixtureFilePath()), "02_task.md")
    });
  });

  it("returns null when every parsed task is completed", async () => {
    const tempDir = await makeTempDir();
    const tasksFilePath = join(tempDir, "tasks.md");
    await writeFile(
      tasksFilePath,
      [
        "# Fixture",
        "",
        "## Tarefas",
        "",
        "- [x] 1.0 Preparar ambiente",
        "- [X] 2.0 Executar validacoes",
        "",
        "## Fim"
      ].join("\n"),
      "utf8"
    );
    const reader = new DefaultTasksReader(tasksFilePath);

    await expect(reader.getNextPending()).resolves.toBeNull();
  });

  it("reads the raw individual task file", async () => {
    const tempDir = await makeTempDir();
    const tasksFilePath = join(tempDir, "tasks.md");
    const taskFilePath = join(tempDir, "02_task.md");
    await writeFile(tasksFilePath, "## Tarefas\n- [ ] 2.0 Implementar parser\n", "utf8");
    await writeFile(taskFilePath, "conteudo da task 2", "utf8");
    const reader = new DefaultTasksReader(tasksFilePath);

    await expect(reader.getTaskFile(2)).resolves.toBe("conteudo da task 2");
  });

  it("falls back to legacy non-padded task file names for existing PRDs", async () => {
    const tempDir = await makeTempDir();
    const tasksFilePath = join(tempDir, "tasks.md");
    const taskFilePath = join(tempDir, "2_task.md");
    await writeFile(tasksFilePath, "## Tarefas\n- [ ] 2.0 Implementar parser\n", "utf8");
    await writeFile(taskFilePath, "conteudo legado da task 2", "utf8");
    const reader = new DefaultTasksReader(tasksFilePath);

    await expect(reader.getTaskFile(2)).resolves.toBe("conteudo legado da task 2");
  });

  it("throws a clear error when the tasks section is missing", async () => {
    const tempDir = await makeTempDir();
    const tasksFilePath = join(tempDir, "tasks.md");
    await writeFile(tasksFilePath, "# Fixture sem secao\n", "utf8");
    const reader = new DefaultTasksReader(tasksFilePath);

    await expect(reader.listAll()).rejects.toMatchObject({
      name: "TasksReaderError",
      code: "TASKS_SECTION_NOT_FOUND",
      path: tasksFilePath
    });
    await expect(reader.listAll()).rejects.toThrow(tasksFilePath);
  });

  it("throws a clear error with the absolute path when a task file is missing", async () => {
    const tempDir = await makeTempDir();
    const tasksFilePath = join(tempDir, "tasks.md");
    const missingTaskFilePath = join(tempDir, "99_task.md");
    await writeFile(tasksFilePath, "## Tarefas\n- [ ] 99.0 Task ausente\n", "utf8");
    const reader = new DefaultTasksReader(tasksFilePath);

    await expect(reader.getTaskFile(99)).rejects.toMatchObject({
      name: "TasksReaderError",
      code: "TASK_FILE_READ_FAILED",
      path: missingTaskFilePath
    });
    await expect(reader.getTaskFile(99)).rejects.toThrow(missingTaskFilePath);
  });
});

describe("parseTasksDocument", () => {
  it("keeps file order and ignores subtasks with X.Y numbering", async () => {
    const content = await readFile(fixturePath, "utf8");
    const entries = parseTasksDocument(content, fixtureFilePath());

    expect(entries.map((entry) => entry.number)).toEqual([1, 2, 3, 4, 5]);
  });

  it("wraps read failures from the tasks file with a typed error", async () => {
    const tempDir = await makeTempDir();
    const missingTasksPath = join(tempDir, "missing-tasks.md");
    const reader = new DefaultTasksReader(missingTasksPath);

    await expect(reader.listAll()).rejects.toBeInstanceOf(TasksReaderError);
    await expect(reader.listAll()).rejects.toMatchObject({
      code: "TASKS_FILE_READ_FAILED",
      path: missingTasksPath
    });
  });
});

function fixtureFilePath(): string {
  return fixturePath.pathname;
}

async function makeTempDir(): Promise<string> {
  const dir = join(tmpdir(), `looping-agent-tasks-${process.pid}-${Date.now()}-${Math.random()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}
