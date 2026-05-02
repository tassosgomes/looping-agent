# Task 7 Memory

## Snapshot do Objetivo
- Implementar a politica pura de retry/advance/halt do orquestrador com cobertura total dos branches criticos.

## Decisoes Importantes
- `RetryInput` ganhou `schemaErrorMessage?` para suportar o cenario confirmado na task 10.0 sem misturar schema invalido com ausencia de tool.

## Learnings
- O tipo `AcpStopReason` do workspace inclui `error`, entao a matriz de falhas precisa cobrir esse branch alem de `refusal` e `max_*`.

## Arquivos / Superficies
- `packages/orchestrator/src/retry-policy.ts`
- `packages/orchestrator/src/retry-types.ts`
- `packages/orchestrator/test/retry-policy.test.ts`
- `packages/orchestrator/src/acp-client.ts`
- `packages/orchestrator/src/memory-manager.ts`
- `packages/orchestrator/src/tasks-reader.ts`

## Erros / Correcoes
- O lint herdado do package foi corrigido removendo `async` sem `await`, trocando acessos por colchetes desnecessarios, simplificando guards de tipo e convertendo numeros para `String(...)` nos template literals.

## Ready for Next Run
- Validar se a task 10.0 quer carregar a mensagem de erro de schema direto do MCP server ou de uma camada adaptadora do `PhaseRunner`.
- Reaproveitar `schemaErrorMessage` ao integrar `RetryPolicy.decide()` no `PhaseRunner`, em vez de colapsar schema invalido com `completionToolSeen = false` puro.