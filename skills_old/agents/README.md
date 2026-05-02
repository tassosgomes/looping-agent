# Copilot Flow — Otimizado

Fluxo de desenvolvimento autônomo com 3 agents + 9 skills, memória persistente entre execuções e telemetria de qualidade.

## O que mudou em relação ao fluxo anterior

### Antes (4 agents)

```
Orchestrator → Implementer → Tester → Review → Finalizer
```

### Depois (3 agents)

```
Orchestrator → Implementer → Reviewer → Finalizer
                              (build + test + review unificados)
```

**Ganhos principais:**

- Tester era mecânico (só rodava comandos); agora essa execução virou a skill `flow-quality-checks` usada pelo Reviewer
- Menos um roundtrip no caminho feliz
- Agents enxutos (~30 linhas cada) — toda a inteligência vive em skills versionadas
- Memória persistente entre execuções via `flow-workflow-memory`
- Verificação obrigatória via `flow-final-verify` previne claims prematuros de conclusão

## Estrutura de diretórios

```
agents/
├── copilot-orchestrator.agent.md
├── copilot-implementer.agent.md
├── copilot-reviewer.agent.md
└── copilot-finalizer.agent.md

skills/
├── workflow-memory/SKILL.md
├── workflow-memory-compaction/SKILL.md
├── final-verify/SKILL.md
├── task-implementation-flow/SKILL.md
├── stack-skills-selector/SKILL.md
├── run-quality-checks/SKILL.md
├── code-review-checklist/SKILL.md
├── quality-ledger-recorder/SKILL.md
└── git-flow-linear/SKILL.md
```

## Uso por agent

| Skill | Orchestrator | Implementer | Reviewer | Finalizer |
|-------|:---:|:---:|:---:|:---:|
| `flow-workflow-memory` | | ✅ | ✅ | |
| `flow-workflow-memory-compaction` | | ⚠️ on demand | ⚠️ on demand | |
| `flow-final-verify` | | ✅ | ✅ | |
| `flow-task-implementation` | | ✅ | | |
| `flow-stack-selector` | | ✅ | ✅ | |
| `flow-quality-checks` | | | ✅ | |
| `flow-code-review` | | | ✅ | |
| `flow-quality-ledger` | | | ✅ | |
| `flow-git-linear` | | | | ✅ |

## Fluxo por tarefa

```
Orchestrator lê tasks.md → identifica próxima tarefa pendente
│
├─→ Implementer
│   1. workflow-memory          → lê MEMORY.md e memory/[N]_task.md
│   2. task-implementation-flow → lê task/PRD/techspec/ADRs, detecta conflitos
│   3. stack-skills-selector    → identifica stack, carrega skills do catálogo
│   4. (implementa)             → seguindo skills carregadas
│   5. (atualiza memória)       → decisões, arquivos tocados, learnings
│   6. final-verify             → Verification Report com verdict PASS
│
├─→ Reviewer
│   1. workflow-memory          → lê memórias
│   2. run-quality-checks       → build + test + lint fresh
│   │   └─ FALHA                → REJEITADA: build_failure / test_failure
│   3. final-verify             → compara com Verification Report do implementer
│   4. code-review-checklist    → análise semântica vs PRD/TechSpec/task
│   │   └─ FALHA                → REJEITADA: review_issue
│   5. quality-ledger-recorder  → registra telemetria em quality-ledger.md
│   6. workflow-memory          → decide promoção para MEMORY.md (3 "sim")
│   7. (gera [N]_task_review.md)
│
└─→ Finalizer (só se APROVADA)
    1. (atualiza tasks.md com [x])
    2. git-flow-linear → commit + rebase + merge --ff-only
```

## Estrutura de arquivos no PRD

