# Looping Agent — SDD Instalável com Orquestrador em Código

> Este PRD substitui a versão inicial focada apenas no orquestrador. A nova versão expande o
> escopo para um produto autocontido inspirado no compozy: um SDD (Spec-Driven Development)
> "instalável" em qualquer projeto, com duas fases — planejamento humano e looping
> automatizado.

## Visão Geral

Hoje o pipeline de desenvolvimento assistido por IA em um projeto típico depende de:

- Skills/prompts dispersos, instalados manualmente em cada agente (Claude Code, Codex, etc.).
- Um agente orquestrador (`copilot-orchestrator.agent.md`) que coordena o loop
  Implementer → Reviewer → Finalizer, mas sofre de **alto custo de tokens em decisões
  triviais**, **falta de determinismo** e **telemetria não confiável** (o LLM "esquece" de
  registrar contadores).
- Falta de uma forma simples de "embutir" todo o ciclo de SDD em um projeto novo.

Esta funcionalidade entrega o **Looping Agent**: uma ferramenta com modelo de duas fases.

**Fase A — Planejamento (humano essencial)**: o produto empacota e instala em um projeto as
**skills de planejamento** com prefixo `flow-*` (Vision → Domain → PRD → API Contract →
TechSpec → Frontend TechSpec → Tasks), de modo que o time possa ir de uma ideia até um
`tasks.md` consumível por máquina. Esta fase é interativa e orientada por um humano.

**Fase B — Looping (automatizado)**: um orquestrador em código (CLI local) lê o `tasks.md`
gerado na Fase A e roda o loop Implementer → Reviewer → Finalizer de forma determinística.
**Toda a inteligência do loop vive como skills** com prefixo `flow-*`: 3 skills de fase
(`flow-implementer`, `flow-reviewer`, `flow-finalizer`) que estabelecem persona, ordem de
execução e contrato de saída de cada fase, e 9 skills de disciplina (memória, grounding,
seleção de stack, verificação, qualidade, telemetria, git linear) carregadas pelas skills de
fase. Não há agents-markdown separados — formato único elimina a necessidade de adapters por
runtime (Claude Code, Codex, Copilot CLI, Cursor, Droid). A comunicação com cada fase usa o
**ACP (Agent Client Protocol)** — JSON-RPC sobre stdio. O outcome de domínio (build_passed,
approved, committed, etc.) é reportado via tool_call padronizado. Telemetria exata e memória
cross-task via `flow-workflow-memory`.

**Para quem**: desenvolvedores que querem instalar um SDD pronto em um projeto local e operar
o ciclo completo (planejar com humano + executar em loop sem babá) sem montar a infraestrutura
do zero. Persona única no MVP.

**Por que é valioso**:
- Reduz o custo de tokens em loops longos (decisões binárias triviais saem do LLM).
- Torna o pipeline auditável e reproduzível (telemetria estruturada, fluxo determinístico).
- Empacota o SDD inteiro como produto instalável, eliminando o setup manual repetido.
- Mantém o humano no comando da fase de planejamento (onde o julgamento é insubstituível) e
  libera o LLM para o trabalho cognitivo na fase de execução.

---

## Objetivos

- Substituir o `copilot-orchestrator.agent.md` por um executável em código que coordene o
  loop com decisões binárias determinísticas.
- Reduzir o custo de tokens por task em relação ao baseline atual (orquestrador-agente).
- Garantir reprodutibilidade do fluxo de execução: mesmo input produz a mesma sequência de
  chamadas a sub-agentes.
- Persistir telemetria completa por task em 100% das execuções.
- Empacotar o SDD completo (**19 skills `flow-*`** + orquestrador em código) em uma
  ferramenta instalável, análoga ao `compozy setup`, com suporte a Claude Code e Codex/GitHub
  Copilot CLI no MVP. Sem agents-markdown — formato único de skill elimina adapters por
  runtime.
- Adotar **ACP (Agent Client Protocol)** como transporte único entre orquestrador e
  sub-agentes, garantindo interoperabilidade com o ecossistema crescente de runtimes
  ACP-capable e evitando parsing customizado de stdout.
- Dissolver os agentes Implementer, Reviewer e Finalizer em **skills de fase**
  (`flow-implementer`, `flow-reviewer`, `flow-finalizer`) — markdowns editáveis com
  frontmatter canônico, formato uniforme em todos os runtimes ACP, contrato de saída via
  tool_call (`report_*`).
- Integrar a skill `flow-workflow-memory` para que decisões, convenções e pegadinhas
  estabelecidas em uma task sejam consumíveis por tasks subsequentes.

---

## Histórias de Usuário

- Como **Desenvolvedor**, eu quero rodar um único comando (`looping-agent setup` ou similar)
  em um projeto vazio para que ele instale automaticamente as skills de planejamento e o
  orquestrador, sem que eu precise copiar arquivos manualmente.
- Como **Desenvolvedor**, eu quero que o instalador detecte quais agentes (Claude Code,
  Codex/Copilot) estão presentes na minha máquina e instale as skills no formato esperado por
  cada um.
- Como **Desenvolvedor**, eu quero usar as skills de planejamento (PRD → TechSpec → Tasks)
  via meu agente preferido após o setup, sem instalá-las uma a uma.
- Como **Desenvolvedor**, eu quero invocar o orquestrador via CLI passando o diretório do PRD
  para que ele execute todas as tasks pendentes em sequência sem que eu precise babá-lo.
- Como **Desenvolvedor**, eu quero ver no terminal o status de cada task em tempo real (qual
  agente, qual tentativa, tempo decorrido) para acompanhar o progresso.
- Como **Desenvolvedor**, eu quero que o pipeline pause imediatamente quando uma task esgotar
  retries para investigar antes que tasks dependentes sejam afetadas.
- Como **Desenvolvedor**, eu quero abrir um arquivo de telemetria por execução e ver
  iterações, tokens consumidos por agente e issues do reviewer para diagnosticar e medir
  tendências.
- Como **Desenvolvedor**, eu quero que a task N+1 herde decisões técnicas, convenções e
  pegadinhas estabelecidas pelas tasks 1..N para que o Implementer não reinvente padrões
  nem caia nos mesmos erros.
