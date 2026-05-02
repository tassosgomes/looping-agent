# TechSpec — Looping Agent: SDD Instalável com Orquestrador em Código

> **Modo de operação:** Standalone (sem `vision.md` ou `domain.md`)
> **PRD de origem:** `tasks/prd-orquestrador-em-codigo/prd.md`
> **Data:** 2026-04-26
> **Status:** Aprovado

---

## Resumo Executivo

O Looping Agent é um produto CLI distribuído como pacote npm global (`@looping-agent/cli`)
escrito em **TypeScript** sobre **Node.js ≥ 20**. Ele empacota 19 skills `flow-*` (Markdown
com frontmatter canônico) e um orquestrador determinístico em código que coordena o loop
**Implementer → Reviewer → Finalizer** sobre o **Agent Client Protocol (ACP)**, comunicando
com runtimes ACP-capable (Claude Code, Codex/Copilot CLI no MVP) via JSON-RPC sobre stdio.

A inteligência do loop vive integralmente nas 19 skills — o orquestrador é uma máquina de
estado magra que:

1. Lê `tasks.md` e identifica a próxima task pendente.
2. Para cada task, abre 3 sessões ACP em sequência (Implementer → Reviewer → Finalizer),
   instruindo cada uma a aplicar a skill de fase correspondente
   (`flow-implementer`/`flow-reviewer`/`flow-finalizer`).
3. Hospeda um servidor MCP local (mesmo processo) que expõe os 3 tools de conclusão
   (`report_implementer_result`, `report_review_result`, `report_finalizer_result`) com
   schemas validados via Zod.
4. Captura notificações `session/update` em tempo real, valida o `tool_call` de conclusão
   contra schema, e decide retry/avanço/halt determinísticamente.
5. Persiste telemetria como JSON por task em `tasks/prd-[slug]/telemetry/` e renderiza
   progresso no terminal com cores e spinners.

**Trade-off primário:** opta-se por **simplicidade operacional** (single-runtime CLI, npm,
arquivo JSON, escopo do projeto) em detrimento de **agregação cross-PRD** (sem SQLite
global, sem daemon, sem dashboards). O design assume um dev local rodando uma execução
por vez; análise agregada vira ferramenta auxiliar futura.

---

## Skills de Referência

> Phase 0 bootstrap: skills consultadas para informar decisões.

| Skill | Caminho | Decisões Influenciadas |
|-------|---------|------------------------|
| `flow-implementer` | `skills/flow-implementer/SKILL.md` | Contrato da fase de implementação, `completion_tool: report_implementer_result`, `loads_skills` |
| `flow-reviewer` | `skills/flow-reviewer/SKILL.md` | Contrato da fase de revisão, `completion_tool: report_review_result` |
| `flow-finalizer` | `skills/flow-finalizer/SKILL.md` | Contrato da fase de finalização, `completion_tool: report_finalizer_result` |
| `flow-workflow-memory` | `skills/flow-workflow-memory/SKILL.md` | Estrutura `MEMORY.md` + `memory/[N]_task.md`; orquestrador cria a árvore na inicialização |
| `flow-quality-ledger` | `skills/flow-quality-ledger/SKILL.md` | Contrato de telemetria do reviewer; alimenta `docs/ai-dev/quality-ledger.md` |
| `flow-task-creator` | `skills/flow-task-creator/SKILL.md` | Formato de `tasks.md` consumível pelo orquestrador |
| (sem skill de stack TS no catálogo) | — | Decisões de arquitetura TS/Node são desta TechSpec; sinalizado como gap a preencher futuramente |

> Não há skills `*-architecture` / `*-testing` / `*-code-quality` para Node/TypeScript no
> catálogo do projeto. Essa lacuna é registrada em "Riscos Conhecidos".

---

## Arquitetura do Sistema

### Visão Geral dos Componentes

O produto é um monorepo TypeScript com 4 packages:

- **`@looping-agent/cli`** — CLI (entrypoint). Comandos `setup`, `update`, `run`, `doctor`,
  `--help`. Renderiza UI rica no terminal (cores, spinners, streaming).
- **`@looping-agent/orchestrator`** — máquina de estado do loop. Lê `tasks.md`, gerencia
  sessões ACP por fase, aplica política de retry, persiste telemetria, gerencia memória.
- **`@looping-agent/mcp-server`** — servidor MCP local que expõe os 3 tools `report_*`
  para os agents ACP durante a Fase B.
- **`@looping-agent/schemas`** — schemas Zod compartilhados: tools de conclusão,
  telemetria, frontmatter das skills, estado de instalação. Tipos exportados para
  consumo dos demais packages.

Recursos versionados como dados (não código):

- **`skills/`** — as 19 skills `flow-*` empacotadas. Copiadas pelo `setup` para
  `<projeto>/.claude/skills/`.

### Diagrama de Componentes

