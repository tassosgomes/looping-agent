# Task 12 Memory

## Snapshot do Objetivo
Implementar no pacote `@looping-agent/cli` o instalador das 19 skills `flow-*`, com hash normalizado, estado persistido em `.claude/.looping-agent-state.json` e backup `.bak` em updates.

## Decisões Importantes
- O hash de idempotencia e calculado a partir do `SKILL.md` normalizado de cada skill, enquanto a copia do payload preserva tambem arquivos auxiliares dentro do diretorio da skill.
- A validacao de frontmatter usa `BaseSkillFrontmatter` para skills nao-fase e `PhaseSkillFrontmatter` para `flow-implementer`, `flow-reviewer` e `flow-finalizer`.
- A deteccao de customizacao local compara o hash do `SKILL.md` instalado com o hash da origem; se divergir, cria `.bak` e sobrescreve o diretorio da skill.

## Learnings
- As skills empacotadas misturam arrays YAML inline e multi-linha no frontmatter; o parser do instalador precisa aceitar ambos os formatos.
- O workspace atual nao esta inicializado como repositorio Git, entao o grounding da task nao conseguiu usar `git status` ou `git log`.

## Arquivos / Superfícies
- `packages/cli/package.json`
- `packages/cli/src/hash-utils.ts`
- `packages/cli/src/index.ts`
- `packages/cli/src/skills-installer.ts`
- `packages/cli/src/skills-list.ts`
- `packages/cli/src/state-manager.ts`
- `packages/cli/test/hash-utils.test.ts`
- `packages/cli/test/skills-installer.test.ts`
- `packages/cli/test/state-manager.test.ts`
- `tasks/prd-orquestrador-em-codigo/12_task.md`

## Erros / Correções
- A primeira validacao falhou porque skills de fase tem campos extras (`loads_skills`, `completion_tool`) invalidos no schema base; corrigido separando a validacao por `pipeline_stage`.
- O build falhou com `noUncheckedIndexedAccess` no parser de frontmatter; corrigido com estreitamento explicito de grupos de regex e linhas lidas do array.
- O build tambem falhou ao incluir `test/**/*.ts` em um pacote com `rootDir: src`; corrigido voltando o `tsconfig.json` do pacote para incluir apenas `src/**/*.ts`.

## Ready for Next Run
- Validacoes executadas: `npm test --workspace=@looping-agent/cli -- skills-installer state-manager hash-utils`, `npm run build --workspace=@looping-agent/cli`, `npm exec --workspace=@looping-agent/cli -- vitest run --coverage --passWithNoTests skills-installer state-manager hash-utils`.