```
tasks/prd-[nome]/
├── prd.md
├── techspec.md
├── tasks.md
├── adrs/
│   └── *.md
├── MEMORY.md                    ← NOVO: memória compartilhada
├── memory/                      ← NOVO: memória por tarefa
│   ├── 1_task.md
│   ├── 2_task.md
│   └── ...
├── 1_task.md
├── 1_task_review.md
├── 2_task.md
└── ...

docs/ai-dev/
├── quality-ledger.md            ← telemetria (já existia)
└── prd-summaries/
    └── prd-[nome]-summary.md    ← gerado ao fim do PRD
```

## Decisões que informaram o design

### Por que fundir Tester + Review

Analisando o quality-ledger histórico: ~95% dos problemas foram detectados na fase "Revisão", ~0% na fase "Teste". O Tester só rodava comandos mecânicos (build, test, lint) — isso é trabalho de skill, não de agent. Ter um agent dedicado adicionava contexto e roundtrip sem valor real.

### Por que NÃO fundir Review + Finalize

Finalizer faz operações git irreversíveis (rebase, merge, delete branch). Manter separado é barreira de segurança — o Reviewer aprova, o Finalizer executa. Juntar aumentaria risco de commit prematuro em caso de alucinação do Reviewer.

### Por que dois níveis de memória

- **Memória da tarefa** (operacional, local): arquivos tocados, decisões de implementação, debug
- **Memória compartilhada** (durável, cross-task): constraints descobertas, decisões arquiteturais, riscos abertos

Separar evita poluição. Se tudo virasse `MEMORY.md`, ele cresceria até ser inútil. Se tudo virasse memória de tarefa, o contexto não sobreviveria entre execuções.

### Por que distinguir memória de quality-ledger

- **Quality-ledger** = telemetria de defeitos (pós-problema, histórico)
- **Memory** = contexto operacional (pré-decisão, forward-looking)

Um bug no ledger pode gerar uma decisão na memória (ex: "sempre adicionar constraint única para idempotência"), mas não são a mesma coisa. Duplicar quebra a distinção.

### Por que `flow-final-verify` é obrigatório em dois pontos

1. No Implementer, antes de declarar implementação pronta — previne "deve funcionar"
2. No Reviewer, comparando com o Verification Report do implementer — pega divergências (ex: implementer reportou PASS mas pipeline falha na revisão)

Isso detecta "alucinação de conclusão", que é origem comum de retrabalho segundo o ledger.

## Como aplicar no seu projeto

### 1. Copiar arquivos

- Agents vão para a pasta onde o Copilot lê agents (ex: `.github/copilot-agents/` ou similar — ajuste para sua config)
- Skills vão para `.copilot/skills/` ou onde o Copilot resolve skills no seu setup

### 2. Migrar fluxos existentes

O `copilot-orchestrator.agent.md` antigo fica compatível se você simplesmente:
- Troca `copilot-tester` por `copilot-reviewer` (que acumula ambos)
- Troca `copilot-review` por `copilot-reviewer` (mesmo nome, mas agora consolidado)

### 3. Criar estrutura de memória no primeiro PRD

Na primeira tarefa do primeiro PRD sob o novo fluxo, o Implementer vai criar `MEMORY.md` e `memory/[N]_task.md` automaticamente via skill `flow-workflow-memory`. Não precisa pré-criar.

### 4. Manter skills do catálogo existente

As skills de stack (`dotnet-*`, `java-*`, `react-*`, `git-commit`, `restful-api`, `roles-naming`) já existem no seu projeto. A skill `flow-stack-selector` referencia elas — não precisa recriar.

## Próximas otimizações possíveis (fora deste escopo)

- **Paralelização**: tarefas independentes (ex: frontend + backend desacoplados) poderiam rodar em paralelo. Hoje o fluxo é estritamente sequencial.
- **Cache de skills**: skills carregadas em tarefas consecutivas no mesmo stack poderiam ser mantidas em contexto entre tarefas do mesmo PRD.
- **Auto-split de tarefas grandes**: se a task spec é muito ampla, um agent dedicado poderia sugerir divisão antes de enviar pro Implementer.
- **Feedback loop do ledger**: análise automatizada do `prd-summaries/` para propor ajustes em skills do catálogo.
