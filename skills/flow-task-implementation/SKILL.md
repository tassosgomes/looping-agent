---
name: flow-task-implementation
description: Orienta a execução de uma tarefa de PRD — leitura ordenada de fontes, detecção de conflitos, construção de checklist de execução e captura de sinal pré-mudança. Use sempre que um implementer for iniciar uma tarefa nova. Não use para remediação de PR, tarefas sem spec formal, ou refatorações fora de PRD.
pipeline_stage: runtime
consumed_by: [implementer]
requires: ["tasks/prd-[slug]/[N]_task.md", "tasks/prd-[slug]/prd.md", "tasks/prd-[slug]/techspec.md"]
produces: []
---

# Task Implementation Flow

Define a rotina obrigatória de grounding antes de escrever qualquer código.

## Quando aplicar

Use esta skill no início de cada execução de tarefa, após carregar a skill `flow-workflow-memory` e antes de carregar a skill `flow-stack-selector`.

## Fluxo obrigatório

### 1. Leitura ordenada das fontes

Leia nesta ordem EXATA:

1. `{prd-dir}/[task]_task.md` — spec da tarefa
2. `{prd-dir}/prd.md` — contexto de produto
3. `{prd-dir}/techspec.md` — decisões técnicas e arquitetura
4. `{prd-dir}/adrs/*.md` — ADRs relevantes (se existirem)
5. `{prd-dir}/MEMORY.md` — memória compartilhada (já lida via `flow-workflow-memory`)
6. `{prd-dir}/memory/[task]_task.md` — memória da tarefa (já lida via `flow-workflow-memory`)
7. Commits recentes do repositório — para saber o que já foi feito

**Não pule etapas.** A ordem importa: o task spec define O QUÊ; PRD e techspec definem POR QUÊ e COMO; ADRs definem as restrições arquiteturais; memória traz contexto de execuções anteriores.

### 2. Detecção de conflitos

Após ler todas as fontes, **verifique conflitos** entre:

- Task spec vs. TechSpec
- Task spec vs. ADRs
- TechSpec vs. ADRs
- Memória compartilhada vs. qualquer fonte acima

**Se houver conflito:** PARE. Reporte o conflito ao orchestrator com:
- Fontes que conflitam
- Trecho literal de cada fonte
- Natureza do conflito (ex: "task exige X mas ADR-003 proíbe X")

NÃO prossiga para a implementação tentando adivinhar qual fonte prevalece. Conflitos não resolvidos são a maior fonte de retrabalho — veja registros recorrentes no quality-ledger.

### 3. Construção do checklist de execução

Extraia do task spec em um checklist numerado:

- Deliverables explícitos
- Critérios de aceitação
- Itens de `Validation`, `Test Plan` ou `Testing`
- Dependências explícitas de outras tarefas

Imprima o checklist completo ANTES de começar a implementar — ele deve ficar visível para rastreabilidade.

Use o checklist como gate: marque cada item como feito conforme evidência é produzida. NÃO avance para a fase de verificação final até que todos os itens tenham sido endereçados.

### 4. Captura do sinal pré-mudança

Antes de modificar código, capture o sinal concreto que prova que a tarefa ainda NÃO está completa. Exemplos:

- "Teste `UserPermissionsTest#shouldReturn403WhenScopeInvalid` falha com NPE"
- "Endpoint `GET /v1/users/{id}/permissions` retorna 500 quando user não existe"
- "Build quebra em `AuthzService` por símbolo `IdempotencyKey` não encontrado"

Se não conseguir reproduzir o sinal diretamente (ex: a tarefa é adicionar funcionalidade nova), capture o sinal mais próximo disponível (ex: "endpoint ainda não existe, `curl` retorna 404") e declare explicitamente a limitação.

### 5. Reconciliação do workspace

Antes de começar a editar:

- Rode `git status` — trabalho não commitado pode indicar execução anterior incompleta
- Rode `git log --oneline -n 10` — verifique se a tarefa já foi parcialmente implementada
- Consulte `memory/[task]_task.md` — se existir seção "Ready for Next Run", comece por ela

### 6. Escopo e disciplina

- Mantenha escopo estrito ao task spec
- Siga padrões do repositório e APIs reais das dependências
- Registre trabalho out-of-scope relevante como **follow-up notes** em `memory/[task]_task.md` em vez de expandir silenciosamente a tarefa
- Se durante a implementação você descobrir que o task spec está errado, PARE e reporte — não conserte silenciosamente

## Tratamento de erros

- Se alguma fonte obrigatória (task, PRD) estiver ausente, pare e reporte o caminho faltando antes de prosseguir
- Se o sinal pré-mudança não pode ser capturado mesmo em forma aproximada, registre essa limitação explícita no `memory/[task]_task.md`
- Se a leitura de alguma fonte revelar que a tarefa já foi implementada (ex: commits anteriores cobrem todos os deliverables), reporte ao orchestrator em vez de duplicar trabalho

## Checklist rápido

Antes de prosseguir para implementação, confirme:

- [ ] Li todas as 7 fontes na ordem
- [ ] Detectei e reportei conflitos (ou confirmei que não há)
- [ ] Imprimi o checklist de execução
- [ ] Capturei o sinal pré-mudança (ou declarei a limitação)
- [ ] Rodei `git status` e `git log -n 10`
- [ ] Confirmei que o escopo está claro
