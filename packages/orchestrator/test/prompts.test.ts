import { describe, expect, it } from "vitest";

import {
  phasePrompt,
  retryContractPrompt,
  retryReworkPrompt
} from "../src/index.js";

describe("phasePrompt", () => {
  it("renders a stable implementer prompt with the expected markers", () => {
    const output = phasePrompt({
      phase: "implementer",
      prdDir: "tasks/prd-orquestrador-em-codigo",
      taskNumber: 9,
      taskContent: "# Tarefa 9.0\n\nImplementar prompts.",
      sharedMemoryPath: "tasks/prd-orquestrador-em-codigo/MEMORY.md",
      taskMemoryPath: "tasks/prd-orquestrador-em-codigo/memory/9_task.md"
    });

    expect(output).toContain("flow-implementer");
    expect(output).toContain("report_implementer_result");
    expect(output).toContain("tasks/prd-orquestrador-em-codigo/09_task.md");
    expect(output).toMatchInlineSnapshot(`
      "Aplique a skill \`flow-implementer\` a task abaixo.

      Contexto:
      - PRD dir: tasks/prd-orquestrador-em-codigo
      - Task: 9
      - Task file: tasks/prd-orquestrador-em-codigo/09_task.md
      - Memoria compartilhada: tasks/prd-orquestrador-em-codigo/MEMORY.md
      - Memoria da task: tasks/prd-orquestrador-em-codigo/memory/9_task.md

      Conclua invocando o tool report_implementer_result conforme contrato declarado no frontmatter da skill.
      NAO encerre antes de invocar o tool.

      --- Conteudo do 09_task.md ---
      # Tarefa 9.0

      Implementar prompts."
    `);
  });
});

describe("retryContractPrompt", () => {
  it("prefixes the base prompt with a contract reminder", () => {
    const output = retryContractPrompt({
      basePrompt: "PROMPT BASE",
      completionTool: "report_implementer_result"
    });

    expect(output).toContain("ATENCAO");
    expect(output).toContain("report_implementer_result");
    expect(output).toMatchInlineSnapshot(`
      "ATENCAO: Na tentativa anterior voce encerrou sem invocar o tool report_implementer_result.
      Isso viola o contrato da fase. Nesta tentativa, ANTES de encerrar, invoque
      report_implementer_result com input valido conforme o schema declarado pela skill.

      PROMPT BASE"
    `);
  });
});

describe("retryReworkPrompt", () => {
  it("lists reviewer issues with severity markers and preserves the base prompt", () => {
    const output = retryReworkPrompt({
      basePrompt: "PROMPT BASE",
      issues: [
        {
          severity: "critical",
          category: "security",
          description: "Senha em log estruturado",
          file_path: "auth.service.ts",
          line: 42
        },
        {
          severity: "high",
          category: "validation",
          description: "Falta de validacao de input",
          file_path: "api/users.ts",
          line: 120
        }
      ]
    });

    expect(output).toContain("[critical]");
    expect(output).toContain("report_implementer_result");
    expect(output).toMatchInlineSnapshot(`
      "O Reviewer rejeitou a implementacao anterior com as issues abaixo.
      Corrija cada uma e invoque report_implementer_result novamente.

      Issues:
      - [critical] auth.service.ts:42 [security] Senha em log estruturado
      - [high] api/users.ts:120 [validation] Falta de validacao de input

      PROMPT BASE"
    `);
  });
});
