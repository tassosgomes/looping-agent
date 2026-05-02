---
status: completed
parallelizable: false
blocked_by: [2.0, 3.0, 4.0, 7.0, 8.0, 9.0]
---

<task_context>
<domain>engine/orchestrator</domain>
<type>integration</type>
<scope>core_feature</scope>
<complexity>high</complexity>
<dependencies>external_apis</dependencies>
<unblocks>"11.0"</unblocks>
</task_context>

# Tarefa 10.0: Orchestrator — PhaseRunner (sessao ACP + captura de tool_call)

## Relacionada as User Stories

- US: invocar orquestrador via CLI sobre PRD
- US: pipeline pausa imediatamente quando esgotar retries
- US: ver status de cada task em tempo real (suporte — emite notificacoes para a UI)

## Visao Geral

Componente central da fase: integra ACP client + MCP server + RetryPolicy + Telemetry +
Prompts. Para uma fase (`implementer`/`reviewer`/`finalizer`), abre sessao ACP, envia
prompt instruindo aplicar a skill correspondente, escuta notificacoes, captura
`tool_call` de conclusao via MCP server, valida com Zod, decide via RetryPolicy e
retorna `PhaseRunnerResult` (advance/retry/halt). Tambem captura `stopReason` final.

## Requisitos

- 1 chamada `run(opts)` -> 1 fase completa (potencialmente multiplas tentativas internas
  ate atingir advance ou halt) **OU** 1 chamada == 1 tentativa, e o Loop coordena retry.
  Decisao: **1 chamada == 1 tentativa**, simplifica testes e cobertura. O Loop e quem
  re-invoca em retry. Esta decisao sera explicitada na PR.
- Validar input do `tool_call` via Zod do `@looping-agent/schemas`; em falha, marcar
  `completionToolSeen: false` e propagar para o Loop tratar como contrato violado
  (RetryPolicy decide retry/halt)
- Streaming: invocar callback `onNotification` para cada notificacao recebida (consumido
  pela UI em tempo real)
- Cleanup: sessao ACP fechada em todos os caminhos
- Performance: overhead < 200ms (criterio TechSpec)

## Arquivos Envolvidos

- **Criar:**
  - `packages/orchestrator/src/phase-runner.ts`
  - `packages/orchestrator/src/phase-runner-types.ts` (`PhaseRunnerOptions`, `PhaseRunnerResult`)
  - `packages/orchestrator/test/phase-runner.test.ts`
- **Modificar:**
  - `packages/orchestrator/package.json` (deps internas: `@looping-agent/mcp-server`)
- **Referencia:**
  - `tasks/prd-orquestrador-em-codigo/techspec.md` secao "Interface PhaseRunner" e "Fluxo de uma task (Fase B)"
  - `tasks/prd-orquestrador-em-codigo/prd.md` RF-04, RF-05
  - `tasks/prd-orquestrador-em-codigo/adrs/adr-005.md`
- **Skills para consultar durante implementacao:**
  - `flow-implementer`, `flow-reviewer`, `flow-finalizer` — contratos das fases

## Subtarefas

- [x] 10.1 Tipos `PhaseRunnerOptions` e `PhaseRunnerResult` (TechSpec)
- [x] 10.2 `PhaseRunner.run(opts)` orquestra: monta prompt -> abre sessao -> envia -> escuta -> captura tool_call -> valida -> awaitFinal -> calcula `PhaseRunnerResult`
- [x] 10.3 Captura `tool_call` via callback do MCP server (recebe ja parseado por Zod)
- [x] 10.4 Lida com `tool_call` recebido com input invalido (cenario teorico — MCP retorna erro): registra `completionToolSeen: false` e propaga reinforcement `kind: "schema"`
- [x] 10.5 Subsidia telemetria via `TaskTelemetryHandle` recebido no opts
- [x] 10.6 Stream `onNotification(n)` para UI
- [x] 10.7 Cleanup ACP session em sucesso, falha e cancelamento (try/finally)
- [x] 10.8 Testes: mock ACP client + MCP server. Casos:
  - 10.8.a Fase `implementer` com `status: completed` -> `outcome: "advance"`
  - 10.8.b Fase `implementer` com `status: failed`, attempt < max -> `outcome: "retry"`
  - 10.8.c Fase `implementer` com `status: failed`, attempt = max -> `outcome: "halt"`
  - 10.8.d Fase `reviewer` com `requires_rework: true` + issues -> retry com reinforcement.rework
  - 10.8.e Fase `finalizer` com `committed: false` -> halt imediato
  - 10.8.f `stopReason: end_turn` sem `tool_call` -> retry ADR-005
  - 10.8.g `stopReason: refusal` -> retry com reinforcement.stop_reason_failure
