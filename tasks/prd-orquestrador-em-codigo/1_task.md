---
status: completed
parallelizable: false
blocked_by: []
---

<task_context>
<domain>infra/monorepo</domain>
<type>configuration</type>
<scope>configuration</scope>
<complexity>medium</complexity>
<dependencies>none</dependencies>
<unblocks>"2.0,3.0,4.0,5.0,6.0,7.0,8.0,9.0,10.0,11.0,12.0,13.0,14.0,15.0,16.0,17.0,18.0"</unblocks>
</task_context>

# Tarefa 1.0: Setup do monorepo TypeScript com workspaces e tooling base

## Relacionada as User Stories

- US: rodar `setup` e instalar tudo automaticamente (suporte — habilita o build do produto)

## Visao Geral

Criar a fundacao do monorepo TypeScript com 4 workspaces (`packages/schemas`,
`packages/mcp-server`, `packages/orchestrator`, `packages/cli`), TypeScript strict ESM
em ES2022, ESLint + typescript-eslint strict, Vitest configurado para coverage. Esta
task bloqueia todas as demais.

## Requisitos

- Node.js >= 20 declarado em `engines`
- ESM (`"type": "module"` em todos os packages)
- TypeScript strict, target ES2022, `verbatimModuleSyntax: true`
- ESLint sem `any` permitido
- Vitest com `--coverage` no CI
- Monorepo: npm workspaces (recomendado — alinha com 1.0 ja concluido)

## Arquivos Envolvidos

- **Criar:**
  - `package.json` (raiz, com `workspaces`, scripts `build`, `test`, `lint`, `typecheck`)
  - `tsconfig.base.json`
  - `.eslintrc.cjs`
  - `.eslintignore`
  - `vitest.config.ts` (raiz, com config compartilhada)
  - `.gitignore`
  - `.npmrc` (se necessario para workspace settings)
  - `packages/schemas/package.json` (placeholder com nome `@looping-agent/schemas`)
  - `packages/schemas/tsconfig.json` (extends base)
  - `packages/mcp-server/package.json` (placeholder)
  - `packages/mcp-server/tsconfig.json`
  - `packages/orchestrator/package.json` (placeholder)
  - `packages/orchestrator/tsconfig.json`
  - `packages/cli/package.json` (placeholder, declara `bin: { "looping-agent": "./dist/index.js" }`)
  - `packages/cli/tsconfig.json`
- **Modificar:** —
- **Referencia:**
  - `tasks/prd-orquestrador-em-codigo/techspec.md` (secao "Conformidade com Skills" + "Inventario de Artefatos")
  - `tasks/prd-orquestrador-em-codigo/adrs/adr-001.md` (stack TS+Node+npm)
- **Skills para consultar durante implementacao:**
  - (sem skill `node-*`/`typescript-*`) — convencoes vem da TechSpec secao "Conformidade com Skills"

## Subtarefas

- [x] 1.1 Criar `package.json` raiz com workspaces e scripts agregados
- [x] 1.2 Criar `tsconfig.base.json` com strict, ESM, target ES2022
- [x] 1.3 Configurar ESLint + typescript-eslint strict (sem `any`)
- [x] 1.4 Configurar Vitest base + coverage
- [x] 1.5 Criar 4 packages com `package.json` + `tsconfig.json` extending base
- [x] 1.6 `.gitignore` cobre `node_modules`, `dist`, `*.bak`, `*.tsbuildinfo`, `coverage`
- [x] 1.7 Smoke test: `npm install && npm run typecheck && npm run lint` passa em workspace vazio

## Sequenciamento

- Bloqueado por: Nenhum
- Desbloqueia: 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 16.0, 17.0, 18.0
- Paralelizavel: Nao

## Rastreabilidade

- Esta tarefa cobre: fundacao tecnica para todo o produto (sem RF direto, mas habilita 100% dos RFs)
- Evidencia esperada: `npm install` instala dependencias dos 4 workspaces; `npm run typecheck` e `npm run lint` passam sem erro em arvore vazia.

## Detalhes de Implementacao

**Estrutura de diretorios alvo:**

```
looping-agent/
├── package.json              # workspaces, scripts agregados
├── tsconfig.base.json
├── .eslintrc.cjs
├── .gitignore
├── vitest.config.ts
├── packages/
│   ├── schemas/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   ├── mcp-server/
│   ├── orchestrator/
│   └── cli/
└── skills/                   # ja existe — nao mexer
```

**`tsconfig.base.json` (chave):**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true
  }
}
```

**`package.json` raiz (chave):**

```json
{
  "private": true,
  "workspaces": ["packages/*"],
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc -b --noEmit",
    "lint": "eslint packages",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage"
  }
}
```

**Convencoes da stack (das skills consultadas):**

- TypeScript strict — sem `any` (regra ESLint)
- ESM em todos os packages (`"type": "module"`)
- Naming: camelCase para variaveis/funcoes, PascalCase para tipos/classes, kebab-case para arquivos
- Vitest como test runner (TechSpec secao "Abordagem de Testes")

## Criterios de Sucesso (Verificaveis)

- [x] `npm install` na raiz instala dependencias dos 4 workspaces sem erro
- [x] `npm run typecheck` retorna 0 erros (mesmo sem codigo nos packages)
- [x] `npm run lint` passa
- [x] `npm run test` executa Vitest e nao falha (0 testes ainda OK)
- [x] `node --version` reportado pela CI usa >= 20 (usar `engines.node` declarado)
- [x] Diretorios `packages/{schemas,mcp-server,orchestrator,cli}` existem com `package.json` valido (`npm pkg get name --workspace=<each>`)
