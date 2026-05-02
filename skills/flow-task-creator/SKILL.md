---
name: flow-task-creator
description: >
  Gera listas de tarefas abrangentes e detalhadas para implementação, baseadas em PRD e Especificação
  Técnica. Use esta skill sempre que o usuário quiser criar tarefas de implementação, quebrar uma 
  funcionalidade em tasks, gerar um plano de execução, criar tickets de desenvolvimento, ou decompor
  trabalho técnico. Também dispare quando o usuário disser "criar tarefas", "gerar tasks", "quebrar
  em tarefas", "plano de implementação", "o que preciso implementar", "gerar tickets", ou qualquer
  variação que indique a necessidade de transformar um PRD/TechSpec em trabalho executável. Esta skill
  é a terceira etapa do pipeline PRD → TechSpec → Tasks. Requer que o PRD e a TechSpec já existam.
  As tarefas geradas são otimizadas para consumo por agentes de código (Cursor, Claude Code, etc.).
pipeline_stage: tasks
consumed_by: [planning]
requires: ["tasks/prd-[slug]/prd.md", "tasks/prd-[slug]/techspec.md"]
produces: ["tasks/prd-[slug]/tasks.md", "tasks/prd-[slug]/[N]_task.md"]
---

# Task Creator

Gera tarefas de implementação detalhadas, com validação cruzada de cobertura, otimizadas para agentes de código. Cada tarefa contém caminhos de arquivo concretos, contexto de implementação e critérios verificáveis por máquina.

## Templates

Antes de gerar, leia os templates empacotados nesta skill:
- `templates/tasks-template.md` — formato do resumo de tarefas
- `templates/task-template.md` — formato de cada tarefa individual

## Entradas e Saídas

- **PRD requerido:** `tasks/prd-[nome-funcionalidade]/prd.md`
- **TechSpec requerida:** `tasks/prd-[nome-funcionalidade]/techspec.md`
- **Resumo de saída:** `tasks/prd-[nome-funcionalidade]/tasks.md`
- **Tarefas individuais:** `tasks/prd-[nome-funcionalidade]/<num>_task.md`

## Pré-requisitos

Confirmar que ambos os documentos existem. Se a TechSpec estiver faltando, informar o usuário para usar a skill `flow-techspec-creator` primeiro.

## Etapas do Processo

### 1. Descoberta de Skills de Stack (Obrigatório — Primeira coisa a fazer)

As tarefas geradas devem incluir detalhes técnicos alinhados com as skills de linguagem/framework disponíveis. Siga este processo:

**A) Identificar a stack:**
- Verificar a seção "Skills de Referência" da TechSpec — ela já lista quais skills foram consultadas
- Se o usuário especificou a stack explicitamente, usar essa indicação
- Se a TechSpec não tem a seção, inferir a partir do Inventário de Artefatos (extensões de arquivo: `.cs` → csharp, `.tsx` → react, `.java` → java)

**B) Ler as skills relevantes para geração de tarefas:**
Consulte OBRIGATORIAMENTE os SKILL.md das seguintes skills da stack identificada:

| Domínio | Skill a Consultar | Como Influencia as Tasks |
|---------|-------------------|--------------------------|
| Testes | `[stack]-testing` | Define padrões de teste, frameworks, estrutura de arquivos de teste, convenções de naming |
| Qualidade | `[stack]-code-quality` | Define convenções que devem aparecer nos critérios de sucesso |
| Production Readiness | `[stack]-production-readiness` | Define checklist de prontidão que pode gerar tarefas adicionais |
| Observabilidade | `[stack]-observability` | Define padrões de logging/métricas que devem aparecer nas subtarefas |
| Arquitetura | `[stack]-architecture` | Confirma estrutura de pastas para os caminhos de arquivo nas tasks |

As skills de `common/` (design-patterns, restful-api) já devem ter sido consultadas pela TechSpec. Releia-as apenas se necessário para detalhar uma tarefa específica.

**C) Registrar as skills consultadas:**
Inclua no `tasks.md` uma seção "Skills de Stack Consultadas" listando quais skills foram lidas.

**Override manual:** Se o usuário indicar uma stack diferente da inferida, use a stack indicada.

### 2. Analisar PRD e Especificação Técnica

- Extrair requisitos e decisões técnicas
- Identificar componentes principais
- Identificar explicitamente as user stories cobertas por cada tarefa principal
- Extrair o **Inventário de Artefatos** da TechSpec (seção que lista todos os arquivos/componentes a criar ou modificar)

### 3. Varredura por Categorias Obrigatórias (Não pule esta etapa)

Antes de gerar qualquer tarefa, verifique se o plano cobre TODAS as categorias abaixo. Para cada categoria, gere pelo menos uma tarefa OU declare explicitamente "N/A — [justificativa]":

