---
status: completed
parallelizable: true
blocked_by: [2.0]
---

<task_context>
<domain>engine/orchestrator</domain>
<type>implementation</type>
<scope>core_feature</scope>
<complexity>low</complexity>
<dependencies>none</dependencies>
<unblocks>"11.0"</unblocks>
</task_context>

# Tarefa 5.0: Orchestrator — TasksReader (parser de `tasks.md`)

## Relacionada as User Stories

- US: invocar orquestrador via CLI sobre PRD (suporte — descobrir proxima task pendente)

## Visao Geral

Implementar parser do `tasks.md` produzido por `flow-task-creator`. Identifica a lista
"## Tarefas" com checkboxes (`- [ ]` pendente, `- [x]` concluido, `- [~]` em progresso) e
expoe API para consultar a proxima task pendente, marcar progressao e listar todas.
Logica pura, sem I/O de processo (apenas FS read).

## Requisitos

- Parser tolerante a variacoes de espaco e de ordem
- Identifica numero da task no formato `X.0` (e ignora subtarefas `X.Y`)
- Resolve caminho do arquivo individual `[N]_task.md` no mesmo diretorio
- API: `getNextPending()`, `getTaskFile(n)`, `listAll()` — sem mutacao (Finalizer atualiza
  via skill `flow-finalizer`, nao por este parser)
- 100% logica pura, alta cobertura

## Arquivos Envolvidos

- **Criar:**
  - `packages/orchestrator/src/tasks-reader.ts`
  - `packages/orchestrator/src/tasks-reader-types.ts` (`TaskEntry`, `TaskStatus`)
  - `packages/orchestrator/test/tasks-reader.test.ts`
  - `packages/orchestrator/test/fixtures/sample-tasks.md` (fixture realista para parsing)
- **Modificar:** —
- **Referencia:**
  - `tasks/prd-orquestrador-em-codigo/tasks.md` (formato real produzido por `flow-task-creator`)
  - `skills/flow-task-creator/templates/tasks-template.md`
- **Skills para consultar durante implementacao:**
  - `flow-task-creator` — formato canonico de `tasks.md`

## Subtarefas

- [x] 5.1 Tipos `TaskEntry { number: number; title: string; status: TaskStatus; filePath: string }`
- [x] 5.2 Implementar parser regex para linhas `- [ ] X.0 Titulo`, `- [x]`, `- [~]`
- [x] 5.3 Resolver `filePath` para `<dir>/<N>_task.md`
- [x] 5.4 API `getNextPending()` retorna primeira `[ ]` na ordem do arquivo (ou `null`)
- [x] 5.5 API `getTaskFile(n)` le o arquivo individual e retorna conteudo cru (string)
- [x] 5.6 Testes com fixture: 5 tasks com mix de `[ ]`, `[x]`, `[~]` (em progresso conta como pendente para fins de retomada? — decidir e documentar; sugestao: `[~]` = pendente)
- [x] 5.7 Testes de erro: arquivo inexistente, lista de tarefas ausente

## Sequenciamento

- Bloqueado por: 2.0 (apenas consome tipos basicos; pode iniciar logo apos 1.0+2.0)
- Desbloqueia: 11.0
- Paralelizavel: Sim

## Rastreabilidade

- Esta tarefa cobre: RF-03 criterio "task ja concluida e pulada"
- Evidencia esperada: parser identifica corretamente proxima pendente em fixture com mix de status; teste de retomada (rodar 2x) passa.

## Detalhes de Implementacao

**Tipos:**

```typescript
// packages/orchestrator/src/tasks-reader-types.ts
export type TaskStatus = "pending" | "in_progress" | "completed";

export interface TaskEntry {
  number: number;          // ex: 3 (de "3.0")
  title: string;           // ex: "Package mcp-server..."
  status: TaskStatus;
  filePath: string;        // path absoluto para [3]_task.md
}
```

**Regex sugerida:**

```
^- \[( |x|~)\] (\d+)\.0 (.+)$
```

`[ ]` -> pending, `[x]` -> completed, `[~]` -> in_progress (tratado como pending para
retomada).

**Convencoes da stack:**

- Sem `any` — `TaskEntry` totalmente tipado
- I/O atomico (read async via `fs/promises`)
- Erros sao `Error` com codigo + path no `cause` para debugging

## Criterios de Sucesso (Verificaveis)

- [x] Testes passam: `npm test --workspace=@looping-agent/orchestrator -- tasks-reader`
- [x] Build compila
- [x] Cobertura >= 90% no arquivo
- [x] Fixture com tasks 1.0 `[x]`, 2.0 `[ ]`, 3.0 `[ ]`: `getNextPending()` retorna 2.0
- [x] Fixture sem secao "## Tarefas": throw com mensagem clara
- [x] `getTaskFile(99)` (inexistente) throw com path absoluto na mensagem
