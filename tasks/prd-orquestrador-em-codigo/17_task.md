---
status: completed
parallelizable: true
blocked_by: [15.0]
---

<task_context>
<domain>docs</domain>
<type>documentation</type>
<scope>configuration</scope>
<complexity>low</complexity>
<dependencies>none</dependencies>
<unblocks>"18.0"</unblocks>
</task_context>

# Tarefa 17.0: Documentacao

## Relacionada as User Stories

- US: usar skills de planejamento via agente preferido (suporte — docs do produto)
- US: abrir telemetria por execucao (suporte — explicar formato)

## Visao Geral

Criar a documentacao do produto: `README.md` na raiz com quickstart, e arquivos
especializados em `docs/` cobrindo uso do CLI, customizacao de skills, arquitetura e
troubleshooting. Sem reescrever a TechSpec — apenas resumos para devs externos.

## Requisitos

- README com quickstart de 5 passos (install, setup, criar PRD via skills, run, ver telemetria)
- `cli-usage.md` com exemplos de cada comando (`setup`, `update`, `run`, `doctor`)
- `skills-customization.md` explica `.bak` e como customizar uma skill preservando o
  ponto de extensao (ADR-004)
- `architecture.md` resume a TechSpec (diagrama + decisoes principais) para devs externos
- `troubleshooting.md` casos comuns (runtime nao detectado, MCP server falha,
  completion_tool ausente — citado em RF-04 e ADR-005)

## Arquivos Envolvidos

- **Criar:**
  - `README.md` (raiz)
  - `docs/cli-usage.md`
  - `docs/skills-customization.md`
  - `docs/architecture.md`
  - `docs/troubleshooting.md`
- **Modificar:** —
- **Referencia:**
  - `tasks/prd-orquestrador-em-codigo/prd.md`
  - `tasks/prd-orquestrador-em-codigo/techspec.md`
  - `tasks/prd-orquestrador-em-codigo/adrs/*.md`
- **Skills para consultar durante implementacao:** —

## Subtarefas

- [x] 17.1 `README.md`: quickstart, requisitos (Node >= 20, runtime ACP), instalacao via npm, link para `docs/`
- [x] 17.2 `cli-usage.md`: exemplos de cada comando + flags + exit codes
- [x] 17.3 `skills-customization.md`: workflow de customizacao, semantica do `.bak`, recomendacao de versionar customizacoes em git
- [x] 17.4 `architecture.md`: diagrama de componentes (do TechSpec), fluxo de uma task, ADRs principais
- [x] 17.5 `troubleshooting.md`: 5 casos minimos:
  - Runtime ACP nao detectado
  - Setup falhou no smoke test do MCP
  - Halt por retries esgotados — onde olhar (telemetria)
  - Halt por `committed: false` — interpretacao
  - Halt por contrato violado (completion_tool ausente)
- [x] 17.6 Validar links internos com `markdown-link-check` (ou similar) — opcional

## Sequenciamento

- Bloqueado por: 15.0 (precisa do CLI estavel para dar exemplos reais)
- Desbloqueia: 18.0
- Paralelizavel: Sim (paralelo a 16.0)

## Rastreabilidade

- (Cobertura indireta de UX descrita no PRD secao "Experiencia do Usuario")
- Evidencia esperada: 5 arquivos criados, com conteudo nao trivial (>= 30 linhas cada para os 4 docs especializados; >= 80 linhas no README).

## Detalhes de Implementacao

**Esqueleto do README.md:**

```markdown
# Looping Agent

SDD instalavel + orquestrador determinístico do loop Implementer/Reviewer/Finalizer
sobre ACP. Empacota 19 skills `flow-*` com prefixo de planejamento + execucao.

## Requisitos

- Node.js >= 20
- Um runtime ACP instalado (Claude Code, Codex CLI, Copilot CLI)

## Quickstart

1. `npm install -g @looping-agent/cli`
2. `cd /seu/projeto && looping-agent setup`
3. Use skills `flow-prd-creator`, `flow-techspec-creator`, `flow-task-creator` no agente preferido para gerar `tasks/prd-<slug>/{prd,techspec,tasks}.md`
4. `looping-agent run --prd-dir tasks/prd-<slug>`
5. Veja telemetria em `tasks/prd-<slug>/telemetry/`

## Documentacao

- [CLI usage](docs/cli-usage.md)
- [Skills customization](docs/skills-customization.md)
- [Architecture](docs/architecture.md)
- [Troubleshooting](docs/troubleshooting.md)
```

**Convencoes:**

- Markdown CommonMark
- Sem emojis a menos que explicitamente solicitado pelo usuario (regra do produto)
- Diagrama em ASCII (reutilizar do TechSpec)

## Criterios de Sucesso (Verificaveis)

- [x] 5 arquivos existem nos paths declarados
- [x] README inclui requisitos, quickstart e link para `docs/`
- [x] `cli-usage.md` lista os 4 comandos com pelo menos 1 exemplo cada
- [x] `troubleshooting.md` tem pelo menos 5 cenarios documentados
- [ ] Lint markdown opcional (`npx markdownlint-cli2 docs/**/*.md`) sem erros estruturais
  - Observacao: os docs criados nesta tarefa passaram em lint dedicado; o lint amplo
    de `docs/**/*.md` continua falhando por problemas preexistentes em `docs/conversa.md`.
