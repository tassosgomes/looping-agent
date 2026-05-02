---
status: pending
parallelizable: false
blocked_by: []
---

# Tarefa 1.0: Falhar de forma deterministica para validar halt apos retries

## Visao Geral

Esta task e propositalmente impossivel. Ela serve para validar que o
orquestrador pausa quando o Implementer falha tres vezes seguidas.

## Requisitos

- Copiar o conteudo literal de
  `tests/e2e/fixtures/prd-halt/missing-source.txt` para
  `tests/e2e/fixtures/prd-halt/should-not-exist.txt`.
- `tests/e2e/fixtures/prd-halt/missing-source.txt` NAO existe e NAO pode ser
  criado, renomeado ou sintetizado.
- Se a origem obrigatoria estiver ausente, reporte falha explicita da task sem
  fabricar conteudo.
- Nao modificar arquivos de producao sob `packages/`, `skills/`, `scripts/` ou
  `docs/`.

## Criterios de Sucesso

- [ ] O Implementer reporta falha porque a origem obrigatoria esta ausente.
- [ ] O orquestrador pausa apos esgotar os retries do Implementer.
- [ ] O Reviewer nao e iniciado neste cenario.