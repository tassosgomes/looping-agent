---
status: pending
parallelizable: false
blocked_by: []
---

# Tarefa 1.0: Criar hello.txt local para validar o fluxo completo

## Visao Geral

Esta task existe apenas para validar o fluxo end-to-end do Looping Agent usando
um runtime ACP real. O objetivo e produzir um artefato local simples sem tocar
em codigo de producao.

## Requisitos

- Criar `tests/e2e/fixtures/prd-smoke/hello.txt`.
- O conteudo do arquivo deve ser exatamente `hello from smoke fixture` seguido
  de quebra de linha.
- Nao modificar manualmente arquivos sob `packages/`, `skills/`, `scripts/` ou
  `docs/` para concluir esta task.
- Sao permitidos apenas os artefatos operacionais normais do workflow:
  `*_task_review.md`, `MEMORY.md`, `memory/*.md`, `tasks.md`,
  `docs/ai-dev/quality-ledger.md` e telemetria.

## Criterios de Sucesso

- [ ] `tests/e2e/fixtures/prd-smoke/hello.txt` existe com o conteudo esperado.
- [ ] O repo continua verde em `npm run build`, `npm run test`, `npm run lint`
  e `npm run typecheck`.
- [ ] Nenhum arquivo sob `packages/` foi alterado para satisfazer a task.