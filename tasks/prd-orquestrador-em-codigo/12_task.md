---
status: completed
parallelizable: true
blocked_by: [2.0]
---

<task_context>
<domain>cli/installer</domain>
<type>implementation</type>
<scope>core_feature</scope>
<complexity>medium</complexity>
<dependencies>filesystem</dependencies>
<unblocks>"14.0"</unblocks>
</task_context>

# Tarefa 12.0: CLI — skills-installer + state-manager

## Relacionada as User Stories

- US: rodar `setup` e instalar tudo automaticamente
- US: usar skills de planejamento via agente preferido (suporte — entrega skills)

## Visao Geral

Implementar o instalador que copia as 19 skills `flow-*` empacotadas com o produto para
`<projeto>/.claude/skills/`, calculando hash sha256 normalizado de cada arquivo e
gravando o estado em `<projeto>/.claude/.looping-agent-state.json`. Suporta update via
overwrite com `.bak` (ADR-004). Inclui validacao de frontmatter contra schemas Zod.

## Requisitos

- Copia das 19 skills: arquivos lidos de `skills/<name>/SKILL.md` (e arquivos auxiliares
  da skill se houver)
- Hash sha256 calculado apos normalizacao (LF, trim trailing whitespace)
- Idempotencia: hash igual -> no-op; hash diferente -> backup `.bak` + overwrite
- **`.bak` nao rotaciona** — cada `update` sobrescreve o `.bak` anterior (decisao
  registrada na TechSpec "Questoes em Aberto"). Documentar em `docs/skills-customization.md`
  (task 17.0) que o usuario deve commitar customizacoes em git para preservar historico.
- Validacao de frontmatter via `@looping-agent/schemas` antes de instalar
- Estado persistido com versao instalada por skill

## Arquivos Envolvidos

- **Criar:**
  - `packages/cli/src/skills-installer.ts`
  - `packages/cli/src/state-manager.ts`
  - `packages/cli/src/skills-list.ts` (constante com os 19 nomes esperados)
  - `packages/cli/src/hash-utils.ts` (normalizacao + sha256)
  - `packages/cli/test/skills-installer.test.ts`
  - `packages/cli/test/state-manager.test.ts`
  - `packages/cli/test/hash-utils.test.ts`
  - `packages/cli/test/fixtures/skill-sample/SKILL.md`
- **Modificar:**
  - `packages/cli/package.json` (deps: `@looping-agent/schemas`)
- **Referencia:**
  - `tasks/prd-orquestrador-em-codigo/techspec.md` secao "Estado de instalacao"
  - `tasks/prd-orquestrador-em-codigo/adrs/adr-004.md`
  - `tasks/prd-orquestrador-em-codigo/prd.md` RF-01, RF-02
  - `skills/` (origem das 19 skills)
- **Skills para consultar durante implementacao:**
  - todas as 19 `flow-*` (apenas para confirmar nomes na lista canonica)

## Subtarefas

- [x] 12.1 Constante `EXPECTED_SKILLS: readonly string[]` com 19 nomes (PRD secao "Inventario empacotado")
- [x] 12.2 `hash-utils.ts`: `normalizeContent(s)` (LF, trim trailing) + `sha256(s): string`
- [x] 12.3 `state-manager.ts`: `readState(projectDir)` / `writeState(projectDir, state)` com Zod validate
- [x] 12.4 `skills-installer.ts`: `installAll({ sourceDir, projectDir, force })` retorna `InstallReport`
- [x] 12.5 Para cada skill: ler do source, validar frontmatter com `BaseSkillFrontmatter`/`PhaseSkillFrontmatter`, calcular hash, comparar com state, copiar/no-op/backup+copy
- [x] 12.6 `InstallReport { copied: string[]; unchanged: string[]; backedUp: string[]; failed: { skill, reason }[] }`
- [x] 12.7 Validar que TODAS as 19 skills estao presentes no source — abort se faltar
- [x] 12.8 Testes: install em diretorio vazio -> 19 copiadas
- [x] 12.9 Testes: re-install com mesmo hash -> todas `unchanged` (idempotencia RF-01)
- [x] 12.10 Testes: skill modificada localmente -> `.bak` criado e overwrite (ADR-004)
- [x] 12.11 Testes: skill com frontmatter invalido -> `failed` com motivo

## Sequenciamento

- Bloqueado por: 2.0
- Desbloqueia: 14.0
- Paralelizavel: Sim

## Rastreabilidade

- Esta tarefa cobre: RF-01 (idempotencia, copia), RF-02 (validacao de frontmatter), ADR-004
- Evidencia esperada: testes em FS temporario demonstram os 4 cenarios de install (vazio, idempotente, modificado, frontmatter invalido).

## Detalhes de Implementacao

**Estado de instalacao (TechSpec):**

```json
{
  "looping_agent_version": "1.0.0",
  "installed_at": "2026-04-26T13:00:00Z",
  "skills": {
    "flow-implementer": { "hash": "sha256:abc...", "installed_version": "1.0.0" }
  }
}
```

**Lista canonica das 19 skills (PRD secao "Inventario empacotado"):**

```typescript
export const EXPECTED_SKILLS = [
  "flow-vision-creator",
  "flow-domain-creator",
  "flow-prd-creator",
  "flow-contract-creator",
  "flow-techspec-creator",
  "flow-frontend-techspec-creator",
  "flow-task-creator",
  "flow-implementer",
  "flow-reviewer",
  "flow-finalizer",
  "flow-workflow-memory",
  "flow-workflow-memory-compaction",
  "flow-task-implementation",
  "flow-stack-selector",
  "flow-final-verify",
  "flow-quality-checks",
  "flow-code-review",
  "flow-quality-ledger",
  "flow-git-linear",
] as const;
```

**Normalizacao de hash (RF-01 idempotencia):**

```typescript
export function normalizeContent(content: string): string {
  return content
    .replace(/\r\n/g, "\n")        // CRLF -> LF
    .replace(/[ \t]+$/gm, "")      // trim trailing whitespace per line
    .replace(/\n+$/, "\n");        // single trailing newline
}
```

**Convencoes da stack:**

- Sem `any`
- Operacoes I/O via `fs/promises`
- Falhas individuais nao abortam install — sao agregadas em `failed[]`
- Path: usar `path.join` sempre

## Criterios de Sucesso (Verificaveis)

- [x] Testes passam: `npm test --workspace=@looping-agent/cli -- skills-installer state-manager hash-utils`
- [x] Cobertura >= 80%
- [x] Hash deterministico: mesmo conteudo (apos normalizacao) gera mesmo hash em LF e CRLF
- [x] `installAll` em diretorio vazio retorna `copied.length === 19, unchanged.length === 0`
- [x] `installAll` repetido retorna `unchanged.length === 19`
- [x] Skill com frontmatter invalido aparece em `failed[]` com motivo legivel
- [x] Build compila
