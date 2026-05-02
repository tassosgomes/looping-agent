---
status: completed
parallelizable: true
blocked_by: [15.0]
---

<task_context>
<domain>infra/ci</domain>
<type>configuration</type>
<scope>configuration</scope>
<complexity>low</complexity>
<dependencies>none</dependencies>
<unblocks>"18.0"</unblocks>
</task_context>

# Tarefa 16.0: CI workflow + script de release npm

## Relacionada as User Stories

- (suporte ao produto — gate de qualidade)

## Visao Geral

Configurar o workflow de CI no GitHub Actions que executa build + lint + typecheck +
test em cada PR, e um script de release manual que faz bump de versao, build e `npm
publish`. ADR-001 fixa npm como canal de distribuicao.

## Requisitos

- CI roda em Node 20 LTS (TechSpec ADR-001)
- CI valida 4 packages do monorepo
- Cobertura reportada (sem gate obrigatorio inicial — apenas visivel)
- Release script faz: bump (`npm version`), build, publish (`npm publish --access public`)
- Release nao executa em CI automaticamente (manual trigger)

## Arquivos Envolvidos

- **Criar:**
  - `.github/workflows/ci.yml`
  - `scripts/release.mjs`
  - `.npmignore` (excluir tests, fixtures, src nao compilado)
- **Modificar:**
  - `package.json` raiz (script `release` apontando para `scripts/release.mjs`)
- **Referencia:**
  - `tasks/prd-orquestrador-em-codigo/techspec.md` secao "Pontos de Integracao" (npm registry)
  - `tasks/prd-orquestrador-em-codigo/adrs/adr-001.md`
- **Skills para consultar durante implementacao:** —

## Subtarefas

- [x] 16.1 `.github/workflows/ci.yml`: matrix Node 20 + ubuntu, steps `npm ci`, `npm run typecheck`, `npm run lint`, `npm run test:coverage`
- [x] 16.2 Cache de `node_modules` via actions/setup-node
- [x] 16.3 Upload de coverage como artifact
- [x] 16.4 `scripts/release.mjs`: parse de arg `<patch|minor|major>`, executa `npm version`, `npm run build`, `npm publish` em cada package publicavel
- [x] 16.5 Apenas `@looping-agent/cli` e publicado publicamente; demais (`schemas`, `mcp-server`, `orchestrator`) podem ser internos (decisao da implementacao — sugerido publicar todos para facilitar inspect)
- [x] 16.6 `.npmignore` exclui `test/`, `**/*.test.ts`, `coverage/`, `*.tsbuildinfo`
- [x] 16.7 Validar localmente que `npm pack` em cada package gera tarball razoavel

## Sequenciamento

- Bloqueado por: 15.0 (precisa do build verde para o CI ter o que validar)
- Desbloqueia: 18.0
- Paralelizavel: Sim (paralelo a 17.0)

## Rastreabilidade

- (Nao cobre RF diretamente — habilita gate de qualidade do produto)
- Evidencia esperada: PR aberto na branch dispara CI e passa em todos os jobs.

## Detalhes de Implementacao

**`.github/workflows/ci.yml` (esqueleto):**

```yaml
name: CI
on: [push, pull_request]
jobs:
  build-test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [20]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run test:coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/
```

**Convencoes da stack:**

- Sem `any` em scripts TS de release
- Nao publicar com `--no-git-checks`
- Sempre validar `npm whoami` antes de publish

## Criterios de Sucesso (Verificaveis)

- [ ] CI workflow valido (`actionlint .github/workflows/ci.yml`)
- [ ] Push em branch dispara workflow (validar no GitHub apos primeiro merge)
- [x] `npm pack --workspace=@looping-agent/cli` gera tarball que **inclui** `dist/` e **exclui** `test/`, `src/**/*.test.ts`
- [x] `node scripts/release.mjs patch --dry-run` (modo dry-run obrigatorio para o teste) imprime os passos sem publicar
