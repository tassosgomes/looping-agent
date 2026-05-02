---
name: flow-quality-ledger
description: Registra telemetria estruturada de qualidade em docs/ai-dev/quality-ledger.md ao final de cada revisão, classificando problemas por categoria técnica e origem provável. Também gera resumo consolidado por PRD quando a última tarefa é concluída. Use sempre no reviewer, independente do resultado (aprovada ou rejeitada). Não use para logs operacionais ou memória de workflow.
pipeline_stage: runtime
consumed_by: [reviewer]
requires: []
produces: ["docs/ai-dev/quality-ledger.md", "docs/ai-dev/prd-summaries/prd-[slug]-summary.md"]
---

# Quality Ledger Recorder

Registra telemetria obrigatória de cada revisão para permitir melhoria contínua.

## Quando usar

- No Reviewer, **após** `flow-code-review` (ou após rejeição por build/test failure)
- Uma entrada por tarefa revisada, independente do resultado
- Também quando a tarefa é a última do PRD — gera resumo consolidado

## Arquivo alvo

```
docs/ai-dev/quality-ledger.md
```

Sempre em modo **append** — nunca sobrescreva entradas anteriores.

## Template obrigatório de entrada

```markdown
## [YYYY-MM-DD] | PRD: [nome-do-prd] | Task: [N]

Modelo utilizado:
[modelo informado pelo orchestrator, ex: GPT-5.4 (copilot)]

### Problemas Identificados

1. Categoria Técnica:
   Severidade:
   Fase Detectada:
   Origem Provável:
   Necessitou Reimplementação Significativa? (Sim/Não)
   Descrição:

(repetir bloco acima para cada problema)

### Resumo da Tarefa

Total de Problemas: [N]
Categoria Técnica mais frequente: [categoria | N/A]
Origem mais frequente: [origem | N/A]
Indício de fragilidade estrutural? (Sim/Não) [Sim/Não]
Iterações até estabilização: [N]
Sugestão de melhoria no:
- PRD: [texto | Nenhuma]
- TechSpec: [texto | Nenhuma]
- Template de Task: [texto | Nenhuma]
- Skill: [texto | Nenhuma]
```

## Categorias técnicas obrigatórias

Cada problema deve ser classificado em exatamente UMA das categorias:

- Lógica incorreta
- Falha de validação
- Edge case ignorado
- Erro de dependência
- Erro de integração
- Overengineering
- Violação de padrão arquitetural
- Teste inadequado
- Problema de performance
- Problema de segurança

Se o problema não se encaixa em nenhuma, use a categoria mais próxima e anote a limitação no campo `Descrição`.

## Origens prováveis obrigatórias

Cada problema deve ter exatamente UMA origem:

- Ambiguidade no PRD
- Lacuna na TechSpec
- Task mal fragmentada
- Skill insuficiente
- Limitação do modelo
- Contexto insuficiente

## Fases detectadas

- Implementação (problema identificado antes mesmo de rodar build)
- Build (falha na compilação)
- Teste (falha em testes automatizados)
- Revisão (problema encontrado na análise semântica)

## Campo "Iterações até estabilização"

Esse valor vem do orchestrator (contador `IteracoesTotais`). Se o reviewer não recebeu esse valor explicitamente, assuma 1 e marque limitação.

## Caso "Zero Defects"

Se a revisão aprovou sem encontrar problemas, registre explicitamente:

```markdown
### Problemas Identificados

Zero Defects Identified
Iterações até estabilização: [N]

### Resumo da Tarefa

Total de Problemas: 0
Categoria Técnica mais frequente: N/A
Origem mais frequente: N/A
Indício de fragilidade estrutural? (Sim/Não) Não
Sugestão de melhoria no:
- PRD: Nenhuma.
- TechSpec: Nenhuma.
- Template de Task: Nenhuma.
- Skill: Nenhuma.
```

## Regra crítica: origem PRD ou TechSpec

Se **qualquer** problema tem origem `Ambiguidade no PRD` ou `Lacuna na TechSpec`:

1. NÃO basta corrigir o código
2. Registre a falha com descrição literal do trecho afetado
3. No campo `Sugestão de melhoria`, indique explicitamente o trecho do PRD ou TechSpec que precisa ser ajustado
4. Marque `Indício de fragilidade estrutural? (Sim/Não): Sim` se o mesmo tipo de problema já apareceu no ledger para este PRD

## Consolidação ao final do PRD

Se a tarefa em revisão é a **última pendente** do PRD (verifique em `{prd-dir}/tasks.md` — todas as outras estão `[x]`), gere também:

```
docs/ai-dev/prd-summaries/prd-[nome-do-prd]-summary.md
```

Formato:

```markdown
# PRD [nome] — Quality Summary

Total de tarefas: [N]
Total de problemas identificados: [N]
Média de iterações por tarefa: [N.N]

## Distribuição por Categoria Técnica

- [Categoria A]: N ocorrências
- [Categoria B]: N ocorrências
- ...

## Distribuição por Origem

- [Origem A]: N ocorrências
- [Origem B]: N ocorrências
- ...

## Principais Fragilidades Detectadas

- [fragilidade 1]
- [fragilidade 2]

## Recomendações Estruturais

- Ajustes no template de PRD: [texto | Nenhum]
- Ajustes na TechSpec: [texto | Nenhum]
- Ajustes na fragmentação de tarefas: [texto | Nenhum]
- Ajustes nas Skills: [texto | Nenhum]
```

Leia todas as entradas do ledger com `PRD: [nome-do-prd]` para calcular os agregados. NÃO invente números — se não consegue extrair, declare a limitação.

## Distinção crítica: ledger vs. memory

| Arquivo | Conteúdo |
|---------|----------|
| `quality-ledger.md` | Problema encontrado, categoria, origem, severidade — pós-defeito |
| `MEMORY.md` / `memory/*.md` | Decisão tomada, constraint descoberta, learning útil — pré-decisão futura |

Se um problema no ledger revelou uma decisão durável (ex: "descobrimos que X sempre precisa de constraint no banco para idempotência"), a **decisão** vai para `MEMORY.md` via skill `flow-workflow-memory`, mas o **defeito** continua sendo registrado aqui no ledger. Não duplique.

## Regras críticas

- NÃO falsifique contagens. Se teve 3 problemas, registre 3 — não esconda.
- NÃO pule esta skill porque "a tarefa foi simples". Registros de `Zero Defects` também contam — mostram que o processo está estabilizando.
- NÃO misture telemetria com narrativa. Bullets factuais, classificações canônicas.
- Preserve a data no header (`[YYYY-MM-DD]`) — ela é usada em análises temporais.

## Tratamento de erros

- Se `docs/ai-dev/quality-ledger.md` não existe, crie-o com um header explicando o propósito antes de registrar a primeira entrada
- Se múltiplas revisões da mesma tarefa aconteceram (iterações), cada uma gera sua própria entrada no ledger (com contador de iteração incrementado)
- Se a classificação de um problema é ambígua, escolha a mais específica e documente a ambiguidade no campo `Descrição`
