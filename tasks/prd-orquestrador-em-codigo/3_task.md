---
status: completed
parallelizable: true
blocked_by: [2.0]
---

<task_context>
<domain>engine/mcp</domain>
<type>integration</type>
<scope>core_feature</scope>
<complexity>medium</complexity>
<dependencies>external_apis</dependencies>
<unblocks>"10.0,14.0"</unblocks>
</task_context>

# Tarefa 3.0: Package `@looping-agent/mcp-server` (servidor MCP local com 3 tools `report_*`)

## Relacionada as User Stories

- US: pipeline pausa imediatamente quando esgotar retries (suporte — captura outcome via tool_call)

## Visao Geral

Implementar um servidor MCP local em stdio (mesma processo do CLI) que expoe os 3 tools
de conclusao (`report_implementer_result`, `report_review_result`,
`report_finalizer_result`). O servidor recebe input dos agentes ACP, valida via Zod
contra os schemas do `@looping-agent/schemas` e roteia para um callback fornecido pelo
orquestrador. ADR-002 fundamenta esta decisao.

## Requisitos

- Stdio transport apenas (sem TCP/HTTP — restricao de seguranca da TechSpec)
- Validacao Zod em toda invocacao; falha de schema retorna erro estruturado ao agente
- API publica: `createMcpServer({ onToolCall, onError })` retorna handle controlavel
  (`start()`, `stop()`, `getEndpoint()`)
- Smoke test: client mock invoca tools e callback recebe input parseado

## Arquivos Envolvidos

- **Criar:**
  - `packages/mcp-server/src/index.ts` (re-export `createMcpServer`)
  - `packages/mcp-server/src/server.ts` (implementacao stdio + registro dos 3 tools)
  - `packages/mcp-server/src/tool-handlers.ts` (validacao Zod + roteamento ao callback)
  - `packages/mcp-server/src/types.ts` (`McpServerHandle`, `OnToolCall` callback signature)
  - `packages/mcp-server/test/server.test.ts`
  - `packages/mcp-server/test/tool-handlers.test.ts`
- **Modificar:**
  - `packages/mcp-server/package.json` (declarar dep `@modelcontextprotocol/sdk`, `@looping-agent/schemas` workspace, `zod`)
- **Referencia:**
  - `tasks/prd-orquestrador-em-codigo/adrs/adr-002.md`
  - `tasks/prd-orquestrador-em-codigo/techspec.md` secao "Endpoints de API" (linhas sobre exit codes do MCP)
  - `tasks/prd-orquestrador-em-codigo/prd.md` RF-05
- **Skills para consultar durante implementacao:**
  - `flow-quality-ledger` (formato de issues no `report_review_result`)

## Subtarefas

- [x] 3.1 Definir tipo `OnToolCall` (uniao discriminada por nome do tool, input ja validado)
- [x] 3.2 Implementar `tool-handlers.ts` (parse com Zod, retorna `{ ok: true }` ou erro estruturado)
- [x] 3.3 Implementar `server.ts` usando `@modelcontextprotocol/sdk` em transporte stdio
- [x] 3.4 Registrar os 3 tools com nome, description e inputSchema (derivado dos Zod schemas)
- [x] 3.5 Implementar `start()`/`stop()` com cleanup de listeners
- [x] 3.6 Testes: client mock invoca cada tool com input valido e invalido
- [x] 3.7 Teste: callback recebe input ja parseado por Zod (tipos corretos)

## Sequenciamento

- Bloqueado por: 2.0
- Desbloqueia: 10.0, 14.0
- Paralelizavel: Sim (paralelo a 4.0, 5.0, 6.0, 7.0, 8.0, 9.0)

## Rastreabilidade

- Esta tarefa cobre: RF-05 (entrega dos tools de conclusao), ADR-002
- Evidencia esperada: testes mostram que client MCP mockado invoca tool e callback recebe input validado; entrada invalida retorna erro de schema sem chamar callback.

## Detalhes de Implementacao

**API publica (assinatura sugerida):**

```typescript
// packages/mcp-server/src/types.ts
import type {
  ReportImplementerResultT,
  ReportReviewResultT,
  ReportFinalizerResultT,
} from "@looping-agent/schemas";

export type ToolCallEvent =
  | { tool: "report_implementer_result"; input: ReportImplementerResultT }
  | { tool: "report_review_result"; input: ReportReviewResultT }
  | { tool: "report_finalizer_result"; input: ReportFinalizerResultT };

export interface McpServerHandle {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface CreateMcpServerOptions {
  onToolCall: (evt: ToolCallEvent) => Promise<void> | void;
  onError?: (err: Error) => void;
}
```

**Resposta a input invalido:**

Retornar erro MCP com `code` apropriado e mensagem incluindo o caminho do campo invalido
(usar `result.error.format()` do Zod). NAO chamar `onToolCall` se a validacao falhar.

**Convencoes da stack:**

- Sem `any` — usar uniao discriminada para `ToolCallEvent`
- Cleanup obrigatorio em `stop()` (remover listeners stdio, fechar socket virtual)
- Erros internos do servidor nao podem derrubar o processo principal (tratar com try/catch + `onError`)

## Criterios de Sucesso (Verificaveis)

- [x] Testes passam: `npm test --workspace=@looping-agent/mcp-server`
- [x] Build compila: `npm run build --workspace=@looping-agent/mcp-server`
- [x] Cobertura >= 80%
- [x] Teste com input invalido demonstra que callback NAO foi chamado e erro estruturado foi retornado
- [x] Teste com input valido demonstra que callback recebeu input com tipo correto (asserts de campo)
- [x] `start()` + `stop()` em sequencia limpa nao deixa handles pendurados (verificar com `process._getActiveHandles?.()` no teste)