```
┌─────────────────── @looping-agent/cli ──────────────────┐
│  comandos: setup | update | run | doctor                 │
│  renderer: cores + spinner + streaming de notificações   │
└───────────────────────┬──────────────────────────────────┘
                        │
                        ▼
┌─────────────── @looping-agent/orchestrator ─────────────┐
│  ┌─ TasksReader ────────┐  ┌─ MemoryManager ─────────┐   │
│  │ parseia tasks.md     │  │ cria MEMORY.md +        │   │
│  │ emite next-pending   │  │ memory/[N]_task.md      │   │
│  └──────────────────────┘  └─────────────────────────┘   │
│  ┌─ PhaseRunner ────────┐  ┌─ TelemetryWriter ───────┐   │
│  │ abre ACP session     │  │ JSON por task em        │   │
│  │ aplica skill de fase │  │ tasks/prd-X/telemetry/  │   │
│  │ captura tool_calls   │  └─────────────────────────┘   │
│  └──────┬───────────────┘  ┌─ RetryPolicy ───────────┐   │
│         │                  │ stopReason +            │   │
│         │                  │ completion_tool_seen    │   │
│         │                  └─────────────────────────┘   │
└─────────┼────────────────────────────────────────────────┘
          │                              ▲
          │ session/prompt               │ session/update.tool_call
          │ (skill name + task content)  │ (report_*_result)
          ▼                              │
┌─────── ACP runtime (Claude/Codex/Copilot) ─────────────┐
│  agent ACP carrega flow-implementer/-reviewer/-finalizer │
│  carrega skills de disciplina via loads_skills           │
│  invoca tools report_* no MCP server local               │
└──────────────────────────┬───────────────────────────────┘
                           │ MCP stdio
                           ▼
┌────────────── @looping-agent/mcp-server ────────────────┐
│  expõe 3 tools com schemas Zod:                          │
│  - report_implementer_result                             │
│  - report_review_result                                  │
│  - report_finalizer_result                               │
│  valida input e encaminha ao orchestrator                │
└──────────────────────────────────────────────────────────┘
```

### Fluxo de uma task (Fase B)

```
1. orchestrator lê tasks.md → encontra task N pendente
2. cria/atualiza MEMORY.md + memory/[N]_task.md (lazy)
3. spawn MCP server local (uma vez por execução do CLI)
4. PhaseRunner.run({ phase: "implementer", task: N }):
   a. abre ACP session via runtime configurado
   b. envia session/prompt: "Aplique flow-implementer ao [N]_task.md..."
   c. escuta session/update: renderiza no terminal + acumula telemetria
   d. captura session/update.tool_call name=report_implementer_result
   e. valida input; se inválido → conta como falha, retry com prompt reforçado
   f. recebe response final session/prompt:
      - stopReason=end_turn + completion_tool_seen=true → sucesso
      - stopReason=end_turn + completion_tool_seen=false → falha de contrato (ADR-005)
      - stopReason=refusal/max_tokens/max_turn_requests → falha normal
5. com input válido do report_implementer_result:
   - status=completed → próxima fase (Reviewer)
   - status=failed → retry (até max_retries=3) ou halt
6. PhaseRunner.run({ phase: "reviewer", task: N }):
   - mesma estrutura, completion_tool=report_review_result
   - se requires_rework=true → volta ao Implementer com issues[] no prompt
7. PhaseRunner.run({ phase: "finalizer", task: N }):
   - completion_tool=report_finalizer_result
   - se committed=false → halt imediato (RF-04)
8. persiste telemetria final em tasks/prd-X/telemetry/[N]_telemetry.json
9. avança para próxima task pendente
```

---

## Design de Implementação

### Interfaces Principais

#### Schema dos tools de conclusão

```typescript
// packages/schemas/src/report-tools.ts (Zod)
export const ReportImplementerResult = z.object({
  status: z.enum(["completed", "failed"]),
  files_changed: z.array(z.string()),
  build_passed: z.boolean(),
  tests_passed: z.boolean(),
  summary: z.string().min(1),
  issues_encountered: z.array(z.object({
    severity: z.enum(["blocker", "warning", "info"]),
    description: z.string(),
  })),
});

export const ReportReviewResult = z.object({
  approved: z.boolean(),
  issues: z.array(z.object({
    severity: z.enum(["critical", "high", "medium", "low"]),
    category: z.string(),
    description: z.string(),
    file_path: z.string().optional(),
    line: z.number().optional(),
  })),
  severity_counts: z.object({
    critical: z.number(),
    high: z.number(),
    medium: z.number(),
    low: z.number(),
  }),
  requires_rework: z.boolean(),
  review_file_path: z.string(),
});

export const ReportFinalizerResult = z.object({
  committed: z.boolean(),
  sha: z.string().nullable(),
  merged: z.boolean(),
  branch_deleted: z.boolean(),
  files_committed: z.array(z.string()),
});
```

#### Interface PhaseRunner

```typescript
// packages/orchestrator/src/phase-runner.ts
export interface PhaseRunnerOptions {
  phase: "implementer" | "reviewer" | "finalizer";
  taskNumber: number;
  prdDir: string;
  attempt: number;
  maxRetries: number;
  acpRuntime: AcpClient;
  mcpHandle: McpServerHandle;
  retryReinforcement?: string; // prompt prefix em retry de contrato
}

export interface PhaseRunnerResult {
  outcome: "advance" | "retry" | "halt";
  attemptsUsed: number;
  completionInput: ReportImplementerResultT | ReportReviewResultT | ReportFinalizerResultT | null;
  reason?: string;
  telemetry: PhaseTelemetry;
}

export class PhaseRunner {
  async run(opts: PhaseRunnerOptions): Promise<PhaseRunnerResult>;
}
```

#### Interface TelemetryWriter

