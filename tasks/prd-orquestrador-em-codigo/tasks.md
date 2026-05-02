# Resumo de Tarefas de Implementacao — Looping Agent (SDD Instalavel)

## Visao Geral

Implementacao do Looping Agent: produto CLI distribuido como pacote npm global
(`@looping-agent/cli`) escrito em TypeScript sobre Node.js >= 20. Empacota 19 skills
`flow-*` e um orquestrador deterministico que coordena o loop Implementer -> Reviewer ->
Finalizer sobre ACP (Agent Client Protocol) + servidor MCP local com tools `report_*`.

Stack: monorepo TypeScript com 4 packages (`@looping-agent/schemas`,
`@looping-agent/mcp-server`, `@looping-agent/orchestrator`, `@looping-agent/cli`).
Distribuicao via npm. Testes com Vitest. Lint com ESLint + typescript-eslint strict.

## Skills de Stack Consultadas

| Skill | Caminho | Influencia |
|-------|---------|------------|
| `flow-implementer` | `skills/flow-implementer/SKILL.md` | Contrato da fase Implementer + completion_tool=`report_implementer_result` |
| `flow-reviewer` | `skills/flow-reviewer/SKILL.md` | Contrato da fase Reviewer + completion_tool=`report_review_result` |
| `flow-finalizer` | `skills/flow-finalizer/SKILL.md` | Contrato da fase Finalizer + completion_tool=`report_finalizer_result` |
| `flow-workflow-memory` | `skills/flow-workflow-memory/SKILL.md` | Estrutura `MEMORY.md` + `memory/[N]_task.md` que o orquestrador instancia |
| `flow-quality-ledger` | `skills/flow-quality-ledger/SKILL.md` | Formato do ledger consumido pelo TelemetryWriter |
| `flow-task-creator` | `skills/flow-task-creator/SKILL.md` | Formato de `tasks.md` parseado pelo `tasks-reader.ts` |
| (sem skills `node-*`/`typescript-*` no catalogo) | — | Convencoes vem da TechSpec secao "Conformidade com Skills" |

## Fases de Implementacao

### Fase 1 — Fundacao (Tasks 1.0–2.0)

Setup do monorepo TypeScript e schemas Zod compartilhados. Bloqueia tudo o que vem depois
porque define os contratos consumidos por todos os packages.

### Fase 2 — Building Blocks (Tasks 3.0–9.0)

Componentes isolados que podem ser desenvolvidos em paralelo apos a Fase 1: MCP server,
ACP client, parser de tasks, memory manager, retry policy, telemetry writer, prompts.

### Fase 3 — Orquestracao (Tasks 10.0–11.0)

Montagem da maquina de estado: PhaseRunner integra ACP+MCP+RetryPolicy; Loop sequencia
Implementer -> Reviewer -> Finalizer sobre tasks pendentes.

### Fase 4 — CLI (Tasks 12.0–15.0)

Skills installer, state manager, terminal renderer e os 4 comandos publicos
(`setup`, `update`, `doctor`, `run`).

### Fase 5 — Qualidade, Docs e Smoke (Tasks 16.0–18.0)

CI workflow, release script, documentacao e validacao end-to-end manual com runtimes ACP
reais (criterio de reprodutibilidade do RF-03).

## Tarefas

- [x] 1.0 Setup do monorepo TypeScript com workspaces e tooling base
- [ ] 2.0 Package `@looping-agent/schemas` com Zod schemas compartilhados
- [ ] 3.0 Package `@looping-agent/mcp-server` (servidor MCP local com 3 tools `report_*`)
- [ ] 4.0 Orchestrator: ACP client + runtime detector
- [x] 5.0 Orchestrator: TasksReader (parser de `tasks.md`)
- [x] 6.0 Orchestrator: MemoryManager (instancia `flow-workflow-memory`)
- [x] 7.0 Orchestrator: RetryPolicy (decisao retry/advance/halt)
- [x] 8.0 Orchestrator: TelemetryWriter (JSON por task + JSONL auxiliar)
- [ ] 9.0 Orchestrator: prompts templates (phase, retry-contract, retry-rework)
- [ ] 10.0 Orchestrator: PhaseRunner (sessao ACP + captura de tool_call)
- [x] 11.0 Orchestrator: Loop principal (sequencia tasks pendentes)
- [ ] 12.0 CLI: skills-installer + state-manager
- [ ] 13.0 CLI: terminal renderer (cores, spinner, streaming de notificacoes ACP)
- [ ] 14.0 CLI: comandos `setup`, `update`, `doctor`
- [ ] 15.0 CLI: comando `run` + entrypoint + parse de args
- [ ] 16.0 CI workflow + script de release npm
- [x] 17.0 Documentacao (README, cli-usage, skills-customization, architecture, troubleshooting)
- [ ] 18.0 Smoke tests end-to-end + validacao de reprodutibilidade

## Rastreabilidade US -> Tasks