- Como **Tech Lead**, eu quero comparar o custo de tokens do pipeline antes e depois da
  migração para validar que o investimento se pagou.

---

## Funcionalidades Principais

### RF-01: Setup/Instalação do SDD em um Projeto

**Descrição**: Comando único do CLI que prepara um projeto local para usar o Looping Agent:
detecta quais agentes suportados estão instalados na máquina (Claude Code, Codex/Copilot CLI),
copia/instala as skills de planejamento e os artefatos necessários no formato esperado por
cada agente, e cria a estrutura de diretórios padrão para artefatos de workflow.

**Critérios de Aceitação**:

- **Given** uma máquina com Claude Code instalado (`~/.claude/skills/` existe)
  **When** o desenvolvedor executa o comando de setup no diretório do projeto
  **Then** as skills de planejamento são instaladas em `~/.claude/skills/` (ou no escopo
  do projeto, conforme convenção definida) e o comando reporta sucesso indicando os caminhos
  alterados.

- **Given** uma máquina com Codex/Copilot CLI instalado
  **When** o desenvolvedor executa o setup
  **Then** as skills são instaladas no diretório padrão do Codex/Copilot, no formato esperado
  por esse agente.

- **Given** uma máquina sem nenhum agente suportado detectado
  **When** o desenvolvedor executa o setup
  **Then** o comando aborta com mensagem clara listando os agentes suportados e onde eles
  deveriam estar instalados.

- **Given** um projeto que já recebeu o setup uma vez
  **When** o desenvolvedor executa o setup novamente
  **Then** o comando é idempotente: detecta o estado atual, reporta o que já estava no lugar,
  e atualiza somente o que mudou (sem duplicar nem corromper).

**Prioridade**: Must Have

---

### RF-02: Empacotamento das 19 Skills do Looping Agent

**Descrição**: O produto empacota e versiona **19 skills com prefixo `flow-*`** (idioma
PT-BR, frontmatter canônico, formato Markdown único). Todas são instaladas pelo RF-01 no
agente do desenvolvedor. **Não há agents-markdown separados** — o formato único de skill é
suportado por todos os runtimes ACP-capable, eliminando a necessidade de adapters por
runtime (Claude Code, Codex, Copilot, Cursor, Droid).

As skills se dividem em três categorias:

- **Planejamento (7)** — executadas interativamente pelo dev na Fase A
- **Fases do loop (3)** — invocadas pelo orquestrador em sessões ACP na Fase B; cada uma
  estabelece persona, carrega skills de disciplina e termina invocando um tool_call de
  conclusão (`report_*`)
- **Disciplinas de runtime (9)** — carregadas pelas skills de fase para padronizar memória,
  grounding, verificação, qualidade, telemetria e operações git

**Inventário empacotado (MVP)**:

| Categoria | Skill | Papel | `pipeline_stage` |
|---|---|---|---|
| Planejamento | `flow-vision-creator` | Vision Doc (Nível 0) | `vision` |
| Planejamento | `flow-domain-creator` | Domain Doc (Nível 1) | `domain` |
| Planejamento | `flow-prd-creator` | PRD | `prd` |
| Planejamento | `flow-contract-creator` | API Contract OpenAPI 3.1 | `contract` |
| Planejamento | `flow-techspec-creator` | TechSpec backend | `techspec` |
| Planejamento | `flow-frontend-techspec-creator` | TechSpec frontend | `techspec` |
| Planejamento | `flow-task-creator` | `tasks.md` + `[N]_task.md` | `tasks` |
| Fase do loop | `flow-implementer` | Persona + workflow do Implementer | `implementer` |
| Fase do loop | `flow-reviewer` | Persona + workflow do Reviewer | `reviewer` |
| Fase do loop | `flow-finalizer` | Persona + workflow do Finalizer | `finalizer` |
| Disciplina | `flow-workflow-memory` | Memória shared + per-task | `runtime` |
| Disciplina | `flow-workflow-memory-compaction` | Compactação on demand | `runtime` |
| Disciplina | `flow-task-implementation` | Grounding + checklist + sinal pré-mudança | `runtime` |
| Disciplina | `flow-stack-selector` | Seleção de skills do stack | `runtime` |
| Disciplina | `flow-final-verify` | Evidência fresca de verificação | `runtime` |
| Disciplina | `flow-quality-checks` | Pipeline build/test/lint | `runtime` |
| Disciplina | `flow-code-review` | Análise semântica vs PRD/TechSpec | `runtime` |
| Disciplina | `flow-quality-ledger` | Telemetria estruturada | `runtime` |
| Disciplina | `flow-git-linear` | Commit + rebase + ff-only | `runtime` |

> O orquestrador é **código**, não skill (RF-03). Não há agent-markdown nesse inventário.

**Frontmatter canônico** (campos obrigatórios + 2 específicos para skills de fase):

```yaml
name: flow-<nome>
description: <PT-BR com gatilhos para detecção pelo runtime>
pipeline_stage: <vision|domain|prd|contract|techspec|tasks|implementer|reviewer|finalizer|runtime>
consumed_by: [planning|orchestrator|implementer|reviewer|finalizer]
requires: [<arquivos/sinais pré-requisito>]
produces: [<artefatos gerados>]

# Apenas para skills de fase (flow-implementer/-reviewer/-finalizer):
loads_skills: [<lista de flow-* de disciplina carregadas pela fase>]
completion_tool: <report_implementer_result | report_review_result | report_finalizer_result>
```

**Como o orquestrador invoca uma fase**:

```
session/prompt:
  "Aplique a skill `flow-implementer` à task abaixo.
   --prd-dir=tasks/prd-X --task=3
   Conclua invocando o tool report_implementer_result conforme contrato."

  <conteúdo de [N]_task.md>
```

A skill de fase carrega suas `loads_skills` na ordem definida e termina com `completion_tool`.

**Critérios de Aceitação**:

