import type { CompletionToolNameT } from "@looping-agent/schemas";

export interface RetryContractPromptInput {
  basePrompt: string;
  completionTool: CompletionToolNameT;
}

export function retryContractPrompt(input: RetryContractPromptInput): string {
  return `ATENCAO: Na tentativa anterior voce encerrou sem invocar o tool ${input.completionTool}.
Isso viola o contrato da fase. Nesta tentativa, ANTES de encerrar, invoque
${input.completionTool} com input valido conforme o schema declarado pela skill.

${input.basePrompt}`;
}