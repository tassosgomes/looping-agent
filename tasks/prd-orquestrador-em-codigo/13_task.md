---
status: completed
parallelizable: true
blocked_by: [2.0]
---

<task_context>
<domain>cli/renderer</domain>
<type>implementation</type>
<scope>core_feature</scope>
<complexity>medium</complexity>
<dependencies>none</dependencies>
<unblocks>"15.0"</unblocks>
</task_context>

# Tarefa 13.0: CLI — terminal renderer

## Relacionada as User Stories

- US: ver status de cada task em tempo real

## Visao Geral

Renderizar progresso do loop no terminal com cores, spinners e streaming de notificacoes
ACP. Inclui formatador especializado por tipo de notificacao (`plan`,
`agent_message_chunk`, `tool_call`, `tool_call_update`) e suporte a `--no-color` para
ambientes sem TTY. Funcoes puras retornam strings; `terminal-ui.ts` cuida do spinner +
escrita.

## Requisitos

- Cores via `picocolors` (sem deps grandes)
- Spinner via `ora`
- `--no-color` desativa tudo (`NO_COLOR` env tambem respeitado)
- Streaming continuo: cada notificacao renderiza ao chegar, sem buffer
- Header por task / fase / tentativa para contexto humano
- Falha (halt) renderizada com cor distinta + path do estado persistido

## Arquivos Envolvidos

- **Criar:**
  - `packages/cli/src/renderer/terminal-ui.ts`
  - `packages/cli/src/renderer/notification-formatter.ts`
  - `packages/cli/src/renderer/colors.ts` (wrapper sobre `picocolors` com toggle)
  - `packages/cli/src/renderer/types.ts`
  - `packages/cli/test/renderer/notification-formatter.test.ts`
  - `packages/cli/test/renderer/colors.test.ts`
- **Modificar:**
  - `packages/cli/package.json` (deps: `picocolors`, `ora`)
- **Referencia:**
  - `tasks/prd-orquestrador-em-codigo/prd.md` secao "Experiencia do Usuario"
  - `tasks/prd-orquestrador-em-codigo/techspec.md` secao "Logs do orquestrador"
- **Skills para consultar durante implementacao:** —

## Subtarefas

- [x] 13.1 `colors.ts`: wrapper que aplica cores apenas se TTY e `NO_COLOR` ausente e `--no-color` nao passado
- [x] 13.2 `notification-formatter.ts`: funcoes puras `formatPlan`, `formatAgentMessage`, `formatToolCall`, `formatToolCallUpdate` retornando string
- [x] 13.3 `terminal-ui.ts`: API `createTerminalUi({ noColor, debug })` com metodos `taskStarted`, `phaseStarted`, `notification`, `phaseEnded`, `taskEnded`, `runStarted`, `runEnded`, `halt`
- [x] 13.4 Spinner por fase (start em `phaseStarted`, stop em `phaseEnded`)
- [x] 13.5 `halt` renderiza em vermelho + path do telemetry JSON
- [x] 13.6 Testes: snapshots dos formatadores (saida estavel para mesmo input)
- [x] 13.7 Testes: `--no-color` -> string sem ANSI
- [x] 13.8 Testes: `formatToolCall({ name: "report_implementer_result", ... })` contem o nome do tool

## Sequenciamento

- Bloqueado por: 2.0 (consome tipos `AcpNotification` re-exportados via orchestrator? — ou copiar em renderer/types.ts para evitar dep circular)
  - **Decisao:** definir `AcpNotificationView` em `packages/cli/src/renderer/types.ts` para nao depender do orchestrator. Mapeamento ocorre no `run` command.
- Desbloqueia: 15.0
- Paralelizavel: Sim

## Rastreabilidade

- Esta tarefa cobre: PRD secao "Experiencia do Usuario" criterios de UX
- Evidencia esperada: snapshots cobrem cada tipo de notificacao; saida ANSI desativada com `--no-color`.

## Detalhes de Implementacao

**API sugerida:**

```typescript
// packages/cli/src/renderer/types.ts
export interface TerminalUi {
  runStarted(meta: { prdSlug: string; tasksTotal: number }): void;
  taskStarted(meta: { taskNumber: number; title: string }): void;
  phaseStarted(meta: { phase: string; attempt: number; maxRetries: number }): void;
  notification(n: AcpNotificationView): void;
  phaseEnded(meta: { phase: string; outcome: "advance" | "retry" | "halt" }): void;
  taskEnded(meta: { taskNumber: number; status: "completed" | "halted" }): void;
  halt(meta: { reason: string; telemetryPath: string }): void;
  runEnded(meta: { summaryPath: string; status: "completed" | "halted" }): void;
}
```

**Convencoes da stack:**

- Sem `any`
- Funcoes formatadoras puras (sem efeitos)
- `terminal-ui.ts` e a unica camada com efeito (stdout + spinner)
- Honrar `NO_COLOR` (https://no-color.org/)

## Criterios de Sucesso (Verificaveis)

- [x] Testes passam: `npm test --workspace=@looping-agent/cli -- renderer`
- [x] Cobertura >= 70% (renderer slice validado com 88.65% statements / 89.47% lines)
- [x] `formatPlan({...})` snapshot estavel
- [x] `colors({ noColor: true })` retorna funcoes que nao adicionam ANSI
- [x] `formatToolCall({ name: "report_review_result", input: {...} })` contem `report_review_result`
- [x] Build compila