```typescript
// packages/orchestrator/src/telemetry-writer.ts
export class TelemetryWriter {
  constructor(private prdDir: string) {}
  startTask(taskNumber: number, prdSlug: string): TaskTelemetryHandle;
}

export interface TaskTelemetryHandle {
  recordPhaseStart(phase: PhaseName, attempt: number): void;
  recordNotification(phase: PhaseName, attempt: number, notif: AcpNotification): void;
  recordPhaseEnd(phase: PhaseName, attempt: number, summary: PhaseTelemetry): void;
  finalize(status: "completed" | "failed" | "halted", haltReason?: string): Promise<void>;
}
```

### Modelos de Dados

#### Telemetria por task

Schema completo em `packages/schemas/src/telemetry.ts`. Estrutura:

```json
{
  "telemetry_schema_version": "1.0",
  "task_id": 3,
  "prd_slug": "orquestrador-em-codigo",
  "started_at": "2026-04-26T13:00:00Z",
  "ended_at": "2026-04-26T13:14:32Z",
  "duration_ms": 872000,
  "status": "completed",
  "halt_reason": null,
  "phases": [
    {
      "name": "implementer",
      "attempts": [{
        "attempt": 1,
        "started_at": "...",
        "ended_at": "...",
        "duration_ms": 480000,
        "stop_reason": "end_turn",
        "tokens": { "input": 12450, "output": 3200 },
        "tokens_unavailable": false,
        "tool_call_count": 7,
        "completion_tool_invoked": true,
        "completion_input": { "status": "completed", "files_changed": ["..."], "...": "..." },
        "notifications_log_path": "./3_telemetry/implementer-attempt-1-notifications.jsonl"
      }]
    },
    { "name": "reviewer", "attempts": [/* ... */] },
    { "name": "finalizer", "attempts": [/* ... */] }
  ],
  "summary": {
    "total_iterations": 2,
    "total_tokens": { "input": 28900, "output": 7800 },
    "tokens_unavailable_in_any_phase": false,
    "review_issues": [/* ... */]
  }
}
```

Notificações ACP completas vão para JSONL auxiliar em
`tasks/prd-[slug]/telemetry/[N]_telemetry/<phase>-attempt-<n>-notifications.jsonl`.

#### Estado de instalação

```json
// <projeto>/.claude/.looping-agent-state.json
{
  "looping_agent_version": "1.0.0",
  "installed_at": "2026-04-26T13:00:00Z",
  "skills": {
    "flow-prd-creator":     { "hash": "sha256:...", "installed_version": "1.0.0" },
    "flow-implementer":     { "hash": "sha256:...", "installed_version": "1.0.0" },
    "flow-workflow-memory": { "hash": "sha256:...", "installed_version": "1.0.0" }
    // ... 19 entradas
  }
}
```

#### Frontmatter canônico das skills

Schemas Zod em `packages/schemas/src/skill-frontmatter.ts`:

```typescript
const baseFrontmatter = z.object({
  name: z.string().regex(/^flow-/),
  description: z.string(),
  pipeline_stage: z.enum([
    "vision", "domain", "prd", "contract", "techspec", "tasks",
    "implementer", "reviewer", "finalizer", "runtime",
  ]),
  consumed_by: z.array(z.enum(["planning", "orchestrator", "implementer", "reviewer", "finalizer"])),
  requires: z.array(z.string()),
  produces: z.array(z.string()),
});

const phaseFrontmatter = baseFrontmatter.extend({
  pipeline_stage: z.enum(["implementer", "reviewer", "finalizer"]),
  consumed_by: z.array(z.literal("orchestrator")),
  loads_skills: z.array(z.string().regex(/^flow-/)),
  completion_tool: z.enum([
    "report_implementer_result",
    "report_review_result",
    "report_finalizer_result",
  ]),
});
```

### Endpoints de API

> O produto é um CLI local sem endpoints HTTP. Esta seção lista os **comandos** do CLI
> como interface pública.

| Comando | Argumentos | Função |
|---|---|---|
| `looping-agent setup` | `[--force]` | Cria `<projeto>/.claude/skills/` com 19 skills, `.looping-agent-state.json`, valida runtime ACP detectado, faz smoke test do MCP server |
| `looping-agent update` | `[--force]` | Atualiza skills com backup `.bak`; valida frontmatter contra schemas |
| `looping-agent run` | `--prd-dir=<path>` `[--max-retries=3]` `[--runtime=claude-acp]` `[--no-color]` | Executa o loop sobre `<path>/tasks.md` |
| `looping-agent doctor` | — | Diagnóstico: Node version, runtime ACP detectado, integridade das skills, `.bak` pendentes |
| `looping-agent --help` / `--version` | — | Padrão CLI |

#### Mapeamento de exceções (CLI exit codes)

| Erro | Exit code | Causa |
|---|---|---|
| Setup sem agent ACP detectado | 1 | RF-01 critério: "máquina sem nenhum agente suportado" |
| Setup já feito (idempotência ok) | 0 | RF-01 critério: idempotência |
| `tasks.md` ausente | 2 | RF-03 |
| Runtime ACP indisponível em `run` | 3 | RF-03 |
| Halt-on-failure (retries esgotados) | 10 | RF-04 |
| Halt por `committed: false` | 11 | RF-04 |
| Halt por contrato violado (completion_tool ausente após retries) | 12 | RF-04 + ADR-005 |

---

## Inventário de Artefatos

> Esta seção alimenta diretamente `flow-task-creator`. Caminhos relativos à raiz do
> repositório do produto (`looping-agent/`).

