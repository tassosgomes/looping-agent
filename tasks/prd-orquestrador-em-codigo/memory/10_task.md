# Task 10 Memory

## Snapshot do Objetivo
- Integrar ACP + MCP + RetryPolicy + Telemetry numa `PhaseRunner` que execute uma unica tentativa por chamada e devolva `advance`/`retry`/`halt`.

## Decisoes Importantes
- `PhaseRunnerOptions` ganhou `runtime` explicitamente porque `AcpClient.openSession()` depende dela e a task 11 detecta a runtime fora da fase.
- O `McpServerHandle` passou a expor listeners de `tool_call` valido e de erro de schema para a fase distinguir payload invalido de ausencia do completion tool.

## Learnings
- O `RetryPolicy` ja suportava `reinforcement.kind = "schema"`; faltava a `PhaseRunner` preservar esse sinal sem colapsar tudo em `completionToolSeen = false` puro.
- Para cleanup robusto, a fase precisa fechar a sessao no `finally` mesmo quando o cliente ACP normalmente fecha dentro de `awaitFinal()`.

## Arquivos / Superficies
- `packages/orchestrator/src/phase-runner.ts`
- `packages/orchestrator/src/phase-runner-types.ts`
- `packages/orchestrator/test/phase-runner.test.ts`
- `packages/orchestrator/src/index.ts`
- `packages/orchestrator/package.json`
- `packages/mcp-server/src/types.ts`
- `packages/mcp-server/src/server.ts`
- `packages/mcp-server/src/tool-handlers.ts`
- `packages/mcp-server/src/index.ts`

## Erros / Correcoes
- O primeiro teste deixou escapar que o fechamento da sessao ainda dependia do comportamento do fake de `awaitFinal()`; a correcao foi mover o `close()` para o `finally` da `PhaseRunner`.
- O primeiro typecheck do MCP falhou porque os dispatchers ficaram fora de escopo em `server.ts`; a correcao foi injetar os callbacks em `createConfiguredServer()`.

## Ready for Next Run
- A task 11.0 deve passar o `runtime` detectado para cada `PhaseRunner.run()`.
- Se a task 11.0 quiser recuperar de crash do MCP, basta recriar o handle; a `PhaseRunner` nao guarda estado global do servidor.