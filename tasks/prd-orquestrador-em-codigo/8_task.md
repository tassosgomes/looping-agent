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
<dependencies>filesystem</dependencies>
<unblocks>"10.0,11.0"</unblocks>
</task_context>

# Tarefa 8.0: Orchestrator — TelemetryWriter (JSON por task + JSONL auxiliar)

## Relacionada as User Stories

- US: abrir telemetria por execucao
- US: comparar custo de tokens antes/depois (suporte — fonte de dados)

## Visao Geral

Implementar o escritor de telemetria que, para cada task, emite um JSON resumido em
`tasks/prd-<slug>/telemetry/[N]_telemetry.json` e notificacoes ACP brutas em JSONL
auxiliar em `tasks/prd-<slug>/telemetry/[N]_telemetry/<phase>-attempt-<n>-notifications.jsonl`.
ADR-003 fundamenta o formato. Garante persistencia mesmo em halt parcial.

## Requisitos

- Schema validado via `@looping-agent/schemas` (telemetry)
- `tokens_unavailable: true` quando runtime nao reporta (criterio RF-06)
- Halt parcial preserva estado: `finalize("halted", reason)` escreve JSON com fase
  parcial e razao
- Escrita atomica (write tmp + rename) para evitar JSON corrompido em crash
- Diretorio criado lazy
- **JSONL auxiliar nao e comprimido no MVP** (decisao registrada na TechSpec "Questoes
  em Aberto"). Documentar em `docs/troubleshooting.md` (task 17.0) que `gzip` externo
  cobre o caso quando arquivos crescem.

## Arquivos Envolvidos

- **Criar:**
  - `packages/orchestrator/src/telemetry-writer.ts`
  - `packages/orchestrator/src/telemetry-types.ts` (handles + summaries internos)
  - `packages/orchestrator/test/telemetry-writer.test.ts`
- **Modificar:** —
- **Referencia:**
  - `tasks/prd-orquestrador-em-codigo/techspec.md` secao "Modelos de Dados — Telemetria por task"
  - `tasks/prd-orquestrador-em-codigo/adrs/adr-003.md`
  - `tasks/prd-orquestrador-em-codigo/prd.md` RF-06
  - `skills/flow-quality-ledger/SKILL.md`
- **Skills para consultar durante implementacao:**
  - `flow-quality-ledger`

## Subtarefas

- [x] 8.1 Implementar `TelemetryWriter` com construtor `(prdDir)`, metodo `startTask(taskNumber, prdSlug): TaskTelemetryHandle`
- [x] 8.2 Implementar `TaskTelemetryHandle` com `recordPhaseStart`, `recordNotification`, `recordPhaseEnd`, `finalize`
- [x] 8.3 Notificacoes ACP brutas escritas em JSONL append-only no JSONL auxiliar
- [x] 8.4 JSON resumo escrito ao chamar `finalize` (write tmp + rename)
- [x] 8.5 `finalize("halted", reason)` preserva fases parciais
- [x] 8.6 Validar JSON resumo contra schema antes de escrever
- [x] 8.7 Testes: task com 1 implementer + 1 reviewer + 1 finalizer (sucesso) -> JSON valido
- [x] 8.8 Testes: halt apos 3 tentativas de implementer -> JSON inclui 3 attempts em phases[0]
- [x] 8.9 Testes: runtime sem tokens -> `tokens_unavailable: true` no JSON

## Sequenciamento

- Bloqueado por: 2.0
- Desbloqueia: 10.0, 11.0
- Paralelizavel: Sim

## Rastreabilidade

- Esta tarefa cobre: RF-06 (telemetria persistida 100% das execucoes, incluindo halt)
- Evidencia esperada: testes em FS temporario validam JSON contra schema; halt preserva o estado parcial.

## Detalhes de Implementacao

**Estrutura de arquivos:**

```
tasks/prd-<slug>/telemetry/
├── [N]_telemetry.json
└── [N]_telemetry/
    ├── implementer-attempt-1-notifications.jsonl
    ├── reviewer-attempt-1-notifications.jsonl
    └── finalizer-attempt-1-notifications.jsonl
```

**API (TechSpec):**

```typescript
export class TelemetryWriter {
  constructor(prdDir: string);
  startTask(taskNumber: number, prdSlug: string): TaskTelemetryHandle;
}

export interface TaskTelemetryHandle {
  recordPhaseStart(phase: PhaseName, attempt: number): void;
  recordNotification(phase: PhaseName, attempt: number, notif: AcpNotification): void;
  recordPhaseEnd(phase: PhaseName, attempt: number, summary: PhaseAttemptSummary): void;
  finalize(status: "completed" | "failed" | "halted", haltReason?: string): Promise<void>;
}
```

**Escrita atomica:**

```typescript
await fs.writeFile(`${path}.tmp`, JSON.stringify(data, null, 2));
await fs.rename(`${path}.tmp`, path);
```

**Convencoes da stack:**

- Sem `any`
- JSONL append-only via `fs.appendFile` (ou stream com `flag: "a"`)
- Validar com Zod antes de escrever
- Erros de FS nao silenciam — propagam para o orchestrator decidir

## Criterios de Sucesso (Verificaveis)

- [x] Testes passam: `npm test --workspace=@looping-agent/orchestrator -- telemetry-writer`
- [x] Cobertura >= 85%
- [x] JSON gerado valida contra `TaskTelemetry` schema (asserts no teste)
- [x] JSONL auxiliar tem uma linha por notificacao (asserts no teste)
- [x] `finalize("halted")` escreve JSON com `status: "halted"` e `halt_reason`
- [x] Runtime sem tokens -> `tokens_unavailable: true` no JSON