### Arquivos a Criar

| Caminho | Tipo | Skills Aplicáveis | Descrição |
|---------|------|-------------------|-----------|
| `package.json` | Config | — | Monorepo workspaces, scripts, deps |
| `pnpm-workspace.yaml` *ou* `package.json#workspaces` | Config | — | Definição de workspaces npm |
| `tsconfig.base.json` | Config | — | TS strict, ESM, target ES2022 |
| `.eslintrc.cjs` | Config | — | ESLint + typescript-eslint strict |
| `vitest.config.ts` | Config | — | Vitest base para todos os packages |
| `.gitignore` | Config | — | `node_modules`, `dist`, `*.bak`, `*.tsbuildinfo` |
| `README.md` | Doc | — | Quickstart do produto |
| **packages/schemas** | | | |
| `packages/schemas/package.json` | Config | — | Pacote `@looping-agent/schemas` |
| `packages/schemas/tsconfig.json` | Config | — | extends base |
| `packages/schemas/src/index.ts` | Code | — | Re-export public API |
| `packages/schemas/src/report-tools.ts` | Code | — | Zod schemas dos 3 `report_*_result` |
| `packages/schemas/src/telemetry.ts` | Code | — | Zod schemas de telemetry per-task + estado |
| `packages/schemas/src/skill-frontmatter.ts` | Code | — | Zod schemas do frontmatter canônico (base + phase) |
| `packages/schemas/src/install-state.ts` | Code | — | Zod schema do `.looping-agent-state.json` |
| `packages/schemas/test/report-tools.test.ts` | Test | — | Casos válidos/inválidos do schema |
| `packages/schemas/test/skill-frontmatter.test.ts` | Test | — | Validação de frontmatter de skill de fase e base |
| **packages/mcp-server** | | | |
| `packages/mcp-server/package.json` | Config | — | Pacote `@looping-agent/mcp-server`; dep `@modelcontextprotocol/sdk` |
| `packages/mcp-server/tsconfig.json` | Config | — | extends base |
| `packages/mcp-server/src/index.ts` | Code | — | API pública: `createMcpServer({ onToolCall })` |
| `packages/mcp-server/src/server.ts` | Code | — | Implementação stdio do MCP server, registra os 3 tools |
| `packages/mcp-server/src/tool-handlers.ts` | Code | — | Validação Zod e roteamento ao callback |
| `packages/mcp-server/test/server.test.ts` | Test | — | Mock client invoca tool, assert callback recebe input validado |
| **packages/orchestrator** | | | |
| `packages/orchestrator/package.json` | Config | — | Pacote `@looping-agent/orchestrator`; dep `@zed-industries/agent-client-protocol`, `@looping-agent/mcp-server`, `@looping-agent/schemas` |
| `packages/orchestrator/tsconfig.json` | Config | — | extends base |
| `packages/orchestrator/src/index.ts` | Code | — | Public API: `runLoop(opts)` |
| `packages/orchestrator/src/tasks-reader.ts` | Code | `flow-task-creator` | Parser de `tasks.md`; identifica próxima task pendente |
| `packages/orchestrator/src/memory-manager.ts` | Code | `flow-workflow-memory` | Cria/preserva `MEMORY.md` e `memory/[N]_task.md` |
| `packages/orchestrator/src/phase-runner.ts` | Code | `flow-implementer`, `flow-reviewer`, `flow-finalizer` | Abre sessão ACP, aplica skill de fase, captura tool_call |
| `packages/orchestrator/src/retry-policy.ts` | Code | — | Decide retry/advance/halt com base em stopReason + completion_tool_seen (ADR-005) |
| `packages/orchestrator/src/telemetry-writer.ts` | Code | `flow-quality-ledger` | Escreve `[N]_telemetry.json` + JSONL auxiliar |
| `packages/orchestrator/src/acp-client.ts` | Code | — | Wrapper sobre `@zed-industries/agent-client-protocol`, abstrai spawn por runtime configurado |
| `packages/orchestrator/src/runtime-detector.ts` | Code | — | Detecta `claude-agent-acp`, `codex-acp`, `copilot --acp` no PATH |
| `packages/orchestrator/src/prompts/phase-prompt.ts` | Code | — | Template do `session/prompt` instruindo aplicar a skill de fase |
| `packages/orchestrator/src/prompts/retry-contract.ts` | Code | — | Template de prefixo de retry quando completion_tool ausente (ADR-005) |
| `packages/orchestrator/src/prompts/retry-rework.ts` | Code | — | Template de prefixo de retry quando reviewer rejeitou com issues[] |
| `packages/orchestrator/src/loop.ts` | Code | — | Orquestração principal: itera tasks pendentes, sequencia 3 fases |
| `packages/orchestrator/test/phase-runner.test.ts` | Test | — | Mock ACP + MCP, cobre todos os branches de retry/advance/halt |
| `packages/orchestrator/test/retry-policy.test.ts` | Test | — | Tabela de stopReason × completion_tool_seen × outcome |
| `packages/orchestrator/test/telemetry-writer.test.ts` | Test | — | Schema válido escrito em FS temporário |
| `packages/orchestrator/test/loop.integration.test.ts` | Test | — | Loop end-to-end com agents mockados |
| **packages/cli** | | | |
| `packages/cli/package.json` | Config | — | Bin: `looping-agent`; deps: `commander` ou `cac`, `ora`, `picocolors` |
| `packages/cli/tsconfig.json` | Config | — | extends base |
| `packages/cli/src/index.ts` | Code | — | Entry, parse de args, despacho |
| `packages/cli/src/commands/setup.ts` | Code | — | RF-01: detecta runtime, copia skills, cria `.looping-agent-state.json`, valida MCP server |
| `packages/cli/src/commands/update.ts` | Code | — | ADR-004: overwrite com `.bak`, validação de frontmatter |
| `packages/cli/src/commands/run.ts` | Code | — | Despacha `runLoop` do orchestrator com flags |
| `packages/cli/src/commands/doctor.ts` | Code | — | Diagnóstico (Node version, runtime, skills, `.bak`) |
| `packages/cli/src/renderer/terminal-ui.ts` | Code | — | Cores, spinner, streaming de notificações ACP |
| `packages/cli/src/renderer/notification-formatter.ts` | Code | — | Renderiza session/update.{plan,agent_message_chunk,tool_call,tool_call_update} |
| `packages/cli/src/skills-installer.ts` | Code | `flow-*` (todas) | Lê skills empacotadas, copia para `<projeto>/.claude/skills/`, calcula hash |
| `packages/cli/src/state-manager.ts` | Code | — | Lê/escreve `.looping-agent-state.json` |
| `packages/cli/test/setup.test.ts` | Test | — | Idempotência, faltando runtime, projeto novo |
| `packages/cli/test/update.test.ts` | Test | — | `.bak` criado quando hash difere; pula quando igual |
| `packages/cli/test/skills-installer.test.ts` | Test | — | Hash determinístico, normalização de line endings |
| **Skills empacotadas (já existem em `skills/`)** | | | |
| `skills/flow-vision-creator/SKILL.md` *(referência)* | Skill | — | Já existente |
| `skills/flow-domain-creator/SKILL.md` *(referência)* | Skill | — | Já existente |
| `skills/flow-prd-creator/SKILL.md` *(referência)* | Skill | — | Já existente |
| `skills/flow-contract-creator/SKILL.md` *(referência)* | Skill | — | Já existente |
| `skills/flow-techspec-creator/SKILL.md` *(referência)* | Skill | — | Já existente |
| `skills/flow-frontend-techspec-creator/SKILL.md` *(referência)* | Skill | — | Já existente |
| `skills/flow-task-creator/SKILL.md` *(referência)* | Skill | — | Já existente |
| `skills/flow-implementer/SKILL.md` *(referência)* | Skill | — | Já existente |
| `skills/flow-reviewer/SKILL.md` *(referência)* | Skill | — | Já existente |
| `skills/flow-finalizer/SKILL.md` *(referência)* | Skill | — | Já existente |
| `skills/flow-workflow-memory/SKILL.md` *(referência)* | Skill | — | Já existente |
| `skills/flow-workflow-memory-compaction/SKILL.md` *(referência)* | Skill | — | Já existente |
| `skills/flow-task-implementation/SKILL.md` *(referência)* | Skill | — | Já existente |
| `skills/flow-stack-selector/SKILL.md` *(referência)* | Skill | — | Já existente |
| `skills/flow-final-verify/SKILL.md` *(referência)* | Skill | — | Já existente |
| `skills/flow-quality-checks/SKILL.md` *(referência)* | Skill | — | Já existente |
| `skills/flow-code-review/SKILL.md` *(referência)* | Skill | — | Já existente |
| `skills/flow-quality-ledger/SKILL.md` *(referência)* | Skill | — | Já existente |
| `skills/flow-git-linear/SKILL.md` *(referência)* | Skill | — | Já existente |
| **CI / scripts** | | | |
| `.github/workflows/ci.yml` | Config | — | Build + lint + test em PR (Node 20 LTS) |
| `scripts/release.ts` | Code | — | Bump version, build, npm publish (manual trigger) |
| **Documentação** | | | |
| `docs/cli-usage.md` | Doc | — | Exemplos `setup`/`update`/`run`/`doctor` |
| `docs/skills-customization.md` | Doc | — | Como customizar skills, semântica do `.bak` |
| `docs/architecture.md` | Doc | — | Resumo desta TechSpec para devs externos |
| `docs/troubleshooting.md` | Doc | — | Casos comuns: runtime não detectado, MCP server falha, completion_tool ausente |

