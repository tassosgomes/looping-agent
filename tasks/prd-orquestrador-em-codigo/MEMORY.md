# Workflow Memory — Orquestrador em Codigo

## Estado Atual
- Tarefas 1 a 6 ja prepararam os componentes base do package `@looping-agent/orchestrator`.

## Decisoes Compartilhadas
- O RetryPolicy vai permanecer como logica pura isolada para ser consumida pelo `PhaseRunner` na task 10.0.
- O release npm precisa publicar os quatro workspaces (`schemas`, `mcp-server`, `orchestrator`, `cli`) porque o pacote `@looping-agent/cli` depende dos demais em runtime; publicar apenas o CLI deixaria dependencias nao resolvidas no install.

## Learnings Compartilhados
- O contrato de schema invalido precisa de um sinal explicito no input do retry policy para diferenciar input invalido de ausencia total do completion tool.
- O package `@looping-agent/orchestrator` voltou a passar em lint apos remover `async` sem `await`, guards redundantes e template literals com numeros crus em `src/acp-client.ts`, `src/memory-manager.ts` e `src/tasks-reader.ts`.
- A integracao do `PhaseRunner` precisou de dois sinais no `McpServerHandle`: callback para tool_call validado e callback separado para erro de schema; olhar apenas notificacoes ACP nao basta para distinguir contrato ausente de payload invalido.
- O cleanup da `PhaseRunner` deve chamar `session.close()` no `finally` de forma explicita, sem depender do comportamento interno de `awaitFinal()`.

## Riscos Abertos
- A integracao do `PhaseRunner` precisara alinhar `completionToolSeen` com `schemaErrorMessage` para acionar `reinforcement.kind = "schema"`.

## Handoffs
- A task 10.0 deve consumir `decide()` diretamente e reutilizar os tipos exportados por `@looping-agent/orchestrator`.
- A task 11.0 pode reutilizar o mesmo `mcpHandle` vivo entre fases e attempts, porque a `PhaseRunner` agora registra e remove listeners por execucao.