---
status: completed
parallelizable: false
blocked_by: [5.0, 6.0, 8.0, 10.0]
---

<task_context>
<domain>engine/orchestrator</domain>
<type>integration</type>
<scope>core_feature</scope>
<complexity>high</complexity>
<dependencies>filesystem</dependencies>
<unblocks>"15.0,18.0"</unblocks>
</task_context>

# Tarefa 11.0: Orchestrator — Loop principal (sequencia tasks pendentes)

## Relacionada as User Stories

- US: invocar orquestrador via CLI sobre PRD
- US: pipeline pausa imediatamente quando esgotar retries
- US: comparar custo de tokens antes/depois (run-summary)

## Visao Geral

Orquestracao de alto nivel: itera tasks pendentes em ordem, e para cada task sequencia
as 3 fases (Implementer -> Reviewer -> Finalizer), aplicando retries conforme decisao
do PhaseRunner. Inicializa MCP server e ACP client uma vez por execucao do CLI. Persiste
telemetria por task e gera o `run-summary-YYYYMMDD-HHMMSS.json` ao final (RF-09 base).

## Requisitos

- Itera apenas tasks `[ ]` ou `[~]` (pular `[x]`)
- Pausa imediatamente em halt (RF-04) — nao tenta proxima task
- MCP server iniciado uma vez no inicio, encerrado ao final
- ACP client compartilhado entre tasks
- Run-summary final com totais (tasks, tokens, retries, duracao)
- API publica `runLoop(opts): Promise<RunResult>` consumida pelo CLI

## Arquivos Envolvidos

- **Criar:**
  - `packages/orchestrator/src/loop.ts`
  - `packages/orchestrator/src/index.ts` (re-export `runLoop`)
  - `packages/orchestrator/src/run-summary.ts` (calculo + persistencia)
  - `packages/orchestrator/test/loop.integration.test.ts`
  - `packages/orchestrator/test/run-summary.test.ts`
- **Modificar:** —
- **Referencia:**
  - `tasks/prd-orquestrador-em-codigo/techspec.md` secao "Fluxo de uma task (Fase B)" e "Metricas agregadas (RF-09)"
  - `tasks/prd-orquestrador-em-codigo/prd.md` RF-03, RF-04, RF-09
- **Skills para consultar durante implementacao:**
  - `flow-workflow-memory`

## Subtarefas

