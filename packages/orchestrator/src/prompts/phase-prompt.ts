import type { CompletionToolNameT } from "@looping-agent/schemas";

import { getTaskFileName } from "../task-file-path.js";
import type { PhaseName } from "../retry-types.js";

export interface PhasePromptInput {
  phase: PhaseName;
  prdDir: string;
  taskNumber: number;
  taskContent: string;
  sharedMemoryPath: string;
  taskMemoryPath: string;
}

const COMPLETION_TOOL_BY_PHASE: Record<PhaseName, CompletionToolNameT> = {
  implementer: "report_implementer_result",
  reviewer: "report_review_result",
  finalizer: "report_finalizer_result"
};

export function phasePrompt(input: PhasePromptInput): string {
  const completionTool = COMPLETION_TOOL_BY_PHASE[input.phase];
  const taskNumber = String(input.taskNumber);
  const taskFileName = getTaskFileName(input.taskNumber);
  const taskFilePath = `${input.prdDir}/${taskFileName}`;

  return `Aplique a skill \`flow-${input.phase}\` a task abaixo.

Contexto:
- PRD dir: ${input.prdDir}
- Task: ${taskNumber}
- Task file: ${taskFilePath}
- Memoria compartilhada: ${input.sharedMemoryPath}
- Memoria da task: ${input.taskMemoryPath}

Conclua invocando o tool ${completionTool} conforme contrato declarado no frontmatter da skill.
NAO encerre antes de invocar o tool.

--- Conteudo do ${taskFileName} ---
${input.taskContent}`;
}
