---
name: flow-workflow-memory
description: Mantém memória do workflow entre execuções de tarefas do PRD — memória compartilhada (cross-task) e memória por tarefa. Use sempre que um agente (implementer ou reviewer) precisar ler, atualizar ou promover contexto durável entre execuções de tarefas. Não use para remediar PRs, preferências globais do usuário ou substituir o quality-ledger (que é telemetria de defeitos, não contexto operacional).
pipeline_stage: runtime
consumed_by: [implementer, reviewer]
requires: []
produces: ["tasks/prd-[slug]/MEMORY.md", "tasks/prd-[slug]/memory/[N]_task.md"]
---

# Workflow Memory

Mantém dois níveis de memória para sobreviver ao contexto limpo de cada execução.

## Estrutura de arquivos

```
{prd-dir}/
├── MEMORY.md                      ← compartilhada (cross-task)
└── memory/
    ├── 1_task.md                  ← por tarefa
    ├── 2_task.md
    └── ...
```

## Diferença crítica: memória vs. quality-ledger

| Aspecto | `MEMORY.md` / `memory/*` | `docs/ai-dev/quality-ledger.md` |
|---------|--------------------------|----------------------------------|
| Propósito | Contexto operacional pré-implementação | Telemetria de defeitos pós-revisão |
| Momento de uso | Lido ANTES de implementar | Lido para análise histórica |
| Conteúdo | Decisões, constraints, learnings | Problemas encontrados, categorias |
| Agente que escreve | Implementer, Reviewer | Reviewer (passo específico) |

Nunca duplique entradas do ledger na memória. Se um defeito foi registrado no ledger, a memória só deve registrar a **decisão ou constraint durável** que surgiu dele — não o defeito em si.

## Papéis dos arquivos

### Memória compartilhada — `{prd-dir}/MEMORY.md`

Contexto que sobrevive a múltiplas tarefas e execuções.

**Guarde:**
- Estado atual do workflow que afeta mais de uma tarefa
- Decisões técnicas ou de produto duráveis
- Learnings reutilizáveis que vão importar de novo
- Riscos abertos ou handoffs que afetam execução futura

**Evite:**
- Notas passo a passo
- Grandes trechos de código
- Fatos já explícitos em `prd.md`, `techspec.md`, `tasks.md` ou no próprio repositório

### Memória da tarefa — `{prd-dir}/memory/[task]_task.md`

Contexto específico da tarefa atual.

**Guarde:**
- Snapshot do objetivo atual
- Decisões importantes locais à tarefa
- Learnings e correções locais
- Arquivos ou superfícies tocadas
- Notas "ready for next run"

**Evite:**
- Resumos cross-task (vão para `MEMORY.md`)
- Repetição do task spec
- Transcrições longas de comandos

## Workflow de uso

### 1. Antes de editar código

- Leia `MEMORY.md` e `memory/[task]_task.md` se existirem
- Se não existirem, crie-os usando os templates abaixo
- Trate essas memórias como contexto mandatório, não notas opcionais

### 2. Durante a execução

Atualize `memory/[task]_task.md` quando:
- O objetivo muda
- Uma decisão não óbvia é tomada
- Um learning importante aparece
- Um erro muda o plano

### 3. Antes de encerrar

- Atualize a memória antes de qualquer claim de conclusão, handoff ou commit
- Registre apenas fatos que ajudem a próxima execução a começar mais rápido e com menos erros
- Aplique o **Promotion Decision Test** antes de promover algo para `MEMORY.md`

## Promotion Decision Test

Antes de promover um item de `memory/[task]_task.md` para `MEMORY.md`, responda:

1. Outra tarefa precisaria dessa informação para evitar um erro ou redescoberta?
2. Esse fato é durável em múltiplas execuções, não só na atual?
3. Essa informação NÃO é óbvia a partir de PRD, techspec, task files ou do repositório em si?

Todos os três devem ser "sim" para promover. Se qualquer um for "não", o item fica em memória de tarefa.

### Exemplos que vão para memória compartilhada

- Constraint descoberta que afeta múltiplas tarefas (ex: "API externa limita a 100 req/s; operações batch precisam respeitar isso")
- Decisão arquitetural cross-cutting tomada durante implementação (ex: "escolhido Outbox Pattern para publicação de eventos ao invés de @Async direto")
- Risco aberto que tarefas futuras precisam considerar (ex: "migração depende do schema v3 ainda não deployado em staging")

### Exemplos que ficam em memória de tarefa

- Arquivos tocados durante a implementação desta tarefa
- Passos de debug para resolver um erro específico da tarefa
- Snapshot do objetivo e critérios de aceitação da tarefa atual
- Workaround aplicado apenas no escopo desta tarefa

## Regras críticas

- NÃO invente histórico, decisões ou status que não aconteceram
- NÃO copie grandes blocos de código, stack traces ou task specs para arquivos de memória
- NÃO duplique fatos que são óbvios a partir do repositório, git diff, task file ou documentos do PRD
- NÃO leia arquivos de memória de outras tarefas exceto se `MEMORY.md` ou o caller explicitamente apontar
- Mantenha `MEMORY.md` durável e cross-task. Mantenha memória de tarefa local e operacional.

## Templates

### Template `MEMORY.md`

```markdown
# Workflow Memory — [Nome do PRD]

## Estado Atual
<!-- Estado do workflow que afeta múltiplas tarefas -->

## Decisões Compartilhadas
<!-- Decisões técnicas/produto duráveis cross-task -->

## Learnings Compartilhados
<!-- Aprendizados reutilizáveis -->

## Riscos Abertos
<!-- Riscos que tarefas futuras precisam considerar -->

## Handoffs
<!-- Notas para a próxima tarefa ou próxima execução -->
```

### Template `memory/[task]_task.md`

```markdown
# Task [N] Memory

## Snapshot do Objetivo
<!-- 1-3 linhas: o que esta tarefa precisa entregar -->

## Decisões Importantes
<!-- Decisões não óbvias tomadas durante a execução -->

## Learnings
<!-- Aprendizados locais à tarefa -->

## Arquivos / Superfícies
<!-- Arquivos e componentes tocados -->

## Erros / Correções
<!-- Erros encontrados e como foram corrigidos -->

## Ready for Next Run
<!-- Notas para quem pegar essa tarefa de novo ou uma relacionada -->
```

## Tratamento de erros

- Se qualquer caminho de memória informado pelo caller estiver inexistente e não puder ser criado, pare e reporte a inconsistência em vez de adivinhar outro caminho
- Se o conteúdo da memória conflita com o repositório ou task spec, confie no repositório e nos documentos da tarefa, depois corrija o arquivo de memória
- Se compactação for necessária (arquivo grande/ruidoso), carregue a skill `flow-workflow-memory-compaction`
