---
status: completed
parallelizable: true
blocked_by: [2.0]
---

<task_context>
<domain>engine/orchestrator</domain>
<type>implementation</type>
<scope>core_feature</scope>
<complexity>medium</complexity>
<dependencies>none</dependencies>
<unblocks>"10.0"</unblocks>
</task_context>

# Tarefa 7.0: Orchestrator — RetryPolicy (decisao retry/advance/halt)

## Relacionada as User Stories

- US: pipeline pausa imediatamente quando esgotar retries

## Visao Geral

Implementar a logica pura que decide o proximo passo do loop a partir de
`(stopReason, completion_tool_seen, completion_input, attempt, maxRetries)`. Cobre
todos os branches: sucesso 1ª tentativa, retry com prompt reforcado para violacao de
contrato (ADR-005), retry por rejeicao do reviewer com `requires_rework`, halt por
limite esgotado, halt por `committed: false` do finalizer (RF-04). 100% logica pura.

## Requisitos

- Funcao pura `decide(input): RetryDecision` — sem I/O, sem deps externas
- Cobertura 100% dos branches (criterio explicito — TechSpec secao "Critério de cobertura")
- Tabela de decisao testada exaustivamente
- Modela ADR-005 (completion_tool ausente -> retry com prompt reforcado, contagem de tentativa)

## Arquivos Envolvidos

- **Criar:**
  - `packages/orchestrator/src/retry-policy.ts`
  - `packages/orchestrator/src/retry-types.ts` (`RetryDecision`, `RetryInput`)
  - `packages/orchestrator/test/retry-policy.test.ts` (testes em tabela)
- **Modificar:** —
- **Referencia:**
  - `tasks/prd-orquestrador-em-codigo/prd.md` RF-04 e RF-05
  - `tasks/prd-orquestrador-em-codigo/adrs/adr-005.md`
- **Skills para consultar durante implementacao:** —

## Subtarefas

- [x] 7.1 Tipo `RetryInput { phase, stopReason, completionToolSeen, completionInput, attempt, maxRetries }`
- [x] 7.2 Tipo `RetryDecision = { kind: "advance"; completionInput }` | `{ kind: "retry"; reason: RetryReason; reinforcement?: PromptReinforcement }` | `{ kind: "halt"; reason }`
- [x] 7.3 Implementar `decide(input)` — cobre todas as combinacoes
- [x] 7.4 Especifico: implementer com `status: failed` -> retry/halt
- [x] 7.5 Especifico: reviewer com `requires_rework: true` -> retry com `reinforcement: { kind: "rework", issues }`
- [x] 7.6 Especifico: finalizer com `committed: false` -> halt imediato (RF-04)
- [x] 7.7 Especifico: stopReason `refusal`/`max_tokens`/`max_turn_requests` -> falha + retry/halt
- [x] 7.8 Especifico: `stopReason: end_turn` SEM `completionToolSeen` -> ADR-005 retry com `reinforcement: { kind: "contract" }`
- [x] 7.9 Tabela de testes: cartesiano de phase x stopReason x completionToolSeen x attempt
- [x] 7.10 Garantir 100% de cobertura de branches

## Sequenciamento

- Bloqueado por: 2.0
- Desbloqueia: 10.0
- Paralelizavel: Sim

## Rastreabilidade

- Esta tarefa cobre: RF-04 (politica de retry com halt-on-failure), RF-05 criterio "input invalido conta como tentativa", ADR-005
- Evidencia esperada: tabela de testes cobre todos os branches; cobertura de 100% no `retry-policy.ts`.

## Detalhes de Implementacao

**Tipos:**

```typescript
// packages/orchestrator/src/retry-types.ts
import type {
  ReportImplementerResultT,
  ReportReviewResultT,
  ReportFinalizerResultT,
} from "@looping-agent/schemas";
import type { AcpStopReason } from "./acp-types";

export type PhaseName = "implementer" | "reviewer" | "finalizer";

export type CompletionInput =
  | ReportImplementerResultT
  | ReportReviewResultT
  | ReportFinalizerResultT
  | null; // null quando completion_tool nao foi invocado

export interface RetryInput {
  phase: PhaseName;
  stopReason: AcpStopReason;
  completionToolSeen: boolean;
  completionInput: CompletionInput;
  attempt: number;        // 1-indexed
  maxRetries: number;     // 3 default
}

export type PromptReinforcement =
  | { kind: "contract" }                                // ADR-005
  | { kind: "rework"; issues: ReportReviewResultT["issues"] }
  | { kind: "schema"; errorMessage: string };            // input invalido

export type RetryReason =
  | "stop_reason_failure"
  | "completion_tool_missing"      // ADR-005
  | "schema_invalid"
  | "implementer_failed"
  | "review_requires_rework";

export type HaltReason =
  | "retries_exhausted"
  | "finalizer_not_committed"
  | "contract_violation_unrecoverable";

export type RetryDecision =
  | { kind: "advance"; completionInput: CompletionInput }
  | { kind: "retry"; reason: RetryReason; reinforcement?: PromptReinforcement }
  | { kind: "halt"; reason: HaltReason };
```

**Tabela de decisao (resumo):**

| phase | stopReason | toolSeen | input | attempt<max | -> |
|-------|------------|----------|-------|-------------|-----|
| any | end_turn | false | null | true | retry/contract |
| any | end_turn | false | null | false | halt/contract_violation_unrecoverable |
| any | refusal/max_* | _ | _ | true | retry/stop_reason_failure |
| any | refusal/max_* | _ | _ | false | halt/retries_exhausted |
| implementer | end_turn | true | { status: "completed" } | _ | advance |
| implementer | end_turn | true | { status: "failed" } | true | retry/implementer_failed |
| implementer | end_turn | true | { status: "failed" } | false | halt/retries_exhausted |
| reviewer | end_turn | true | { requires_rework: false } | _ | advance |
| reviewer | end_turn | true | { requires_rework: true } | true | retry/review_requires_rework + reinforcement.rework |
| reviewer | end_turn | true | { requires_rework: true } | false | halt/retries_exhausted |
| finalizer | end_turn | true | { committed: true } | _ | advance |
| finalizer | end_turn | true | { committed: false } | _ | halt/finalizer_not_committed |

(Schema invalido: tratado upstream pelo PhaseRunner via Zod; quando o PhaseRunner detecta
schema invalido seta `completionToolSeen: false` ou propaga `kind: "schema"` — decisao a
ser confirmada na task 10.0.)

**Convencoes da stack:**

- Sem `any` — uniao discriminada exaustiva
- Funcao pura — sem `Date.now()`, sem `console.log`, sem FS
- Testes em tabela com `it.each`

## Criterios de Sucesso (Verificaveis)

- [x] Testes passam: `npm test --workspace=@looping-agent/orchestrator -- retry-policy`
- [x] Cobertura de branches 100% no `retry-policy.ts`: `npm run test:coverage`
- [x] Build compila
- [x] Tabela de testes cobre TODOS os pares `(phase, stopReason, toolSeen, attempt<max)` da matriz acima
- [x] Teste especifico: `phase=finalizer, committed=false` -> `halt/finalizer_not_committed` independente de `attempt`
- [x] Teste especifico: `phase=any, end_turn, toolSeen=false, attempt<max` -> `retry/contract`