| # | Categoria | O que verificar | Skill de Stack Relacionada |
|---|-----------|-----------------|---------------------------|
| 1 | **Setup / Configuração** | Variáveis de ambiente, configs, feature flags, docker-compose, migrations iniciais | `[stack]-dependency-config` |
| 2 | **Modelos de Dados** | Entidades, schemas de banco, migrations, seeds | `[stack]-architecture` |
| 3 | **Lógica de Negócio** | Cada regra/requisito funcional do PRD deve virar pelo menos uma tarefa | `[stack]-architecture` |
| 4 | **Endpoints / Interfaces** | Cada endpoint ou interface da TechSpec precisa de tarefa | `common/restful-api` |
| 5 | **Integrações Externas** | Serviços terceiros, SDKs, webhooks, filas | `[stack]-dependency-config` |
| 6 | **Validações e Erros** | Input validation, error handling, edge cases documentados no PRD | `[stack]-code-quality` |
| 7 | **Testes** | Unitários, integração, e2e — como subtarefas dentro de cada tarefa principal | `[stack]-testing` |
| 8 | **Observabilidade** | Logs, métricas, alertas, health checks | `[stack]-observability` |
| 9 | **Documentação** | API docs, README, variáveis de ambiente, runbook | — |
| 10 | **Segurança** | Autenticação, autorização, sanitização de inputs, rate limiting | `[stack]-production-readiness` |

### 4. Gerar Estrutura de Tarefas

- Organizar sequenciamento
- Definir trilhas paralelas

### 5. Gerar Arquivos de Tarefas Individuais

- Criar arquivo para cada tarefa principal usando `templates/task-template.md`
- Detalhar subtarefas e critérios de sucesso
- Incluir caminhos de arquivo concretos em cada tarefa
- **Na seção "Detalhes de Implementação" de cada task, incluir as convenções relevantes das skills de stack** — ex: padrão de teste da skill de testing, padrão de error handling da skill de code-quality

### 6. Validação Cruzada (Obrigatório — Não pule esta etapa)

Antes de finalizar, execute esta checagem e inclua o resultado no `tasks.md`:

**A) Cobertura de Requisitos Funcionais:**
Para cada requisito funcional numerado do PRD, verifique se existe pelo menos uma tarefa que o cobre:

```
| Requisito | Task(s) | Status |
|-----------|---------|--------|
| RF-01     | 2.0     | ✅ Coberto |
| RF-02     | —       | ❌ GAP → Criar task |
```

Se houver GAPs, crie as tarefas faltantes ANTES de finalizar.

**B) Cobertura de Componentes da TechSpec:**
Para cada componente/artefato listado no Inventário de Artefatos da TechSpec, verifique se existe tarefa de implementação:

```
| Artefato | Task | Status |
|----------|------|--------|
| src/services/auth.service.ts | 3.0 | ✅ |
| src/middleware/rate-limit.ts  | —   | ❌ GAP |
```

**C) Cobertura de Categorias:**
Confirme que todas as 10 categorias obrigatórias foram endereçadas (tarefa ou N/A explícito).

## Otimização para Agentes de Código

Como o consumidor principal é um agente de código, cada tarefa DEVE incluir:

1. **Caminhos de arquivo concretos** — na seção "Arquivos Envolvidos":
   - `Criar:` arquivos novos com caminho completo (seguindo a estrutura da skill de arquitetura)
   - `Modificar:` arquivos existentes que serão alterados
   - `Referência:` arquivos para consultar mas não alterar
   - `Skills:` skills de stack que o agente deve consultar ao implementar esta tarefa

2. **Critérios de sucesso verificáveis por máquina** — comandos ou verificações que o agente pode executar, alinhados com as skills de testing/code-quality:
   - Comandos de teste: `dotnet test --filter "ClassName=AuthServiceTests"` ou `npm test -- --grep "AuthService"`
   - Verificações de compilação: `dotnet build` ou `npm run build`
   - Verificações de lint: `dotnet format --verify-no-changes` ou `npm run lint`
   - Respostas esperadas de endpoint: `POST /api/v1/auth → 200 com token JWT`

3. **Contexto de implementação** — snippets de código, assinaturas de função ou interfaces relevantes da TechSpec copiados diretamente na tarefa, **incluindo convenções das skills de stack** (ex: "Seguir o padrão de Repository definido em `dotnet-architecture`").

## Diretrizes de Criação de Tarefas

- Agrupar tarefas por domínio (ex: agente, ferramenta, fluxo, infra)
- Ordenar tarefas logicamente, com dependências antes de dependentes
- Tornar cada tarefa principal independentemente completável
- Definir escopo e entregáveis claros para cada tarefa
- Incluir testes como subtarefas dentro de cada tarefa principal
- Amarrar cada tarefa principal às user stories do PRD sempre que possível

## Análise de Paralelização

Para a análise de execução paralela, considere:
- Verificação de duplicação de arquitetura
- Análise de componentes faltantes
- Validação de pontos de integração
- Análise de dependências e identificação de caminho crítico
- Oportunidades de paralelização e lanes de execução

## Diretrizes Finais

- Assuma que o leitor principal é um **agente de código** (Cursor, Claude Code)
- Para funcionalidades grandes (>10 tarefas principais), sugira divisão em fases
- Use o formato X.0 para tarefas principais, X.Y para subtarefas
- Indique claramente dependências e marque tarefas paralelas
- **Nunca finalize sem executar a Validação Cruzada (Etapa 6)**
- **Cada tarefa deve referenciar as skills de stack relevantes** para que o agente de código possa consultá-las durante a implementação

Após completar a análise e gerar todos os arquivos necessários, apresente os resultados ao usuário e aguarde confirmação para prosseguir com a implementação.