| User Story | Tasks Relacionadas | Tipo de Cobertura |
|------------|--------------------|-------------------|
| US: rodar `setup` e instalar tudo automaticamente | 12.0, 14.0 | Direta |
| US: detectar agentes presentes (Claude/Codex) | 4.0, 14.0 | Direta |
| US: usar skills de planejamento via agente preferido | 12.0, 17.0 | Suporte (entrega skills + docs) |
| US: invocar orquestrador via CLI sobre PRD | 11.0, 15.0 | Direta |
| US: ver status de cada task em tempo real | 13.0, 15.0 | Direta |
| US: pipeline pausa imediatamente quando esgotar retries | 7.0, 10.0, 11.0 | Direta |
| US: abrir telemetria por execucao | 8.0, 10.0, 17.0 | Direta |
| US: task N+1 herda decisoes da task N | 6.0 | Direta (Phase 2 RF-07) |
| US: comparar custo de tokens antes/depois | 8.0, 11.0 | Direta (run-summary) |

## Validacao de Cobertura

### Requisitos Funcionais

| Requisito | Task(s) | Status |
|-----------|---------|--------|
| RF-01 Setup/Instalacao | 12.0, 14.0 | ✅ Coberto |
| RF-02 Empacotamento 19 skills | 12.0, 2.0 (validacao frontmatter) | ✅ Coberto |
| RF-03 Loop deterministico via ACP | 4.0, 10.0, 11.0, 18.0 (reprodutibilidade) | ✅ Coberto |
| RF-04 Retry com halt-on-failure | 7.0, 10.0, 11.0 | ✅ Coberto |
| RF-05 Contrato ACP com tool_call | 2.0, 3.0, 10.0 | ✅ Coberto |
| RF-06 Telemetria persistida | 8.0, 10.0, 11.0 | ✅ Coberto |
| RF-07 Memoria cross-task (Should Have / Phase 2) | 6.0, 11.0 | ✅ Coberto no MVP estrutural |
| RF-08 Codebase-aware enrichment (Could Have / Phase 3) | — | ❌ Fora de escopo do MVP (Phase 3) |
| RF-09 Metricas agregadas (Could Have / Phase 3) | 11.0 (run-summary base) | ⚠️ Parcial — formato definido na TechSpec; comparativo manual fica para Phase 3 |

### Artefatos da TechSpec

Mapeamento da secao "Inventario de Artefatos" da TechSpec:

| Artefato | Task | Status |
|----------|------|--------|
| `package.json` (raiz) + workspaces | 1.0 | ✅ |
| `tsconfig.base.json`, `.eslintrc.cjs`, `vitest.config.ts`, `.gitignore` | 1.0 | ✅ |
| `packages/schemas/src/report-tools.ts` | 2.0 | ✅ |
| `packages/schemas/src/telemetry.ts` | 2.0 | ✅ |
| `packages/schemas/src/skill-frontmatter.ts` | 2.0 | ✅ |
| `packages/schemas/src/install-state.ts` | 2.0 | ✅ |
| `packages/schemas/test/*.test.ts` | 2.0 | ✅ |
| `packages/mcp-server/src/server.ts`, `tool-handlers.ts`, `index.ts` | 3.0 | ✅ |
| `packages/mcp-server/test/server.test.ts` | 3.0 | ✅ |
| `packages/orchestrator/src/acp-client.ts` | 4.0 | ✅ |
| `packages/orchestrator/src/runtime-detector.ts` | 4.0 | ✅ |
| `packages/orchestrator/src/tasks-reader.ts` | 5.0 | ✅ |
| `packages/orchestrator/src/memory-manager.ts` | 6.0 | ✅ |
| `packages/orchestrator/src/retry-policy.ts` | 7.0 | ✅ |
| `packages/orchestrator/src/telemetry-writer.ts` | 8.0 | ✅ |
| `packages/orchestrator/src/prompts/phase-prompt.ts`, `retry-contract.ts`, `retry-rework.ts` | 9.0 | ✅ |
| `packages/orchestrator/src/phase-runner.ts` | 10.0 | ✅ |
| `packages/orchestrator/src/loop.ts` + `index.ts` | 11.0 | ✅ |
| `packages/orchestrator/test/*.test.ts` (incluindo integration) | 7.0, 8.0, 10.0, 11.0 | ✅ |
| `packages/cli/src/skills-installer.ts`, `state-manager.ts` | 12.0 | ✅ |
| `packages/cli/src/renderer/terminal-ui.ts`, `notification-formatter.ts` | 13.0 | ✅ |
| `packages/cli/src/commands/setup.ts`, `update.ts`, `doctor.ts` | 14.0 | ✅ |
| `packages/cli/src/commands/run.ts` + `index.ts` | 15.0 | ✅ |
| `packages/cli/test/*.test.ts` | 12.0, 14.0 | ✅ |
| `.github/workflows/ci.yml`, `scripts/release.ts` | 16.0 | ✅ |
| `docs/cli-usage.md`, `skills-customization.md`, `architecture.md`, `troubleshooting.md`, `README.md` | 17.0 | ✅ |
| 19 skills `flow-*` em `skills/` | (ja existem — copiadas pelo task 12.0) | ✅ |