- [x] 11.1 API `runLoop({ prdDir, maxRetries, runtime, onProgress, signal? }): Promise<RunResult>`
- [x] 11.2 `RunResult { status, tasksCompleted, tasksHalted, haltTaskNumber?, haltReason? }`
- [x] 11.3 Inicializa MCP server uma vez (compartilhado entre tasks)
- [x] 11.4 Inicializa AcpClient + detecta runtime
- [x] 11.5 Inicializa MemoryManager (cria estrutura)
- [x] 11.6 Loop por task pendente: invoca PhaseRunner para cada fase, aplica retry ate `advance` ou `halt`
- [x] 11.7 Halt em qualquer fase pausa o pipeline imediatamente
- [x] 11.8 Cleanup garantido (MCP server, ACP client) em sucesso e falha
- [x] 11.9 Run-summary persistido em `tasks/prd-X/telemetry/run-summary-<ts>.json`
- [x] 11.10 Suporte a `AbortSignal` para cancelamento (Ctrl+C limpo)
- [x] 11.11 **Recoverability MCP:** se PhaseRunner reportar erro indicando crash do MCP
  server, fazer `mcpServer.stop()` + `createMcpServer()` + `start()` antes do retry da
  fase corrente. Conta como tentativa. (Decisao registrada na TechSpec "Questoes em
  Aberto".)
- [x] 11.12 Testes integrados: 3 tasks, todas sucesso -> run-summary correto
- [x] 11.13 Testes: task 2 com halt apos 3 retries no implementer -> tasks 3+ nao sao executadas
- [x] 11.14 Testes: task ja `[x]` e pulada (RF-03 criterio)
- [x] 11.15 Teste: simular crash do MCP server (exception no `onToolCall` via mock) ->
  Loop respawna o MCP server e retry da fase

## Sequenciamento

- Bloqueado por: 5.0, 6.0, 8.0, 10.0 (e indiretamente 2.0, 3.0, 4.0, 7.0, 9.0)
- Desbloqueia: 15.0, 18.0
- Paralelizavel: Nao

## Rastreabilidade

- Esta tarefa cobre: RF-03 (sequencia tasks, pula concluidas), RF-04 (halt-on-failure pausa pipeline), RF-06 (telemetria por task), RF-07 (instancia MemoryManager), RF-09 (base do run-summary)
- Evidencia esperada: integration test simula 3 tasks com mocks de ACP/MCP; cenario de halt nao executa tasks subsequentes; run-summary tem campos exigidos.

## Detalhes de Implementacao

**API:**

```typescript
// packages/orchestrator/src/loop.ts
export interface RunLoopOptions {
  prdDir: string;
  maxRetries?: number;            // default 3
  preferredRuntime?: RuntimeKind; // se ausente, detecta automaticamente
  onProgress?(evt: ProgressEvent): void; // streaming para CLI UI
  signal?: AbortSignal;
}

export interface RunResult {
  status: "completed" | "halted";
  tasksTotal: number;
  tasksCompleted: number;
  tasksHalted: number;
  haltTaskNumber?: number;
  haltReason?: string;
  totalIterations: number;
  totalTokens: { input: number; output: number } | null;
  totalDurationMs: number;
  summaryPath: string; // path do run-summary*.json
}

export async function runLoop(opts: RunLoopOptions): Promise<RunResult>;
```

**Fluxo:**

```
1. detectRuntime(opts.preferredRuntime) -> runtime
2. mcpServer = createMcpServer({ onToolCall: trackCallback })
   await mcpServer.start()
3. acpClient = new AcpClient({ runtime, mcpEndpoint: mcpServer.endpoint })
4. memoryManager.initialize(prdDir)
5. tasksReader = new TasksReader(prdDir + "/tasks.md")
6. while (task = tasksReader.getNextPending()):
   try:
     paths = memoryManager.pathsForTask(prdDir, task.number)
     handle = telemetry.startTask(task.number, prdSlug)
     content = await tasksReader.getTaskFile(task.number)

     for each phase in [implementer, reviewer, finalizer]:
       attempt = 1; reinforcement = undefined
       while attempt <= maxRetries:
         result = phaseRunner.run({ phase, ... attempt, reinforcement, ... })
         opts.onProgress?.(...)
         match result.decision:
           "advance" -> break inner while; continue to next phase
           "retry"   -> reinforcement = result.decision.reinforcement; attempt++
           "halt"    -> handle.finalize("halted", reason); return RunResult halted

     handle.finalize("completed")
   catch err:
     handle.finalize("failed")
     throw

7. summary = computeRunSummary(...)
8. await persistRunSummary(summary)
9. return summary
finally:
   await mcpServer.stop(); await acpClient.dispose();
```

**Convencoes da stack:**

- Sem `any`
- Cleanup garantido via try/finally em multiplos niveis
- AbortSignal -> propagado para `acpClient.openSession()` e MCP server

## Criterios de Sucesso (Verificaveis)

- [x] Testes passam: `npm test --workspace=@looping-agent/orchestrator -- loop run-summary`
- [x] Cobertura >= 80% no loop
- [x] Integration test com 3 tasks ok -> 3 telemetrias + 1 run-summary
- [x] Integration test com halt na task 2 -> task 3 nao e executada (assert com `phaseRunner.run` mock contagem)
- [x] Task `[x]` e pulada (assert no log/onProgress)
- [x] Cleanup: `mcpServer.stop()` e `acpClient.dispose()` chamados em sucesso E falha
- [x] AbortSignal cancela execucao limpa (sem handles pendurados no teste)
- [x] Run-summary JSON tem todos os campos da TechSpec secao "Metricas agregadas"