- **Given** um projeto recém-configurado pelo RF-01
  **When** o desenvolvedor invoca qualquer skill de planejamento (`flow-vision-creator`,
  `flow-prd-creator`, `flow-techspec-creator`, etc.) pelo agente instalado
  **Then** a skill executa o fluxo interativo e produz o artefato no caminho declarado em
  `produces:` (ex: `tasks/prd-<slug>/prd.md`).

- **Given** uma TechSpec aprovada
  **When** o desenvolvedor invoca `flow-task-creator`
  **Then** produz `tasks.md` com tasks atômicas e ordenadas, prontas para serem consumidas
  pelo orquestrador (RF-03..06).

- **Given** uma task em execução pelo orquestrador
  **When** o orquestrador abre uma sessão ACP da fase de implementação e envia
  `session/prompt` instruindo a aplicação de `flow-implementer`
  **Then** o agent ACP carrega a skill, executa as `loads_skills` na ordem, implementa a
  task e invoca `report_implementer_result` antes de encerrar — sem necessidade de
  adapter específico do runtime.

- **Given** uma sessão ACP em uma fase do loop
  **When** a skill de fase encerra
  **Then** o orquestrador captura o `tool_call` declarado em `completion_tool` do
  frontmatter e usa seu input para a decisão de retry/avanço/halt (RF-04, RF-05).

- **Given** uma nova versão do Looping Agent disponível
  **When** o desenvolvedor executa o comando de atualização
  **Then** as 19 skills empacotadas são atualizadas no agente alvo, preservando
  customizações do usuário quando documentadas (mecanismo exato fica para a TechSpec).

**Prioridade**: Must Have

---

### RF-03: Loop de Execução Determinístico de Tasks via ACP

**Descrição**: O orquestrador lê o arquivo `tasks.md` do diretório do PRD, identifica as
tasks pendentes em ordem, e executa cada uma seguindo o fluxo Implementer → Reviewer →
Finalizer. Cada sub-agente é invocado como um **agente ACP** (Agent Client Protocol —
JSON-RPC sobre stdio) usando o runtime configurado pelo dev (`claude-agent-acp`,
`codex-acp`, `copilot --acp`). As decisões de fluxo (avançar fase, retentar, abortar) são
determinísticas e baseadas no `stopReason` ACP combinado com o `tool_call` de conclusão
descrito no RF-05.

**Critérios de Aceitação**:

- **Given** um diretório de PRD com `tasks.md` contendo 3 tasks pendentes
  **When** o desenvolvedor invoca o orquestrador apontando para esse diretório
  **Then** o orquestrador executa as 3 tasks em sequência, na ordem do arquivo, sem
  interação manual entre elas, abrindo uma sessão ACP por invocação de sub-agente.

- **Given** o runtime ACP configurado não está instalado/disponível na máquina
  **When** o orquestrador tenta invocar a primeira task
  **Then** aborta com mensagem clara indicando o runtime esperado, o caminho onde foi
  procurado, e instruções para instalá-lo.

- **Given** uma task que já foi marcada como concluída em execuções anteriores
  **When** o orquestrador é executado de novo no mesmo diretório
  **Then** essa task é pulada e o orquestrador prossegue para a próxima pendente.

- **Given** uma sessão ACP em execução
  **When** o agente envia notificações `session/update` (plan, agent_message_chunk,
  tool_call, tool_call_update)
  **Then** o orquestrador renderiza o progresso em tempo real no terminal sem precisar
  esperar a resposta final.

**Prioridade**: Must Have

---

### RF-04: Política de Retry com Halt-on-Failure (Mapeada ao stopReason ACP)

**Descrição**: Cada fase (Implementer e Reviewer) tem um limite máximo de tentativas. O
orquestrador decide retry/avanço/halt combinando o `stopReason` da resposta ACP com o
outcome do `tool_call` de conclusão (RF-05). Se o limite for atingido sem sucesso, o
orquestrador **pausa o pipeline inteiro** e aguarda intervenção humana.

**Critérios de Aceitação**:

- **Given** uma task em que o Implementer falhou 3 vezes consecutivas (build/tests não
  passam, reportado via `report_implementer_result`) com o limite configurado em 3
  **When** o orquestrador detecta que o limite foi atingido
  **Then** marca a task como falha-bloqueante, persiste o último resultado completo
  (notificações ACP + tool_call de conclusão) e pausa o pipeline.

- **Given** uma task em que o Reviewer reprovou com `requires_rework: true` no
  `report_review_result`
  **When** o orquestrador recebe o resultado e a tentativa atual é < limite
  **Then** invoca o Implementer novamente em uma nova sessão ACP, passando as `issues[]`
  do review como conteúdo adicional do `session/prompt`; a tentativa é incrementada.

- **Given** uma sessão ACP que terminou com `stopReason: refusal` ou `max_tokens` ou
  `max_turn_requests`
  **When** o orquestrador recebe a resposta final
  **Then** trata como falha da fase (conta como tentativa) e dispara retry conforme a
  política, registrando o `stopReason` na telemetria.

- **Given** uma sessão ACP que terminou com `stopReason: end_turn` mas SEM um tool_call de
  conclusão correspondente (ex: `report_implementer_result` ausente)
  **When** o orquestrador finaliza a fase
  **Then** trata como falha da fase (contrato violado), conta como tentativa e dispara
  retry com instrução para o agente invocar o tool de conclusão antes de encerrar.

- **Given** uma task em que o Finalizer reportou `committed: false` via
  `report_finalizer_result`
  **When** o orquestrador recebe o resultado
  **Then** pausa o pipeline imediatamente (commit é considerado intervenção humana
  obrigatória), independente do número de tentativas.

**Prioridade**: Must Have

---

### RF-05: Contrato ACP com tool_call de Conclusão (`report_completion`)

**Descrição**: As 3 skills de fase (`flow-implementer`, `flow-reviewer`, `flow-finalizer`)
declaram no frontmatter qual `completion_tool` invocar e a sessão ACP carrega esse contrato
via runtime do agente. Ao concluir o trabalho, a sessão **deve invocar o tool_call de
conclusão padronizado** que carrega o outcome de domínio. O orquestrador captura esse
tool_call via notificação ACP `session/update` (do tipo `tool_call`) e usa seu input como
verdade do resultado.