### Categorias Obrigatorias

| # | Categoria | Task(s) / N/A | Skill Relacionada | Status |
|---|-----------|---------------|-------------------|--------|
| 1 | Setup / Configuracao | 1.0 | (sem skill node — TechSpec define) | ✅ |
| 2 | Modelos de Dados | 2.0 | (sem skill — Zod via TechSpec) | ✅ |
| 3 | Logica de Negocio | 5.0, 6.0, 7.0, 10.0, 11.0 | (sem skill — TechSpec define) | ✅ |
| 4 | Endpoints / Interfaces | 14.0, 15.0 (CLI commands sao a interface publica) | — | ✅ |
| 5 | Integracoes Externas | 3.0 (MCP), 4.0 (ACP runtimes) | — | ✅ |
| 6 | Validacoes e Erros | 2.0 (Zod), 3.0 (validacao input), 7.0 (politicas), 15.0 (exit codes) | — | ✅ |
| 7 | Testes | subtarefas em 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 10.0, 11.0, 12.0, 14.0; e2e em 18.0 | (Vitest via TechSpec) | ✅ |
| 8 | Observabilidade | 8.0 (telemetria), 13.0 (UI streaming), 14.0 (`doctor`) | `flow-quality-ledger` | ✅ |
| 9 | Documentacao | 17.0 | — | ✅ |
| 10 | Seguranca | N/A — single-user local; MCP server stdio-only (no TCP), Zod valida toda entrada externa (cobertura em 2.0/3.0) | — | ✅ |

## Analise de Paralelizacao

### Lanes de Execucao Paralela

| Lane | Tarefas | Descricao |
|------|---------|-----------|
| Setup | 1.0 | Bloqueia tudo |
| Schemas | 2.0 | Bloqueia 3.0+, mas pode comecar logo apos 1.0 |
| Lane A — MCP | 3.0 | Apos 2.0 |
| Lane B — ACP | 4.0 | Apos 2.0 |
| Lane C — Parsers/State | 5.0, 6.0, 8.0, 9.0 | Apos 2.0 (sem dependencia entre si) |
| Lane D — Logica pura | 7.0 | Apos 2.0 |
| Lane E — CLI base | 12.0, 13.0 | Apos 2.0 (12.0 nao depende do orchestrator) |
| Convergencia 1 | 10.0 | Apos 2.0, 3.0, 4.0, 7.0, 8.0, 9.0 |
| Convergencia 2 | 11.0 | Apos 5.0, 6.0, 10.0 |
| Convergencia CLI | 14.0 | Apos 12.0 |
| Convergencia final | 15.0 | Apos 11.0, 13.0, 14.0 |
| Pos-codigo | 16.0, 17.0 | Apos 15.0 (16.0 e 17.0 paralelizaveis entre si) |
| Validacao final | 18.0 | Apos 15.0 |

### Caminho Critico

`1.0 -> 2.0 -> 4.0 -> 10.0 -> 11.0 -> 15.0 -> 18.0`

(7 tarefas no caminho critico; outras tarefas correm em paralelo as Lanes B/C/D/E.)

### Diagrama de Dependencias

```
                       1.0 (setup monorepo)
                            |
                       2.0 (schemas Zod)
        ________________|_______________________________
       /        |        |        |        |        |
     3.0      4.0      5.0      6.0      7.0      8.0     9.0    12.0  13.0
     MCP    ACP+det.  Parser   Memory   Retry    Telem.  Prompts Skills UI
       \      |       |          |       |        |       /
        \_____|_______|__________|_______|________|______/
              |            (3.0,4.0,7.0,8.0,9.0)
              v
            10.0 PhaseRunner
              |
              v       (5.0,6.0,10.0)
            11.0 Loop principal
              |                              12.0 -> 14.0 (setup/update/doctor)
              v                                       |
              +---------------------------------------+
                                |
                                v
                              15.0 (run + entrypoint)
                                |
                ________________|_______________
               /                |               \
            16.0 CI         17.0 Docs        18.0 Smoke E2E
```

## Notas

- **Paralelismo possivel:** Tasks 5.0, 6.0, 8.0, 9.0, 12.0, 13.0 sao independentes
  apos 2.0 — distribuir entre dev humano + agentes em loop e licito.
- **Tarefas com testes integrados:** todas as tasks de codigo incluem subtarefa de
  teste; nao ha task "Tests" separada para nao quebrar o principio de atomicidade.
- **RF-08 e RF-09 (Phase 3):** fora do escopo de implementacao do MVP. RF-09 tem
  formato `run-summary` ja definido e implementado em 11.0 como subtarefa para nao
  exigir refatoracao quando Phase 3 chegar.
- **ADRs influencia direta:**
  - ADR-001 (TS+Node+npm) -> 1.0, 16.0
  - ADR-002 (MCP local) -> 3.0, 14.0 (smoke test)
  - ADR-003 (telemetria JSON) -> 8.0
  - ADR-004 (`.bak` em update) -> 12.0, 14.0
  - ADR-005 (retry para completion_tool ausente) -> 7.0, 9.0, 10.0
