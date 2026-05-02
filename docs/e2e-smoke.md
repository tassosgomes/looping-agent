# E2E Smoke

Os smoke tests end-to-end desta pasta existem para validar o MVP com runtimes
ACP reais. Eles nao entram no CI porque dependem de binaries instalados na
maquina local.

## O que os scripts fazem

Cada execucao cria um workspace temporario versionado em
`tests/e2e/results/<run-id>/workspace`, copia o repo para esse diretorio,
reaproveita `node_modules` via symlink, inicializa um repositorio git sintetico
com `origin` local, executa `looping-agent setup`, roda `looping-agent run` e
salva logs, manifest e telemetria para auditoria.

Isso permite validar Reviewer e Finalizer sem tocar no checkout real do
desenvolvedor.

## Pre-requisitos

- Node.js >= 20.
- `npm install` concluido no repo fonte.
- `npm run build` funcional.
- Um runtime ACP disponivel no `PATH`:
  - `claude-agent-acp`
  - `codex-acp`
  - `copilot --acp` (suportado pelo produto, mas fora do smoke minimo desta
    task)
- `git` disponivel no `PATH`.

## Comandos principais

Smoke positivo com Claude Code ACP:

```bash
bash tests/e2e/run-smoke-claude.sh
```

Smoke positivo com Codex ACP:

```bash
bash tests/e2e/run-smoke-codex.sh
```

Reprodutibilidade em 3 execucoes do fixture positivo:

```bash
npm run build
node tests/e2e/dist/check-reproducibility.js --runtime claude-agent-acp
```

Validacao sintetica de halt apos retries:

```bash
bash tests/e2e/run-smoke-claude.sh --fixture prd-halt
```

Os wrappers aceitam os mesmos argumentos do runner TypeScript, por exemplo:

```bash
bash tests/e2e/run-smoke-codex.sh --fixture prd-halt --debug
```

## Fixtures disponiveis

- `tests/e2e/fixtures/prd-smoke`: cenario positivo com uma task trivial que cria
  `hello.txt` dentro do proprio fixture e passa pelas tres fases.
- `tests/e2e/fixtures/prd-halt`: cenario negativo para validar
  `retries_exhausted` quando o Implementer recebe uma task impossivel.

## Evidencias geradas

Cada run escreve:

- `tests/e2e/results/<run-id>/smoke-manifest.json`
- `tests/e2e/results/<run-id>/setup.stdout.log`
- `tests/e2e/results/<run-id>/setup.stderr.log`
- `tests/e2e/results/<run-id>/run.stdout.log`
- `tests/e2e/results/<run-id>/run.stderr.log`
- `tests/e2e/results/<run-id>/workspace/tests/e2e/fixtures/<fixture>/telemetry/`

O manifest inclui:

- runtime usado e versao detectada
- comandos executados e logs correspondentes
- path do workspace sintetico
- path da telemetria e sequencia de fases observada

## Criterios de sucesso esperados

No fixture positivo:

- `run` sai com codigo `0`
- `1_telemetry.json` existe
- `status` da task fica `completed`
- a sequencia de fases esperada e `implementer#1`, `reviewer#1`, `finalizer#1`

No fixture de halt:

- `run` sai com codigo `10`
- `1_telemetry.json` existe
- `halt_reason` indica `retries_exhausted`
- nao ha tentativas de Reviewer ou Finalizer

Na reproducibilidade:

- o script calcula `pairwiseEqualityRate` entre todas as telemetrias coletadas
- o objetivo de longo prazo do RF-03 continua sendo `>= 0.95`
- para a amostra manual de 3 execucoes desta task, o harness tambem reporta
  `modalSequenceRate`, e a aceitacao minima manual e `>= 2/3`

## Versoes testadas e baseline ACP

O repo nao fixa em codigo uma versao minima unica para os binaries de runtime.
O baseline operacional desta task e:

- manter o SDK MCP/ACP do produto em `@modelcontextprotocol/sdk` `^1.29.0`
- capturar a versao exata do runtime real no `smoke-manifest.json` via
  `--version`
- tratar o ultimo manifest verde como fonte de verdade para a versao
  "known-good" de cada runtime

Matriz documentada para o smoke manual desta task:

| Runtime | Binario invocado | Fonte da versao validada |
| --- | --- | --- |
| Claude Code ACP | `claude-agent-acp` | `tests/e2e/results/<run-id>/smoke-manifest.json` |
| Codex ACP | `codex-acp` | `tests/e2e/results/<run-id>/smoke-manifest.json` |

Se a equipe decidir formalizar um piso semver por release, atualize esta tabela
com o primeiro manifest verde da release correspondente.

## Observacoes operacionais

- Os smoke tests copiam o repo para um workspace sintetico; eles nao reutilizam o
  checkout real do desenvolvedor.
- O diretorio `tests/e2e/results/` fica ignorado em git para permitir guardar
  logs grandes e workspaces temporarios sem poluir o repositorio.
- Se um runtime ACP nao estiver instalado, o runner falha cedo e preserva os logs
  da tentativa.