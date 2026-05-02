---
status: completed
parallelizable: true
blocked_by: [2.0]
---

<task_context>
<domain>engine/orchestrator</domain>
<type>implementation</type>
<scope>core_feature</scope>
<complexity>low</complexity>
<dependencies>none</dependencies>
<unblocks>"10.0"</unblocks>
</task_context>

# Tarefa 9.0: Orchestrator — prompts templates

## Relacionada as User Stories

- US: pipeline pausa imediatamente quando esgotar retries (suporte — instrucoes claras de retry)

## Visao Geral

Implementar 3 templates de prompt usados pelo PhaseRunner para construir o `session/prompt`
ACP: o prompt base de aplicacao da skill de fase, o prefixo de retry quando o
`completion_tool` nao foi invocado (ADR-005), e o prefixo de retry quando o reviewer
rejeitou com `issues[]`. Funcoes puras que recebem dados e retornam string.

## Requisitos

- Funcoes puras (entrada -> string), sem I/O
- Template do prompt de fase inclui caminhos de memoria (shared + per-task) e do task file
- Template de retry de contrato (ADR-005) e claro quanto a obrigatoriedade do tool de conclusao
- Template de rework lista `issues[]` formatadas com severidade

## Arquivos Envolvidos

- **Criar:**
  - `packages/orchestrator/src/prompts/phase-prompt.ts`
  - `packages/orchestrator/src/prompts/retry-contract.ts`
  - `packages/orchestrator/src/prompts/retry-rework.ts`
  - `packages/orchestrator/src/prompts/index.ts` (re-export)
  - `packages/orchestrator/test/prompts.test.ts`
- **Modificar:** —
- **Referencia:**
  - `tasks/prd-orquestrador-em-codigo/prd.md` RF-04 (instrucoes de retry) e secao "Como o orquestrador invoca uma fase"
  - `tasks/prd-orquestrador-em-codigo/adrs/adr-005.md`
- **Skills para consultar durante implementacao:**
  - `flow-implementer`, `flow-reviewer`, `flow-finalizer` — formato esperado pelas skills de fase

## Subtarefas

- [x] 9.1 `phasePrompt({ phase, prdDir, taskNumber, taskContent, sharedMemoryPath, taskMemoryPath })` -> string
- [x] 9.2 `retryContractPrompt({ basePrompt, completionTool })` -> string (prefixo + base)
- [x] 9.3 `retryReworkPrompt({ basePrompt, issues })` -> string (lista as issues formatadas)
- [x] 9.4 Testes: snapshot do output (estavel) e validacao de presenca de marcadores chave (`flow-implementer`, `report_implementer_result`, etc.)

## Sequenciamento

- Bloqueado por: 2.0
- Desbloqueia: 10.0
- Paralelizavel: Sim

## Rastreabilidade

- Esta tarefa cobre: RF-04 criterio "passar issues[] do review como conteudo adicional", RF-05 criterio "mensagem indicando o erro de schema", ADR-005
- Evidencia esperada: snapshots dos 3 templates revisados manualmente; testes verificam presenca de tokens chave.

## Detalhes de Implementacao

**Template `phasePrompt` (sketch):**

```
Aplique a skill `flow-{phase}` a task abaixo.

Contexto:
- PRD dir: {prdDir}
- Task: {taskNumber}
- Memoria compartilhada: {sharedMemoryPath}
- Memoria da task: {taskMemoryPath}

Conclua invocando o tool {completionTool} conforme contrato declarado no frontmatter da skill.
NAO encerre antes de invocar o tool.

--- Conteudo do {N}_task.md ---
{taskContent}
```

**Template `retryContractPrompt` (ADR-005):**

```
ATENCAO: Na tentativa anterior voce encerrou sem invocar o tool {completionTool}.
Isso viola o contrato da fase. Nesta tentativa, ANTES de encerrar, invoque
{completionTool} com input valido conforme o schema declarado pela skill.

{basePrompt}
```

**Template `retryReworkPrompt`:**

```
O Reviewer rejeitou a implementacao anterior com as issues abaixo.
Corrija cada uma e invoque report_implementer_result novamente.

Issues:
- [critical] auth.service.ts:42 — Senha em log estruturado
- [high] api/users.ts:120 — Falta de validacao de input

{basePrompt}
```

**Convencoes da stack:**

- Sem `any` — entradas tipadas
- Strings montadas via template literals (sem template engine)
- Saida estavel (mesma entrada -> mesma saida) para suportar reprodutibilidade RF-03

## Criterios de Sucesso (Verificaveis)

- [x] Testes passam: `npm test --workspace=@looping-agent/orchestrator -- prompts`
- [x] Snapshot estavel (mesmo input gera mesmo output) — verificavel rodando 2x
- [x] Marcadores presentes: `phasePrompt({ phase: "implementer", ... })` contem `flow-implementer` E `report_implementer_result`
- [x] `retryReworkPrompt({ issues: [{severity:"critical",...}] })` lista `[critical]` na saida
- [x] Build compila