### Arquivos a Modificar

| Caminho | Skills Aplicáveis | Alteração |
|---------|-------------------|-----------|
| `tasks/prd-orquestrador-em-codigo/prd.md` | — | Não modificar nesta TechSpec; já consolidado |

### Arquivos de Referência (não alterar)

| Caminho | Motivo da Consulta |
|---------|-------------------|
| `tasks/prd-orquestrador-em-codigo/prd.md` | Fonte da verdade dos requisitos funcionais |
| `tasks/prd-orquestrador-em-codigo/adrs/adr-00*.md` | Decisões arquiteturais formais desta TechSpec |
| `skills/flow-implementer/SKILL.md` | Contrato de fase consumido pelo PhaseRunner |
| `skills/flow-reviewer/SKILL.md` | Idem |
| `skills/flow-finalizer/SKILL.md` | Idem |
| `skills/flow-workflow-memory/SKILL.md` | Estrutura de memória que o orquestrador instancia |
| `skills/flow-quality-ledger/SKILL.md` | Formato do ledger que o reviewer escreve |
| `skills_old/agents/copilot-orchestrator.agent.md` | Histórico do orquestrador-agente sendo substituído |
| `docs/conversa.md` | Histórico de discussão arquitetural |

---

## Pontos de Integração

| Integração | Propósito | Auth | Erro/Retry | Timeout/Idempotência |
|---|---|---|---|---|
| **Runtime ACP** (claude-agent-acp / codex-acp / copilot --acp) | Hospedar agent ACP por sessão | Local stdio | Falha de spawn → halt com mensagem acionável | Sessão ACP por fase; runtime termina com `stopReason` |
| **MCP server local** | Expor tools `report_*` para o agent | Stdio mesmo processo | N/A — falha de spawn é falha de produto | Per-execução do CLI |
| **Filesystem** | Skills, tasks, telemetria, memória | Local FS perms | Erro → halt com path exato | Escritas atômicas (write+rename) onde aplicável |
| **npm registry** *(distribuição)* | Publicar/atualizar `@looping-agent/cli` | npm token | N/A em runtime | N/A em runtime |