Os tools de conclusão são fornecidos pelo orquestrador (via servidor MCP local hospedado por
ele ou mecanismo equivalente — decisão da TechSpec) e seus schemas são versionados com o
produto:

- `report_implementer_result(status, files_changed[], build_passed, tests_passed, summary,
  issues_encountered[])`
- `report_review_result(approved, issues[], severity_counts, requires_rework,
  review_file_path)`
- `report_finalizer_result(committed, sha, merged, branch_deleted, files_committed[])`

**Critérios de Aceitação**:

- **Given** uma sessão ACP aplicando `flow-implementer`
  **When** a sessão invoca o tool_call `report_implementer_result` com input válido conforme
  schema
  **Then** o orquestrador captura via notificação `session/update.tool_call` e usa esses
  campos para decidir o próximo passo do loop.

- **Given** uma sessão ACP aplicando `flow-reviewer`
  **When** a sessão invoca `report_review_result` com `approved`, `requires_rework` e
  `issues[]`
  **Then** o orquestrador usa `requires_rework` para decidir entre avançar ao Finalizer
  ou retornar ao Implementer (passando `issues[]`).

- **Given** uma sessão ACP aplicando `flow-finalizer`
  **When** a sessão invoca `report_finalizer_result`
  **Then** o orquestrador interpreta o campo `committed`: `true` avança a task; `false`
  pausa o pipeline (RF-04).

- **Given** uma sessão ACP que invocou o tool_call de conclusão com input que viola o
  schema (campos faltando, tipos errados)
  **When** o orquestrador valida o input
  **Then** trata como falha da fase, conta como tentativa, e dispara retry com mensagem
  indicando o erro de schema.

- **Given** uma sessão ACP que encerrou (`stopReason: end_turn`) sem invocar o tool_call
  declarado em `completion_tool` da skill de fase
  **When** o orquestrador finaliza
  **Then** trata como falha de contrato (RF-04 já cobre o retry).

**Prioridade**: Must Have

---

### RF-06: Telemetria Persistida por Task (Coletada da Camada ACP)

**Descrição**: Para cada task executada, o orquestrador persiste um arquivo de telemetria
contendo dados estruturados sobre a execução. A persistência é automática e captura dados
diretamente das notificações ACP (`session/update`, resposta de `session/prompt`) e dos
tool_calls de conclusão — nenhum agente precisa registrar nada extra.

**Critérios de Aceitação**:

- **Given** uma task executada com sucesso após 1 tentativa de Implementer e 1 de Reviewer
  **When** o orquestrador conclui a task
  **Then** persiste um arquivo de telemetria contendo, no mínimo: número de iterações por
  fase, status final, tokens de input/output por sessão ACP (quando o runtime os reportar),
  duração de cada sessão, duração total da task, `stopReason` de cada sessão, contagem de
  notificações `tool_call` por agente, lista de issues retornadas pelo Reviewer (vinda do
  `report_review_result`).

- **Given** uma task pausada por esgotar retries
  **When** o orquestrador interrompe
  **Then** persiste a telemetria parcial com o motivo da pausa, `stopReason` da última
  sessão, prompt enviado e a sequência completa de notificações ACP recebidas.

- **Given** uma execução completa do orquestrador (várias tasks)
  **When** o desenvolvedor inspeciona o diretório de telemetria
  **Then** encontra um arquivo por task com cobertura 100% dos campos definidos.

- **Given** um runtime ACP que não reporta tokens consumidos (campo opcional no protocolo)
  **When** o orquestrador finaliza a task
  **Then** registra "tokens não disponíveis" para essa sessão sem falhar a task; a
  cobertura de telemetria considera o campo cumprido.

**Prioridade**: Must Have

---

### RF-07: Memória Cross-Task via `flow-workflow-memory`

**Descrição**: O orquestrador instancia e gerencia, para cada execução, a estrutura de
memória definida pela skill `flow-workflow-memory`: um arquivo de memória compartilhada do
workflow (cross-task) e um arquivo de memória por task. Os caminhos são passados como input
para cada agente, que lê e atualiza conforme as regras da própria skill.

**Critérios de Aceitação**:

- **Given** uma execução nova do orquestrador
  **When** o orquestrador inicializa
  **Then** cria a estrutura de diretórios e os arquivos de memória vazios (shared + per-task)
  conforme o padrão da skill `flow-workflow-memory`.

- **Given** uma task em execução
  **When** o orquestrador invoca o Implementer (e demais agentes)
  **Then** passa, no input do agente, o caminho da memória compartilhada e da memória da
  task corrente, instruindo o agente a operar via skill `flow-workflow-memory`.

- **Given** a task N foi concluída e promoveu uma decisão técnica para a memória
  compartilhada
  **When** a task N+1 inicia
  **Then** o agente Implementer da task N+1 recebe (via `flow-workflow-memory`) acesso à
  memória compartilhada contendo a decisão da task N.

- **Given** um arquivo de memória que cresceu além do limite definido pela skill
  **When** o orquestrador detecta o tamanho excedido
  **Then** sinaliza ao próximo agente invocado que a compactação é necessária (conforme
  protocolo da skill).

**Prioridade**: Should Have

---

### RF-08: Codebase-Aware Enrichment de Tasks

**Descrição**: Antes de invocar o Implementer para uma task, o orquestrador dispara um ou
mais agentes paralelos (de exploração) para investigar o código existente do projeto e
extrair contexto relevante (padrões já usados, módulos vizinhos, convenções do repositório).
Esse contexto é injetado no input do Implementer, reduzindo invenção de padrões e
duplicação.

**Critérios de Aceitação**:

