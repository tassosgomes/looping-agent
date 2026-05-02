---
name: flow-quality-checks
description: Executa o pipeline completo de qualidade do stack (build, testes, lint, type check) e produz um relatório estruturado. Use no início da revisão, antes da análise semântica. Não use para execução de testes específicos (isso é atribuição do implementer durante desenvolvimento).
pipeline_stage: runtime
consumed_by: [reviewer]
requires: []
produces: ["Quality Pipeline Report"]
---

# Run Quality Checks

Executa o pipeline completo de qualidade e produz output estruturado para o reviewer decidir se entra em análise semântica ou rejeita imediatamente.

## Quando usar

- No Reviewer, imediatamente após ler a memória do workflow
- Antes de carregar `flow-code-review`
- Antes de rodar qualquer validação vs. PRD/TechSpec

## Pipeline por stack

### Java / Maven

```bash
mvn clean verify
```

Inclui: compile, test, integration-test (se configurado), spotless/checkstyle (se configurado).

Se houver test containers pesados configurados como `@Tag("slow")`, rode-os separadamente:

```bash
mvn verify -Pslow-tests
```

### .NET / C#

```bash
dotnet build --configuration Release --no-restore
dotnet test --configuration Release --no-build --logger "trx;LogFileName=test-results.trx"
```

Se o projeto tem `dotnet format`:

```bash
dotnet format --verify-no-changes
```

### React / TypeScript / Node

```bash
npm run build
npm run test -- --run
npm run lint
npm run typecheck
```

Se houver um único gate (`npm run ci` ou `npm run verify`), use-o:

```bash
npm run verify
```

## Ordem de execução

Execute nesta ordem — a ordem é importante para dar feedback rápido:

1. **Build / compile** — se falha aqui, tudo mais é irrelevante
2. **Type check** (quando separado do build, ex: React/TS)
3. **Lint / format check**
4. **Testes unitários**
5. **Testes de integração** (se aplicáveis e rápidos)
6. **Testes lentos / E2E** (apenas se a tarefa explicitamente exigir)

**Regra de short-circuit:** se qualquer etapa falha, PARE. Reporte a falha e saia. Não rode as etapas seguintes cegamente.

## Testes que devem ser pulados

- Testes marcados como `@Disabled`, `@Ignore`, `@Skip` (respeitar a marcação original)
- Testes E2E que dependem de infra externa não disponível no ambiente da revisão
- Testes de performance (a menos que a tarefa seja especificamente sobre performance)

## Output estruturado

Produza SEMPRE este formato, independente do resultado:

```
QUALITY PIPELINE REPORT
-----------------------
Stack: [Java | .NET | React]
Commands executed:
  1. [comando 1] → [PASS | FAIL] (exit code: N, duration: Xs)
  2. [comando 2] → [PASS | FAIL] (exit code: N, duration: Xs)
  ...

Summary:
  - Build: [PASS | FAIL]
  - Type check: [PASS | FAIL | N/A]
  - Lint: [PASS | FAIL | N/A]
  - Unit tests: [N passed, M failed, K skipped]
  - Integration tests: [N passed, M failed, K skipped | N/A]

Failure details (se houver):
  [output literal das falhas — copy/paste do stderr/stdout]

Verdict: [PASS | FAIL]
```

## Decisão pós-pipeline

Com base no Verdict:

- **PASS** → prossiga para análise semântica (carregue `flow-code-review`)
- **FAIL (build_failure)** → devolva ao orchestrator como `REJEITADA: build_failure` com o output literal
- **FAIL (test_failure)** → devolva como `REJEITADA: test_failure` com os testes que falharam e o motivo
- **FAIL (lint/format)** → devolva como `REJEITADA: build_failure` (agrupado) com a saída do linter

Use os labels exatos — o orchestrator usa esses tipos para roteamento.

## Comparação com o Verification Report do implementer

O implementer devolve um `Verification Report` via skill `flow-final-verify`. Você (reviewer) deve:

1. Rodar o pipeline de novo do zero — não confie no relatório dele
2. Comparar seu resultado com o que ele reportou
3. Se divergir (ex: ele reportou PASS mas você encontrou falhas), isso é um **problema crítico** — registre em `flow-quality-ledger` com categoria "Teste inadequado" ou "Lógica incorreta" e origem "Limitação do modelo"

## Tratamento de erros

- Se o comando de build/teste não estiver configurado no repositório, reporte como `REJEITADA: build_failure` com a descrição do que faltou
- Se um teste flaky quebrar a revisão e for conhecido como flaky (documentado em memory ou no ledger), rode 1 retry — se passar no retry, registre o flaky no `memory/[task]_task.md` mas NÃO rejeite
- Se o pipeline leva > 10 minutos, considere timeout — reporte a limitação e discuta com o caller em vez de deixar o ambiente travado

## Limites

- NÃO edite código para corrigir falhas — isso é responsabilidade do implementer na próxima iteração
- NÃO desabilite testes para fazer o pipeline passar
- NÃO pule etapas "para economizar tempo"
