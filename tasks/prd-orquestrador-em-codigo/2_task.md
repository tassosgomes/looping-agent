---
status: completed
parallelizable: false
blocked_by: [1.0]
---

<task_context>
<domain>engine/schemas</domain>
<type>implementation</type>
<scope>core_feature</scope>
<complexity>medium</complexity>
<dependencies>none</dependencies>
<unblocks>"3.0,4.0,5.0,6.0,7.0,8.0,9.0,10.0,11.0,12.0,13.0,14.0,15.0"</unblocks>
</task_context>

# Tarefa 2.0: Package `@looping-agent/schemas` com Zod schemas compartilhados

## Relacionada as User Stories

- US: pipeline pausa imediatamente quando esgotar retries (suporte — schemas validam o contrato)
- US: abrir telemetria por execucao (suporte — schema versionado)

## Visao Geral

Implementar todos os schemas Zod consumidos pelos demais packages: tools de conclusao
(`report_*_result`), telemetria por task, frontmatter canonico das skills (base + phase)
e estado de instalacao. Tipos exportados via `z.infer` para consumo por todos os
packages downstream. Nao depende de outros pacotes internos.

## Requisitos

- 100% dos contratos do produto vivem aqui (single source of truth)
- Schemas exportam tipos via `z.infer<typeof X>` com nomes `XT` (ex: `ReportImplementerResultT`)
- Schemas com `.strict()` onde aplicavel para falhar em campos extras
- Validacao de frontmatter de skill cobre base e variante de fase
- 100% de cobertura nos testes (Zod e logica pura facil de testar)

## Arquivos Envolvidos

- **Criar:**
  - `packages/schemas/src/index.ts` (re-export public API)
  - `packages/schemas/src/report-tools.ts` (Zod dos 3 `report_*_result`)
  - `packages/schemas/src/telemetry.ts` (Zod de telemetria per-task + run-summary)
  - `packages/schemas/src/skill-frontmatter.ts` (Zod de frontmatter canonico)
  - `packages/schemas/src/install-state.ts` (Zod do `.looping-agent-state.json`)
  - `packages/schemas/test/report-tools.test.ts`
  - `packages/schemas/test/telemetry.test.ts`
  - `packages/schemas/test/skill-frontmatter.test.ts`
  - `packages/schemas/test/install-state.test.ts`
- **Modificar:**
  - `packages/schemas/package.json` (declarar `dependencies: { "zod": "^3.x" }`, `main`, `types`, `exports`)
- **Referencia:**
  - `tasks/prd-orquestrador-em-codigo/techspec.md` secao "Modelos de Dados" e "Interfaces Principais"
  - `tasks/prd-orquestrador-em-codigo/prd.md` RF-05 (contrato dos `report_*`) e RF-06 (telemetria)
- **Skills para consultar durante implementacao:**
  - `flow-quality-ledger` — formato de issues/severity esperado pelo reviewer

## Subtarefas

- [x] 2.1 Implementar `report-tools.ts` (3 schemas conforme TechSpec)
- [x] 2.2 Implementar `telemetry.ts` (per-task + run-summary, com `telemetry_schema_version: "1.0"`)
- [x] 2.3 Implementar `skill-frontmatter.ts` (base + phase variants com `loads_skills` e `completion_tool`)
- [x] 2.4 Implementar `install-state.ts` (estado de instalacao com hashes)
- [x] 2.5 Re-exportar tipos e schemas em `index.ts`
- [x] 2.6 Testes: casos validos + invalidos (campos faltando, tipos errados, enums fora do range, strings vazias onde proibido)
- [x] 2.7 Garantir cobertura >= 90% no package

## Sequenciamento

- Bloqueado por: 1.0
- Desbloqueia: 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0
- Paralelizavel: Nao (bloqueia tudo o que vem depois)

## Rastreabilidade

- Esta tarefa cobre: RF-05 (contrato dos `report_*`), RF-06 (formato de telemetria), RF-02 (validacao de frontmatter)
- Evidencia esperada: testes Vitest passam em cenarios validos e invalidos; tipos `*T` consumiveis pelos demais packages.

## Detalhes de Implementacao

**Schema dos tools de conclusao (TechSpec secao "Interfaces Principais"):**

```typescript
// packages/schemas/src/report-tools.ts
import { z } from "zod";

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
}).strict();
export type ReportImplementerResultT = z.infer<typeof ReportImplementerResult>;

export const ReportReviewResult = z.object({
  approved: z.boolean(),
  issues: z.array(z.object({
    severity: z.enum(["critical", "high", "medium", "low"]),
    category: z.string(),
    description: z.string(),
    file_path: z.string().optional(),
    line: z.number().int().nonnegative().optional(),
  })),
  severity_counts: z.object({
    critical: z.number().int().nonnegative(),
    high: z.number().int().nonnegative(),
    medium: z.number().int().nonnegative(),
    low: z.number().int().nonnegative(),
  }),
  requires_rework: z.boolean(),
  review_file_path: z.string(),
}).strict();
export type ReportReviewResultT = z.infer<typeof ReportReviewResult>;

export const ReportFinalizerResult = z.object({
  committed: z.boolean(),
  sha: z.string().nullable(),
  merged: z.boolean(),
  branch_deleted: z.boolean(),
  files_committed: z.array(z.string()),
}).strict();
export type ReportFinalizerResultT = z.infer<typeof ReportFinalizerResult>;
```

**Frontmatter canonico (TechSpec):**

```typescript
const PIPELINE_STAGES = [
  "vision","domain","prd","contract","techspec","tasks",
  "implementer","reviewer","finalizer","runtime",
] as const;

export const BaseSkillFrontmatter = z.object({
  name: z.string().regex(/^flow-/),
  description: z.string().min(1),
  pipeline_stage: z.enum(PIPELINE_STAGES),
  consumed_by: z.array(z.enum(["planning","orchestrator","implementer","reviewer","finalizer"])),
  requires: z.array(z.string()),
  produces: z.array(z.string()),
});

export const PhaseSkillFrontmatter = BaseSkillFrontmatter.extend({
  pipeline_stage: z.enum(["implementer","reviewer","finalizer"]),
  consumed_by: z.array(z.literal("orchestrator")),
  loads_skills: z.array(z.string().regex(/^flow-/)),
  completion_tool: z.enum([
    "report_implementer_result",
    "report_review_result",
    "report_finalizer_result",
  ]),
});
```

**Telemetria (TechSpec secao "Modelos de Dados"):**

Modelar conforme JSON do exemplo, incluindo:
- `telemetry_schema_version: z.literal("1.0")`
- `phases: z.array(PhaseTelemetry)` onde cada fase tem `attempts: z.array(AttemptTelemetry)`
- `tokens` opcional + `tokens_unavailable: boolean`
- `notifications_log_path` (relativo ao diretorio de telemetria da task)

**Convencoes da stack:**

- Sem `any` (regra ESLint)
- Tipos `*T` derivados via `z.infer<>`
- `.strict()` em schemas de borda (input externo) para detectar campos extras

## Criterios de Sucesso (Verificaveis)

- [x] Testes passam: `npm test --workspace=@looping-agent/schemas`
- [x] Cobertura >= 90%: `npm run test:coverage --workspace=@looping-agent/schemas`
- [x] Build compila: `npm run build --workspace=@looping-agent/schemas`
- [x] Lint passa: `npm run lint --workspace=@looping-agent/schemas`
- [x] Schema rejeita input invalido em `report-tools.test.ts` (ex: `status` fora do enum)
- [x] Schema aceita frontmatter de fase valido + rejeita falta de `loads_skills`/`completion_tool`