- [x] 10.9 Benchmark: assert overhead < 200ms (medir entre `run()` invocado e prompt enviado, mais entre tool_call capturado e resultado retornado)

## Sequenciamento

- Bloqueado por: 2.0, 3.0, 4.0, 7.0, 8.0, 9.0
- Desbloqueia: 11.0
- Paralelizavel: Nao

## Rastreabilidade

- Esta tarefa cobre: RF-03 (sessao ACP, streaming), RF-04 (decisao retry/halt), RF-05 (captura tool_call + valida schema), RF-06 (alimenta TelemetryWriter)
- Evidencia esperada: 7 cenarios cobertos por teste; cobertura >= 85%; benchmark < 200ms.

## Detalhes de Implementacao

**API publica (TechSpec adaptado):**

```typescript
// packages/orchestrator/src/phase-runner-types.ts
import type { PhaseName, RetryDecision } from "./retry-types";
import type { AcpNotification } from "./acp-types";

export interface PhaseRunnerOptions {
  phase: PhaseName;
  taskNumber: number;
  prdDir: string;
  taskContent: string;
  attempt: number;          // 1-indexed
  maxRetries: number;
  acpClient: AcpClient;     // injetavel para testes
  mcpHandle: McpServerHandle;
  telemetryHandle: TaskTelemetryHandle;
  reinforcement?: PromptReinforcement; // do retry anterior
  sharedMemoryPath: string;
  taskMemoryPath: string;
  onNotification?(n: AcpNotification): void;
}

export interface PhaseRunnerResult {
  decision: RetryDecision;  // advance/retry/halt — vem do RetryPolicy
  attemptDuration_ms: number;
  stopReason: AcpStopReason;
  tokens: { input: number; output: number } | null;
  completionToolSeen: boolean;
}
```

**Fluxo interno:**

```
1. Montar prompt:
   - se reinforcement.kind === "contract" -> retryContractPrompt
   - se reinforcement.kind === "rework"   -> retryReworkPrompt
   - else -> phasePrompt

2. Configurar callback do MCP server (onToolCall) para resolver promise interna
   com o input validado (ja parseado por Zod no MCP server task 3.0)

3. acpClient.openSession() -> session
4. session.onNotification(n => { telemetry.recordNotification(...); opts.onNotification?.(n); })
5. session.sendPrompt(prompt)
6. Aguardar Promise.race([session.awaitFinal(), toolCallPromise])
   - se toolCall vier antes do final, continuar aguardando final
7. Coletar { stopReason, tokens, completionInput }
8. RetryPolicy.decide(...) -> decision
9. session.close()
10. retornar PhaseRunnerResult
```

**Convencoes da stack:**

- Sem `any` — uniao discriminada para `RetryDecision`
- Cleanup obrigatorio (try/finally para `session.close()`)
- Logica complexa testada com mocks injetados via `opts`

## Criterios de Sucesso (Verificaveis)

- [x] Testes passam: `npm test --workspace=@looping-agent/orchestrator -- phase-runner`
- [x] Cobertura >= 85% no `phase-runner.ts`
- [x] Os 7 cenarios em 10.8.a–10.8.g passam
- [x] Benchmark assert: overhead < 200ms
- [x] Cleanup verificado: nenhum handle ativo apos `run()` em mock (assert com `process._getActiveHandles?.()` ou contagem de close)
- [x] Schema invalido capturado pelo MCP server resulta em `completionToolSeen: false` no resultado