Não há integrações com APIs HTTP externas no MVP.

---

## Análise de Impacto

| Componente Afetado | Tipo de Impacto | Descrição & Risco | Ação Requerida |
|---|---|---|---|
| Skills existentes em `<projeto>/.claude/skills/` | Modificado (no projeto do usuário) | Setup/update sobrescreve com `.bak`. Risco baixo: backup existe | Dev revisa `.bak` se necessário |
| `tasks.md` do PRD | Lido (não modificado) | Orchestrator parse-only | Nenhuma |
| `MEMORY.md` + `memory/[N]_task.md` | Criado/modificado pelo agent | Orchestrator cria estrutura inicial; agent escreve via skill | Dev pode commitar memória ou ignorar |
| `[N]_task_review.md` | Criado pelo agent (Reviewer) | Skill `flow-reviewer` produz | Vem no commit do Finalizer |
| `tasks.md` (atualização `[x]`) | Modificado pelo agent (Finalizer) | Skill `flow-finalizer` marca tasks concluídas | Vem no commit do Finalizer |
| `tasks/prd-X/telemetry/` | Criado pelo orchestrator | Diretório novo no PRD do dev | Time decide se versiona ou ignora |
| `<projeto>/.claude/.looping-agent-state.json` | Criado/modificado | Trackeia hashes das skills | Time pode versionar ou ignorar |
| Histórico git | Modificado (Finalizer) | Commit por task + merge ff-only em main | Dev faz push manual |
| `~/.npm` (global install) | Modificado (setup do produto) | npm install global | Dev tem Node ≥ 20 |

Componentes **não afetados**: orquestrador antigo (`copilot-orchestrator.agent.md`) fica em
`skills_old/agents/` como histórico, sem ser executado. Outros agents do `skills_old/`
idem.

---

## Abordagem de Testes

### Testes Unitários

Strategy: cada package tem testes Vitest isolados; mocks apenas para dependências externas
(spawn de runtime ACP, FS write/read em diretório temporário).

| Componente | Casos cobertos |
|---|---|
| `packages/schemas` | Schemas válidos, edge cases (campos ausentes, tipos errados, enums fora do range) |
| `packages/mcp-server/server.ts` | Mock client invoca tools; valida que callback recebe input parseado por Zod |
| `packages/orchestrator/tasks-reader.ts` | Parser de `tasks.md` com tasks `[ ]` / `[x]` / `[~]` (em progresso) |
| `packages/orchestrator/retry-policy.ts` | Tabela exaustiva: (stopReason × completion_tool_seen × max_retries × current_attempt) → outcome |
| `packages/orchestrator/phase-runner.ts` | Mocks de AcpClient + MCP; testa cada branch (sucesso 1ª tentativa, retry com prompt reforçado, halt após esgotar) |
| `packages/orchestrator/telemetry-writer.ts` | JSON gerado valida contra schema; halt parcial preserva estado |
| `packages/cli/skills-installer.ts` | Hash determinístico após normalização (LF, trim trailing); 19 skills copiadas; idempotência |
| `packages/cli/commands/setup.ts` | Sem runtime detectado → exit 1; runtime ok → cria estrutura; idempotência |
| `packages/cli/commands/update.ts` | Hash igual → no-op; hash diferente → `.bak` + overwrite |

### Testes de Integração

| Cenário | Componentes |
|---|---|
| Setup completo em diretório temporário com runtime mockado | CLI + skills-installer + state-manager |
| Loop end-to-end de 1 task com agents mockados que invocam corretamente os tools | CLI + Orchestrator + MCP Server + AcpClient mock |
| Loop com Implementer falhando 3x e halt | RetryPolicy + PhaseRunner + TelemetryWriter |
| Loop com Reviewer rejeitando 1x e Implementer corrigindo na 2ª | PhaseRunner + RetryPolicy + prompts/retry-rework |
| Loop com agent que esquece de invocar `completion_tool` 1x e acerta na 2ª | RetryPolicy + prompts/retry-contract (ADR-005) |
| Halt por `committed: false` | PhaseRunner finalizer + RetryPolicy |
| Telemetria com runtime que não reporta tokens | TelemetryWriter (campo `tokens_unavailable`) |

### Testes End-to-End (smoke, manual ou agendados)

> Não bloqueantes para CI por requisitarem runtime ACP real instalado.