- **Given** uma task que menciona uma área específica do código (ex: "criar handler para
  endpoint /users")
  **When** o orquestrador prepara a invocação do Implementer
  **Then** dispara agente(s) de exploração que retornam um sumário estruturado com: padrões
  encontrados, exemplos de código relevantes, convenções identificadas.

- **Given** o resultado do agente de exploração
  **When** o orquestrador invoca o Implementer
  **Then** o input do Implementer inclui o sumário como contexto antes da descrição da task.

- **Given** o agente de exploração não retornou resultado útil dentro de um timeout
  **When** o orquestrador detecta o timeout
  **Then** prossegue para o Implementer com aviso na telemetria; não bloqueia a task.

**Prioridade**: Could Have

---

### RF-09: Métricas Agregadas e Comparativo de Tokens

**Descrição**: O orquestrador gera, ao fim de uma execução completa, um resumo agregado das
métricas-chave do pipeline (tokens totais, taxa de sucesso, retries totais) em formato
amigável para comparação manual com baseline.

**Critérios de Aceitação**:

- **Given** uma execução completa de N tasks
  **When** o orquestrador termina
  **Then** imprime no terminal e persiste em arquivo um resumo com: total de tasks, sucesso
  vs falhas, total de tokens (input/output), tokens médios por task, retries totais,
  duração total.

- **Given** dois resumos agregados (baseline antigo e nova execução)
  **When** o desenvolvedor compara manualmente
  **Then** os campos são idênticos em estrutura para permitir diff direto.

**Prioridade**: Could Have

---

## Experiência do Usuário

**Persona única (MVP)**: Desenvolvedor de software com familiaridade em CLI e que já usa
algum agente de IA (Claude Code, Codex/Copilot).

**Fluxo principal — primeira vez no projeto (Setup)**:

1. Dev clona ou abre um projeto local sem o Looping Agent instalado.
2. Dev executa o comando de setup do Looping Agent.
3. Setup detecta os agentes presentes (Claude Code, Codex/Copilot) e instala as skills no
   formato esperado por cada um, criando os diretórios padrão de workflow.
4. Setup imprime resumo do que foi instalado e onde.

**Fluxo principal — Fase A (Planejamento, humano dirigindo)**:

1. Dev invoca a skill de criação de PRD via seu agente preferido.
2. Skill conduz discovery interativo, perguntas multiple-choice, e gera `prd.md`.
3. Dev invoca skill de TechSpec, que consome o PRD e gera a especificação técnica.
4. Dev invoca skill de criação de Tasks, que produz `tasks.md` consumível por máquina.

**Fluxo principal — Fase B (Looping, automatizado)**:

1. Dev invoca o orquestrador via CLI apontando para o diretório do PRD.
2. Orquestrador imprime no terminal, em tempo real, qual task está em execução, qual fase
   (Implementer/Reviewer/Finalizer), qual tentativa, e tempo decorrido.
3. Quando uma task termina (sucesso ou falha), o resultado aparece com cores indicando
   status; a próxima task começa automaticamente.
4. Se o pipeline pausar por falha, o terminal mostra claramente o motivo, qual task, e onde
   encontrar o estado persistido para investigação.
5. Ao fim da execução, dev vê o resumo agregado (Phase 3) e pode abrir os arquivos de
   telemetria para análise detalhada.

**Considerações de UX**:

- Output do terminal deve ser legível por humano: cores, indentação, separadores entre fases.
- Erros sempre acompanhados do caminho exato do arquivo onde o estado completo foi persistido.
- O comando CLI deve ter `--help` claro e mensagens de erro acionáveis quando o input estiver
  malformado (ex: diretório sem `tasks.md`).
- A transição entre Fase A e Fase B é manual (dev decide quando rodar o orquestrador). O
  produto não tenta automatizar a aprovação humana do `tasks.md`.

---

## Restrições Técnicas de Alto Nível

- **ACP (Agent Client Protocol) é o protocolo obrigatório** entre orquestrador e
  sub-agentes. Todos os runtimes alvo (Claude Code, Codex/Copilot CLI no MVP) são
  ACP-capable. Não haverá parsing customizado de stdout para inferir resultado.
- **Tools de conclusão (`report_implementer_result`, `report_review_result`,
  `report_finalizer_result`) acompanham o produto** e são versionados junto com o
  orquestrador. O mecanismo de exposição desses tools ao agente (servidor MCP local,
  configuração de ACP, etc.) é decisão da TechSpec.
- **Skill `flow-workflow-memory` é mandatória** — a memória cross-task deve seguir o protocolo
  da skill (shared + per-task, regras de promoção, compactação). Não é permitido criar um
  formato de memória paralelo.
- **Tudo é skill, nada é agent-markdown** — as 19 skills `flow-*` são o único formato de
  artefato distribuído pelo produto. Não há `*.agent.md` separado. Esse design elimina a
  necessidade de adapters por runtime e mantém um único formato instalável (Markdown +
  frontmatter) suportado por Claude Code, Codex, Copilot CLI e outros runtimes ACP-capable.
- **As 3 skills de fase (`flow-implementer`, `flow-reviewer`, `flow-finalizer`) são a
  fonte única de persona e contrato de cada fase do loop** — elas declaram, no frontmatter,
  quais skills de disciplina carregar (`loads_skills`) e qual tool de conclusão invocar
  (`completion_tool`). O orquestrador apenas envia `session/prompt` instruindo a aplicação
  da skill de fase; toda a inteligência da fase vive na skill.
- **Skill `flow-workflow-memory` é mandatória** — a memória cross-task deve seguir o
  protocolo da skill (shared + per-task, regras de promoção, compactação). Não é permitido
  criar um formato de memória paralelo.
- **Skills de disciplina são fonte única de padrões transversais** — as 9 skills com
  `pipeline_stage: runtime` (`flow-workflow-memory`, `flow-workflow-memory-compaction`,
  `flow-task-implementation`, `flow-stack-selector`, `flow-final-verify`,
  `flow-quality-checks`, `flow-code-review`, `flow-quality-ledger`, `flow-git-linear`) são
  fornecidas pelo produto. Qualquer evolução do fluxo passa por atualizar a skill, não por
  lógica duplicada nas skills de fase ou no orquestrador.
- **Skills de planejamento (7) acompanham o produto** — `flow-vision-creator`,
  `flow-domain-creator`, `flow-prd-creator`, `flow-contract-creator`, `flow-techspec-creator`,
  `flow-frontend-techspec-creator`, `flow-task-creator`. O instalador é responsável por
  colocá-las no agente do dev. Continuam como markdowns interativos (não viram código).
- **Padrão de nomenclatura, idioma e frontmatter**: todas as skills usam prefixo `flow-*`,
  idioma **PT-BR** e frontmatter canônico de 5 campos base (`name`, `description`,
  `pipeline_stage`, `consumed_by`, `requires`/`produces`). As 3 skills de fase adicionam
  2 campos: `loads_skills` e `completion_tool`. Skills externas ao produto (catálogo de
  stack como `dotnet-*`, `java-*`, `react-*`, ou utilitárias como `git-commit`) ficam fora
  do empacotamento — o produto referencia-as via `flow-stack-selector` mas não as
  distribui.
- **Execução estritamente local** — não há requisito de CI/CD, daemon ou servidor nesta
  iteração.

> A linguagem do orquestrador (Python, TypeScript, Go, etc.), formato exato de persistência
> da telemetria (JSON, SQLite, etc.), mecanismo de empacotamento/distribuição (binário
> único, npm, brew, etc.) e biblioteca cliente ACP utilizada (SDK Python, TypeScript, Rust,
> etc.) são decisões da TechSpec.

---

## Não-Objetivos (Fora de Escopo)

- **Execução concorrente de tasks**: o MVP roda tasks em série. Paralelização (DAG de
  dependências) fica como evolução futura, não entra em nenhuma das fases deste PRD.
- **Execução em CI/CD**: o foco é dev local. Suporte a GitHub Actions, GitLab CI etc. fica
  fora desta iteração.
- **Substituição das skills de fase (`flow-implementer`, `flow-reviewer`, `flow-finalizer`)
  por código**: elas permanecem como markdowns (skills) editáveis. Somente o orquestrador
  (que antes era `copilot-orchestrator.agent.md`) é código.
- **Suporte a agentes além de Claude Code e Codex/Copilot CLI no MVP**: Cursor, Droid,
  OpenCode, Gemini etc. ficam para iterações futuras (potencial Phase 4+). A adoção de ACP
  destrava esses runtimes "no papel", mas validação/teste por runtime tem custo e fica fora
  do MVP.
- **Suporte a agentes não-ACP**: agentes que não falam ACP (subprocess legado, REST APIs
  proprietárias) não são suportados. O ACP é o único transporte aceito.
- **Reusable agents customizados (`.compozy/agents/<name>/`)**: o produto entrega apenas os
  agentes Implementer/Reviewer/Finalizer; usuário não pode empacotar agentes próprios via
  esta ferramenta no MVP.
- **Provider-agnostic reviews (CodeRabbit, GitHub PR comments)**: o Reviewer interno é o
  único reviewer. Integração com plataformas externas fica fora.
- **Config files com precedência (~/global + workspace)**: defaults vivem em flags do CLI; um
  sistema de config TOML hierárquico fica fora do MVP.
- **Daemon runtime / servidor em background**: tudo é one-shot CLI no escopo do MVP.
- **Sistema de extensões (plugins via JSON-RPC)**: o produto não aceita plugins externos no
  MVP.
- **Dashboard ou UI web de telemetria**: telemetria fica em arquivos legíveis; visualização
  gráfica fica fora.
- **Persistência em banco de dados externo**: tudo é arquivo local no diretório do PRD.
- **Multi-tenant ou multi-usuário**: o produto opera no contexto de um único dev em uma
  única máquina por execução.

---

## Plano de Rollout Faseado

### MVP (Fase 1) — "Produto instalável com loop determinístico"

- **Funcionalidades incluídas**: RF-01 (Setup), RF-02 (19 skills `flow-*` empacotadas),
  RF-03 (Loop), RF-04 (Retry com halt), RF-05 (Contrato JSON), RF-06 (Telemetria com tokens).
- **Critérios de sucesso para avançar à Fase 2**:
  - O setup roda em uma máquina nova com Claude Code instalado, em menos de 1 minuto, e
    deixa o projeto pronto para usar a Fase A.
  - O setup é idempotente (rodar 2x não corrompe nada).
  - Pipeline executa fluxo completo de pelo menos 1 PRD real (com ≥3 tasks) sem
    intervenção manual entre tasks.
  - 100% das tasks executadas têm arquivo de telemetria completo.
  - Halt-on-failure dispara corretamente em cenário sintético.
  - Mesmo input executado 3 vezes produz a mesma sequência de chamadas a sub-agentes —
    taxa de reprodutibilidade ≥ 95%.

### Fase 2 — "Memória cross-task"

- **Funcionalidades adicionais**: RF-07 (integração completa com `flow-workflow-memory`).
- **Critérios de sucesso para avançar à Fase 3**:
  - Pelo menos 1 cenário documentado em que uma decisão técnica promovida pela task N foi
    consumida e respeitada pela task N+1, evidenciado nos arquivos de memória.
  - Compactação de memória dispara corretamente quando os limites são excedidos.

### Fase 3 — "Enrichment + métricas agregadas"

- **Funcionalidades restantes**: RF-08 (codebase-aware enrichment), RF-09 (métricas
  agregadas).
- **Critérios de sucesso de longo prazo**:
  - Comparativo demonstra redução de tokens em relação ao baseline do orquestrador-agente
    (meta a definir após coletar baseline na Fase 1; sugestão inicial: ≥30% por task).
  - Em tasks com enrichment ativo, o Implementer cita explicitamente padrões/convenções
    extraídos do contexto de exploração em pelo menos 50% dos casos.

---

## Métricas de Sucesso

| Métrica | Definição | Valor-alvo | Prazo |
|---|---|---|---|
| **Tempo de setup do produto** | Tempo da invocação do comando de setup até o "tudo instalado" em uma máquina nova com Claude Code | < 60 segundos | Desde o lançamento do MVP |
| **Idempotência do setup** | % de execuções repetidas do setup que não quebram nem duplicam estado | 100% | Desde o lançamento do MVP |
| **Redução de tokens por task** | Média de tokens (input+output) por task no novo orquestrador vs baseline do agente atual | ≥ 30% de redução | Avaliar 30 dias após cutover |
| **Taxa de reprodutibilidade do loop** | % de execuções do mesmo input que produzem a mesma sequência de chamadas a sub-agentes | ≥ 95% | Medido continuamente após Fase 1 |
| **Cobertura de telemetria** | % de tasks executadas com arquivo de telemetria completo | 100% | Desde o lançamento do MVP |
| **Taxa de halt-on-failure correto** | % de cenários de falha em que o pipeline pausou e persistiu o estado completo | 100% | Desde o lançamento do MVP |

> Coletar o baseline de tokens do orquestrador-agente atual **antes** do cutover é
> pré-requisito para validar a métrica primária. Esta coleta é uma questão em aberto.

---

## Riscos e Mitigações

- **Risco — Adoção interna baixa pelo dev**: o dev pode preferir continuar com o
  orquestrador-agente por familiaridade.
  *Mitigação*: documentar o ganho com números (resumo agregado da Phase 3) e manter o agente
  antigo disponível durante a transição até paridade comprovada.

- **Risco — Agentes não respeitarem o contrato JSON**: o LLM pode retornar texto acompanhado
  do JSON, JSON parcialmente válido, ou ignorar o schema.
  *Mitigação*: o RF-05 já prevê retry com instrução de correção; reforçar nos próprios
  markdowns dos agentes a obrigatoriedade de "JSON puro, nada após o JSON".

- **Risco — Memória cross-task crescer e poluir contexto dos agentes**: arquivos de memória
  podem inflar e aumentar o consumo de tokens.
  *Mitigação*: a skill `flow-workflow-memory` já define regras de compactação; o RF-07 exige
  que o orquestrador dispare a sinalização de compactação.

- **Risco — Baseline de tokens difícil de medir retroativamente**: se o agente atual não
  estiver instrumentado, o número-base para a métrica primária fica frágil.
  *Mitigação*: adicionar uma fase prévia ao MVP de "instrumentar agente atual por 1 semana
  para coletar baseline" — listada em Questões em Aberto.

- **Risco — Halt-on-failure se torna fricção**: o dev pode achar bloqueante demais e desligar
  o comportamento.
  *Mitigação*: priorizar mensagens de diagnóstico claras (RF-06 exige que o estado completo
  da última tentativa seja persistido) para que a investigação seja rápida.

- **Risco — Setup quebrar em ambientes heterogêneos**: layouts de diretório de
  Claude/Codex/Copilot variam por OS, versão do agente, instalação user-scoped vs system.
  *Mitigação*: o RF-01 exige idempotência e mensagens de erro acionáveis; o MVP cobre
  apenas Claude Code + Codex (escopo controlado), e o dev tem alternativa de setup manual
  documentado caso a detecção falhe.

- **Risco — Sobreposição percebida com compozy**: o produto pode ser visto como redundante
  com o compozy.
  *Mitigação*: o Looping Agent é um subset opinativo (apenas duas fases, dois agentes-alvo,
  sem daemon/extensions/multi-runtime). É positioning de "menos é mais" para times que não
  precisam da plataforma completa.

- **Risco — Variação de implementação ACP entre runtimes**: o ACP é uma especificação, mas
  cada runtime (Claude, Codex, Copilot) pode ter quirks (campos opcionais não emitidos,
  ordem de notificações, formato de tool_call inputs).
  *Mitigação*: o RF-06 já trata campos opcionais (ex: tokens) como ausência tolerável; o
  RF-05 valida o input do tool de conclusão contra o schema interno e dispara retry em
  desvio. Documentar runtimes testados e versões mínimas conhecidas.

- **Risco — Tools de conclusão não disponíveis no agente**: o mecanismo de expor os tools
  `report_*` ao agente (via MCP server local ou equivalente) pode falhar em runtimes
  específicos.
  *Mitigação*: o RF-01 (Setup) deve validar disponibilidade dos tools antes de declarar a
  instalação completa. Se a TechSpec optar por servidor MCP, o setup garante que o agente
  reconhece o servidor.

- **Risco — Codebase-aware enrichment introduz custo extra de tokens**: a Fase 3 adiciona
  agentes paralelos de exploração que consomem tokens antes do Implementer.
  *Mitigação*: o RF-08 prevê timeout e fallback (segue sem enrichment se exploração falhar);
  o resumo agregado (RF-09) deve segregar tokens de exploração para que o trade-off seja
  visível.

---

## Alternativas Consideradas

### Abordagem Escolhida: SDD Instalável com Faseamento por Capacidade

- **Descrição**: Produto único instalável que entrega tanto o empacotamento das skills de
  planejamento (Fase A) quanto o orquestrador em código (Fase B). Faseado: MVP entrega
  setup + loop + skills empacotadas; Fase 2 adiciona memória cross-task; Fase 3 adiciona
  enrichment e métricas agregadas.
- **Por que foi escolhida**: Coloca o produto em pé desde o MVP (instalável, executável,
  útil ponta a ponta). Faseamento permite coletar baseline real durante a operação antes de
  focar em otimização e features avançadas.

### Alternativa Rejeitada 1: Apenas Substituir o Orquestrador (escopo original)

- **Descrição**: PRD foca somente no orquestrador em código. Skills de planejamento ficam
  como hoje (instaladas manualmente, sem versionamento por este produto). Sem instalador.
- **Trade-offs**: Escopo menor, entrega mais rápida da peça crítica.
- **Por que foi rejeitada**: Não captura o benefício de "embutir o SDD" no projeto. O
  desenvolvedor continua tendo que montar o setup à mão, o que recria o problema que o
  compozy resolveu.

### Alternativa Rejeitada 2: Forkar/embedar o compozy diretamente

- **Descrição**: Em vez de construir o produto, usar o compozy como base e customizar
  apenas o que diferencia.
- **Trade-offs**: Aproveita o ecossistema completo; escopo enorme com daemon, extensions,
  40+ runtimes; dependência de upstream.
- **Por que foi rejeitada**: O compozy traz muitas features que estão fora do escopo
  declarado (daemon, extensions, multi-runtime, provider-agnostic reviews, reusable agents
  customizados). O custo de manter um fork ou aprender o ecossistema completo supera o
  benefício, dado que precisamos apenas de um subset opinativo.

### Alternativa Rejeitada 3: Big Bang (tudo em uma fase)

- **Descrição**: Implementar instalador + loop + memória + enrichment + métricas em Phase 1,
  cutover único.
- **Trade-offs**: Reduz risco de regressões parciais; cutover único.
- **Por que foi rejeitada**: Atrasa a primeira validação dos motivadores de produto (custo,
  determinismo, telemetria). Não conseguimos aprender com uso real durante o desenvolvimento.

### Alternativa Rejeitada 4: Suportar Todos os 40+ Agentes do Compozy no MVP

- **Descrição**: Instalador suporta Claude Code, Codex, Cursor, Droid, OpenCode, Gemini,
  Pi etc. desde o MVP.
- **Trade-offs**: Cobertura ampla; alinhamento com compozy.
- **Por que foi rejeitada**: Cada agente tem layout próprio de skills, formatos de
  manifesto, diretórios. Suporte amplo no MVP multiplica casos de teste e fricção. MVP
  cobre apenas Claude Code + Codex; ampliação é Phase 4+.

### Alternativa Rejeitada 5: Parsing Customizado de Stdout (JSON em Bloco no Final)

- **Descrição**: Cada sub-agente termina sua execução imprimindo um bloco
  ```json ... ``` em stdout; o orquestrador captura via subprocess e parseia o último
  bloco para extrair o outcome de domínio.
- **Trade-offs**: Mais simples de implementar inicialmente; sem dependência de bibliotecas
  ACP; menos camadas.
- **Por que foi rejeitada**: Reinventa transporte/lifecycle/cancelamento que o ACP já
  resolve. Não obtém streaming nativo (necessário para terminal UI rica). Não captura
  tokens consumidos de forma padronizada. Acopla o orquestrador ao formato exato de saída
  de cada agente, multiplicando casos de teste por runtime. ACP é o padrão emergente para
  esse domínio (compozy, Zed, e múltiplos editores adotam) e oferece interoperabilidade de
  graça.

---

## Questões em Aberto

- **Como coletar o baseline de tokens do orquestrador-agente atual?** — Sem isso, a métrica
  primária ("redução de tokens por task") não tem ponto de comparação confiável.
  *Quem responde*: dev/owner do pipeline. *Prazo*: antes do início da Fase 1.
  *Impacto*: a métrica de custo vira anedótica.

- **Qual o limite máximo de retries por fase?** — Sugestão inicial é 3, mas pode variar
  entre Implementer e Reviewer.
  *Quem responde*: dev/owner. *Prazo*: antes do MVP. *Impacto*: configurável via flag, mas
  o default precisa ser razoável.

- **Onde exatamente as skills de planejamento são instaladas?** — Globalmente em
  `~/.claude/skills/` (compartilhado entre projetos) ou no escopo do projeto (
  `<projeto>/.claude/skills/`)? Cada opção tem trade-offs em manutenção e isolamento.
  *Quem responde*: dev/owner. *Prazo*: antes do MVP. *Impacto*: define UX do setup e
  política de atualização (RF-02).

- **Como atualizar skills já instaladas preservando customizações do usuário?** — RF-02
  menciona o requisito sem definir o mecanismo (overwrite com backup? merge? versionar?).
  *Quem responde*: dev/owner. *Prazo*: antes do MVP. *Impacto*: define UX da atualização e
  risco de regressão.

- **A telemetria deve ficar no diretório do PRD ou em diretório global de observabilidade?** —
  Afeta como o dev consulta histórico cross-PRD.
  *Quem responde*: dev/owner. *Prazo*: antes do MVP. *Impacto*: decisão fica para a TechSpec.

- **Quando o pipeline pausar por halt-on-failure, há "retomar do ponto que parou" no MVP?** —
  Ou o dev sempre re-executa do zero (RF-03 garante que tasks concluídas são puladas)?
  *Quem responde*: dev/owner. *Prazo*: antes do MVP. *Impacto*: pode afetar critério de
  aceitação do RF-04.

- **Existem outros agentes futuros (lint, security scan, SAST) que devam entrar no loop?** —
  Se sim, contrato e sequência precisam ser desenhados para extensão.
  *Quem responde*: dev/owner. *Prazo*: antes da Fase 2. *Impacto*: pode forçar refatoração
  do loop se aparecer só em Fase 3.

- **Codebase-aware enrichment vai além do código? (ex: ler PRD/TechSpec do próprio projeto
  como contexto?)** — Definir escopo do RF-08 antes de implementar.
  *Quem responde*: dev/owner. *Prazo*: antes da Fase 3. *Impacto*: define complexidade do
  enrichment e custo de tokens da feature.

- **Como expor os tools de conclusão (`report_*`) ao agente em sessão ACP?** —
  Possibilidades: (a) servidor MCP local hospedado pelo orquestrador e injetado na sessão;
  (b) tools registrados via mecanismo nativo do runtime; (c) outro. Cada caminho tem
  trade-offs em portabilidade e setup.
  *Quem responde*: dev/owner + arquiteto da TechSpec. *Prazo*: antes do MVP. *Impacto*:
  define complexidade do RF-01 (validação no setup) e do RF-05 (entrega dos tools).

- **Versão mínima do ACP suportada e estratégia de upgrade**: o protocolo está em
  evolução. Fixar uma versão mínima reduz surpresas, mas obriga upgrades coordenados.
  *Quem responde*: dev/owner. *Prazo*: antes do MVP. *Impacto*: matrix de compatibilidade
  com runtimes e política de manutenção.

- **Comportamento quando o runtime ACP suporta o protocolo mas a skill de fase não
  consegue invocar o `completion_tool`**: o LLM dentro da sessão pode encerrar com
  `stopReason: end_turn` sem chamar `report_*`, ou entrar em loop tentando chamar um tool
  que não está disponível.
  *Quem responde*: dev/owner. *Prazo*: antes do MVP. *Impacto*: pode requerer lógica de
  detecção no orquestrador e reforço de instrução nas próprias skills de fase
  (`flow-implementer`, `flow-reviewer`, `flow-finalizer`) — RF-04 já cobre o retry, mas o
  texto da skill precisa ser claro o suficiente para evitar o caso recorrente.
