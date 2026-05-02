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
<unblocks>"11.0"</unblocks>
</task_context>

# Tarefa 6.0: Orchestrator — MemoryManager (instancia `flow-workflow-memory`)

## Relacionada as User Stories

- US: task N+1 herda decisoes da task N

## Visao Geral

Implementar o gerenciador de memoria que cria e mantem a estrutura definida pela skill
`flow-workflow-memory`: arquivo `MEMORY.md` compartilhado (cross-task) e
`memory/[N]_task.md` por task. O orquestrador apenas instancia a estrutura inicial e
fornece os caminhos no input do agente — quem escreve a memoria e o agente, via skill.

## Requisitos

- Cria `MEMORY.md` (vazio com cabecalho minimo) e `memory/` se nao existirem
- Cria `memory/[N]_task.md` lazy (no inicio da task N)
- NAO sobrescreve memoria existente (idempotente)
- Detecta tamanho excedido conforme limite definido pela skill (passo de sinalizacao para
  compactacao via `flow-workflow-memory-compaction` — RF-07 criterio)
- Caminhos absolutos sao retornados para serem injetados no prompt da fase

## Arquivos Envolvidos

- **Criar:**
  - `packages/orchestrator/src/memory-manager.ts`
  - `packages/orchestrator/src/memory-types.ts` (`MemoryPaths`, `MemorySizeStatus`)
  - `packages/orchestrator/test/memory-manager.test.ts`
- **Modificar:** —
- **Referencia:**
  - `skills/flow-workflow-memory/SKILL.md` (estrutura e regras de promocao/compactacao)
  - `skills/flow-workflow-memory-compaction/SKILL.md`
  - `tasks/prd-orquestrador-em-codigo/prd.md` RF-07
- **Skills para consultar durante implementacao:**
  - `flow-workflow-memory` — formato exato dos arquivos e regras de tamanho

## Subtarefas

- [x] 6.1 Tipos `MemoryPaths { sharedPath: string; taskPath: string }`, `MemorySizeStatus` (`{ withinLimit: boolean; sizeBytes: number; thresholdBytes: number }`)
- [x] 6.2 `initialize(prdDir)` cria `MEMORY.md` e `memory/` se ausentes (preserva conteudo)
- [x] 6.3 `pathsForTask(prdDir, n)` retorna `{ sharedPath, taskPath }` e cria `memory/[N]_task.md` se ausente
- [x] 6.4 `checkSize(path)` retorna status com flag de exceder limite (constante baseada na skill — documentar valor padrao)
- [x] 6.5 Testes: idempotencia (chamar `initialize` 2x preserva conteudo)
- [x] 6.6 Testes: `pathsForTask` cria arquivo na primeira chamada e nao sobrescreve em chamadas subsequentes
- [x] 6.7 Teste de tamanho: arquivo > limite -> `withinLimit: false`

## Sequenciamento

- Bloqueado por: 2.0
- Desbloqueia: 11.0
- Paralelizavel: Sim

## Rastreabilidade

- Esta tarefa cobre: RF-07 (estrutura de memoria + sinalizacao de compactacao)
- Evidencia esperada: testes em diretorio temporario mostram criacao idempotente; checagem de tamanho dispara flag corretamente.

## Detalhes de Implementacao

**Estrutura criada:**

```
tasks/prd-<slug>/
├── MEMORY.md            # cross-task, gerenciado pelos agentes via flow-workflow-memory
└── memory/
    ├── 1_task.md        # criado quando task 1 inicia
    ├── 2_task.md
    └── ...
```

**Cabecalho minimo do `MEMORY.md` (criado pelo orquestrador na primeira vez):**

```markdown
# Workflow Memory

Memoria compartilhada do workflow. Atualizada pelos agentes via skill `flow-workflow-memory`.
```

**Limite de tamanho:** consultar `flow-workflow-memory/SKILL.md` para valor canonico.
Se nao houver, default sugerido: 50KB (documentar e tornar configuravel via constante
exportada).

**Convencoes da stack:**

- Sem `any` — `MemoryPaths` totalmente tipado
- Operacoes idempotentes via `fs.access` antes de `fs.writeFile`
- Erros: throw com path absoluto + razao

## Criterios de Sucesso (Verificaveis)

- [x] Testes passam: `npm test --workspace=@looping-agent/orchestrator -- memory-manager`
- [x] Build compila
- [x] `initialize()` chamado 2x em diretorio com conteudo nao sobrescreve `MEMORY.md`
- [x] `pathsForTask(dir, 3)` cria `memory/3_task.md` se ausente; preserva se existente
- [x] `checkSize` retorna `withinLimit: false` quando arquivo > threshold (testar com fixture > 50KB)