- **Smoke contra Claude Code real:** PRD exemplo com 1 task trivial executa do início ao fim.
- **Smoke contra Codex CLI:** mesmo PRD, runtime diferente.
- **Reprodutibilidade (RF-03 critério):** rodar 3x o mesmo input e comparar telemetria das
  3 — sequência de chamadas a sub-agents deve ser idêntica em ≥ 95% das execuções.

### Critério de cobertura

- Cobertura ≥ 80% para `packages/orchestrator` e `packages/schemas` (núcleo do produto).
- Cobertura ≥ 60% para `packages/cli` (UI tem componentes difíceis de testar).
- 100% dos branches do `retry-policy.ts` (tabela de decisão crítica).

---

## Sequenciamento de Desenvolvimento

### Build Order

1. **`@looping-agent/schemas`** — sem dependências internas. Define os contratos que tudo
   mais consome.
2. **`@looping-agent/mcp-server`** — depende de `schemas`. Pode ser desenvolvido isolado
   com testes contra MCP client mock.
3. **`@looping-agent/orchestrator/tasks-reader.ts` + `memory-manager.ts`** — depende de
   `schemas`. Testáveis sem ACP.
4. **`@looping-agent/orchestrator/acp-client.ts` + `runtime-detector.ts`** — depende de
   `schemas`. Pode ser desenvolvido com mock do `@zed-industries/agent-client-protocol`.
5. **`@looping-agent/orchestrator/retry-policy.ts`** — depende de `schemas`. 100% lógica
   pura, alta cobertura de testes.
6. **`@looping-agent/orchestrator/phase-runner.ts`** — depende de 1, 2, 4, 5. Integra ACP
   client + MCP server + retry policy.
7. **`@looping-agent/orchestrator/telemetry-writer.ts`** — depende de `schemas`. Pode ser
   paralelo a 6.
8. **`@looping-agent/orchestrator/loop.ts`** — depende de 3, 6, 7. Orquestração principal.
9. **`@looping-agent/cli/skills-installer.ts` + `state-manager.ts`** — depende de
   `schemas`. Paralelo ao orchestrator.
10. **`@looping-agent/cli/commands/setup.ts` + `update.ts` + `doctor.ts`** — depende de 9.
11. **`@looping-agent/cli/renderer/*`** — paralelo a 10. Pode ser stub inicialmente.
12. **`@looping-agent/cli/commands/run.ts`** — depende de 8, 10, 11.
13. **CI workflow + scripts de release** — depois do código estar verde.
14. **Docs** — paralelo às últimas etapas.

### Dependências Técnicas Bloqueantes

- **Cliente ACP TS estável:** `@zed-industries/agent-client-protocol` precisa estar em
  versão pinada antes de iniciar etapa 4. Se a API mudar significativamente durante o
  desenvolvimento, replanar.
- **MCP TS SDK estável:** `@modelcontextprotocol/sdk` idem para etapa 2.
- **Decisão sobre versão mínima ACP:** documentar em ADR ou release notes antes do RC.
- **Acesso a runtimes ACP para testes manuais:** dev/owner garante Claude Code + Codex CLI
  instaláveis em ambiente de smoke test.

---

## Monitoramento e Observabilidade

> Esta seção é mais leve que em produtos cloud — o produto é local.

### Telemetria estruturada (já coberta por RF-06)

- 1 JSON por task em `tasks/prd-X/telemetry/[N]_telemetry.json` (ADR-003)
- Notificações ACP completas em JSONL auxiliar
- Schema versionado para evolução

### Logs do orquestrador

- **Modo padrão:** UI rica via terminal (cores, spinner). Stderr não usado para conteúdo
  estruturado; apenas erros fatais.
- **Modo verbose** (`--verbose`): adiciona dump de eventos ACP em stderr para debugging.
- **Modo debug** (`--debug`): também escreve `tasks/prd-X/telemetry/[N]_debug.log` com
  timestamps, stack traces e estado interno do orquestrador.

### Health diagnostic

`looping-agent doctor` cobre:

- Node version ≥ 20
- Runtime ACP detectado (versão + path)
- 19 skills presentes em `<projeto>/.claude/skills/`
- Hash de cada skill bate com o esperado
- `.bak` files pendentes de revisão
- MCP server smoke test (spawn + list_tools + shutdown)

### Métricas agregadas (RF-09)

`looping-agent run` ao final imprime resumo + persiste em
`tasks/prd-X/telemetry/run-summary-YYYYMMDD-HHMMSS.json`:

```json
{
  "run_started_at": "...",
  "run_ended_at": "...",
  "tasks_total": 5,
  "tasks_completed": 4,
  "tasks_halted": 1,
  "halt_task_number": 3,
  "halt_reason": "implementer retries exhausted",
  "total_iterations": 9,
  "total_tokens": { "input": 145000, "output": 38000 },
  "total_duration_ms": 4380000,
  "average_tokens_per_task": { "input": 29000, "output": 7600 }
}
```

---

## Considerações Técnicas

### Decisões Principais

Resumidas em ADRs:

- **ADR-001:** Stack TypeScript + Node.js, distribuído via npm
- **ADR-002:** Servidor MCP local hospedado pelo orquestrador
- **ADR-003:** Telemetria JSON por task no diretório do PRD
- **ADR-004:** Skills no escopo do projeto, update via `.bak`
- **ADR-005:** Retry com prompt reforçado para `completion_tool` ausente

### Riscos Conhecidos

