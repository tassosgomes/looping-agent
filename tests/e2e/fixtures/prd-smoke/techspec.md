# TechSpec Smoke Fixture

## Estrategia

- O implementer deve criar apenas um artefato local sob
  `tests/e2e/fixtures/prd-smoke/`.
- Nenhum arquivo sob `packages/`, `skills/`, `scripts/` ou `docs/` deve ser
  alterado manualmente para concluir a task.
- O reviewer deve conseguir rodar build, testes, lint e typecheck do repo sem
  regressao.
- O finalizer deve conseguir commitar a mudanca no workspace temporario e fazer
  merge fast-forward em `main` dentro do repositorio sintetico preparado pelo
  runner.

## Artefato esperado

- `tests/e2e/fixtures/prd-smoke/hello.txt`

Conteudo exato:

```text
hello from smoke fixture
```