- **Cliente ACP TS em evolução:** breaking changes do protocolo podem exigir refatoração
  do `acp-client.ts`. *Mitigação:* abstração própria sobre o SDK, testes contra os 2
  runtimes, pin de versão ADR-001.
- **MCP server nem sempre é honrado pelo agent ACP:** RF-05 questão em aberto. *Mitigação:*
  RF-01 valida via smoke test no setup; ADR-005 trata o caso de runtime que aceita o tool
  mas não invoca.
- **PII em telemetria:** notificações ACP brutas podem conter conteúdo sensível do código.
  *Mitigação:* documentar em `troubleshooting.md`; opcional flag `--no-raw-notifications`
  para suprimir JSONL auxiliar (mantém só o JSON resumido) — Phase 2.
- **Custo de tokens em runtime que não reporta tokens:** dificulta a métrica primária do
  PRD. *Mitigação:* documentar em release notes; baseline coletado nos runtimes que
  reportam (Claude Code).
- **Falta de skills `node-architecture`/`node-testing` no catálogo:** convenções de TS/Node
  para este produto são desta TechSpec, não de skills externas. *Mitigação:* criar
  `docs/architecture.md` consolidando as convenções; futuras evoluções podem extrair em
  skills.

### Requisitos Especiais

- **Performance:** orquestrador deve adicionar < 200ms de overhead por fase (excluindo
  tempo do LLM). Validado via benchmark no `phase-runner.test.ts`.
- **Segurança:** MCP server local aceita conexões apenas via stdio (sem porta TCP/HTTP).
  Tools `report_*` apenas validam input — não executam código arbitrário.
- **Conformidade:** N/A no MVP (uso single-user local).

### Conformidade com Skills

Como não há skills `node-*` no catálogo, esta TechSpec define convenções:

- **Estrutura:** monorepo com workspaces; um package por responsabilidade.
- **Linguagem:** TypeScript strict, ESM, target ES2022.
- **Dependências:** apenas libs maduras (`zod`, `commander`/`cac`, `ora`, `picocolors`,
  `@zed-industries/agent-client-protocol`, `@modelcontextprotocol/sdk`).
- **Testes:** Vitest com `--coverage` no CI.
- **Lint:** ESLint + typescript-eslint strict; sem `any`.
- **Naming:** camelCase para variáveis/funções, PascalCase para tipos/classes,
  kebab-case para arquivos.

Desvios identificados: nenhum (não há skills de referência para desviar).

---

## Questões em Aberto

> Pontos resolvidos em 2026-04-26 (decisões do dev/owner).

- [x] **Versão mínima do ACP:** pinar a **última estável** disponível na data de início
  da implementação da task 4.0 (`acp-client.ts`). Documentar a versão pinada em release
  notes e em `docs/architecture.md`.
- [x] **Biblioteca de CLI parser:** **`commander`** (escolhida pela maturidade e
  ecossistema). Aplicada em 15.0.
- [x] **Library de monorepo:** **npm workspaces nativo**. Justificativa: zero ferramenta
  extra para o usuário final do CLI (que ja possui `npm`); alinhado ao canal de
  distribuição (npm). Aplicado em 1.0.
- [x] **Recoverability se MCP server crashar mid-session:** **retry da fase com nova MCP
  server spawn** (default aceito). Aplicado em 11.0 (Loop) — em caso de erro do MCP
  server detectado pelo PhaseRunner, fazer `mcpServer.stop()` + novo `createMcpServer()`
  + `start()` antes do retry da fase corrente, contando como tentativa.
- [x] **`--debug`:** **flag global** (default aceito). Filtro pós-morte via `jq` na
  telemetria JSONL. Aplicado em 15.0.
- [x] **Comprimir JSONL auxiliar:** **não no MVP** (default aceito). Usuário aplica
  `gzip` externamente se necessário.
- [x] **`.bak` em `update`:** **sobrescreve o anterior** (default aceito — não rotaciona).
  Aplicado em 12.0/14.0.

---

## Architecture Decision Records

- [ADR-001: Orquestrador em TypeScript + Node.js, distribuído via npm](adrs/adr-001.md) — Define stack do produto
- [ADR-002: Servidor MCP local hospedado pelo orquestrador para tools `report_*`](adrs/adr-002.md) — Define mecanismo de entrega dos tools
- [ADR-003: Telemetria como JSON por task no diretório do PRD](adrs/adr-003.md) — Define formato e localização da telemetria
- [ADR-004: Skills instaladas no escopo do projeto, com update via overwrite + .bak](adrs/adr-004.md) — Define UX de instalação e atualização
- [ADR-005: Política de retry para sessões ACP que não invocam o `completion_tool`](adrs/adr-005.md) — Define recuperação para violação de contrato

---

## Próximos Passos

1. **Implementação:** Use a skill `flow-task-creator` referenciando esta TechSpec para
   gerar as tarefas de implementação atômicas e ordenadas.
2. **Frontend:** N/A — produto é CLI sem frontend.
3. **Validação:** itens da seção "Questões em Aberto" devem ser resolvidos antes ou
   durante a implementação. Decisões da implementação que mudem o desenho aqui devem
   atualizar a TechSpec ou criar ADR adicional.
4. **Pré-implementação:** confirmar versão pinada de `@zed-industries/agent-client-protocol`
   e `@modelcontextprotocol/sdk` antes da etapa 2 do Build Order.
