---
name: flow-code-review
description: Conduz análise semântica de uma tarefa implementada validando linha a linha contra PRD, TechSpec e task spec, e aplicando padrões do stack. Use no reviewer após flow-quality-checks passar. Não use se o pipeline de qualidade falhou — corrija o build primeiro.
pipeline_stage: runtime
consumed_by: [reviewer]
requires: ["Quality Pipeline Report PASS"]
produces: ["Semantic Review Result", "tasks/prd-[slug]/[N]_task_review.md"]
---

# Code Review Checklist

Guia a análise semântica da revisão — a fase que de fato encontra problemas reais.

## Pré-condição

Esta skill só deve ser carregada **após** `flow-quality-checks` retornar PASS. Se o pipeline falhou, volte para o orchestrator com REJEITADA antes de carregar esta skill.

## Ordem de verificação

### 1. Validação de alinhamento com fontes

Valide que a implementação atende **linha por linha**:

#### 1a. vs. Task spec
- Todos os deliverables listados estão implementados?
- Todos os critérios de aceitação estão satisfeitos?
- Todos os itens de Validation/Test Plan têm teste correspondente?

Se a task spec tem bullets ou checklist, cruze cada item com código.

#### 1b. vs. PRD
- Objetivos de negócio estão preservados?
- Requisitos funcionais tocados pela tarefa estão corretos?
- Métricas de sucesso declaradas têm mecanismo de medição?

#### 1c. vs. TechSpec
- Padrão arquitetural declarado foi seguido? (ex: CQRS, Hexagonal)
- Contratos de API (request/response) batem com o especificado?
- Decisões de tecnologia foram respeitadas? (ex: Postgres vs. Mongo)

#### 1d. vs. ADRs (se existirem)
- Restrições arquiteturais foram respeitadas?
- Se a tarefa exige exceção a um ADR, há justificativa explícita?

### 2. Carregue skills de review do stack

Use `flow-stack-selector` para carregar as skills de revisão relevantes (`dotnet-code-quality`, `java-testing`, `react-architecture`, etc.).

Para cada skill carregada, aplique sua checklist aos arquivos tocados na tarefa.

### 3. Verificações transversais

Independente do stack, verifique:

#### 3a. Segurança
- Inputs validados antes de processamento
- Autorização verificada ANTES de qualquer lookup que revele existência de recursos (evitar user enumeration por diferença entre 403 e 404)
- Secrets nunca em código ou logs
- SQL injection / XSS / CSRF endereçados conforme aplicável

#### 3b. Integridade de dados
- Idempotência: se a task exige, há garantia TANTO em código QUANTO em banco (constraint única, índice parcial, etc.)
- Transações: operações multi-step têm boundary transacional claro
- Publicação de eventos async dentro de tx: usa `afterCommit` / deferred dispatch (não `@Async` dentro da tx)

#### 3c. Resiliência
- Chamadas a dependências externas têm timeout e retry/circuit breaker
- **AOP proxy pitfall:** `@Retry`/`@CircuitBreaker`/`@Transactional` não aplicados em self-invocation (método chama outro da mesma classe sem passar pelo proxy)
- Falhas terminais (4xx) não são retryadas

#### 3d. Testes
- Testes cobrem os cenários declarados na task
- Testes exercitam o código de verdade (não apenas mockam o que deveriam validar)
- Testes com anotações AOP (`@Retry`, `@CircuitBreaker`) são de integração com proxy ativo, não unitários com `new`
- Cobertura de edge cases: nulls, vazio, concorrência, timeouts

#### 3e. Código morto / duplicação
- Código comentado que "implementa" algo — inválido, task não cumprida
- Duplicação de lógica em múltiplos arquivos
- Imports ou símbolos não utilizados

#### 3f. Documentação / config
- Variáveis de ambiente novas estão documentadas (`.env.example` ou equivalente)
- Mudanças em config declaradas no techspec estão refletidas
- Convenções declaradas na task (ex: `depends_on: condition: service_healthy`) foram aplicadas em TODOS os pontos aplicáveis

### 4. Classificação de problemas encontrados

Para cada problema, atribua:

**Severidade:**
- **Crítica** — impede merge; segurança, perda de dados, endpoint quebrado
- **Alta** — bloqueia aprovação; lógica incorreta, padrão arquitetural violado, teste ausente em cenário crítico
- **Média** — rejeita a menos que haja justificativa; cobertura parcial, convenção não seguida em ponto secundário
- **Baixa** — documenta mas não rejeita; typo em comentário, pequena inconsistência de estilo

**Decisão de aprovação:**
- Qualquer problema Crítico → REJEITADA
- Qualquer problema Alto → REJEITADA
- Problema Médio sem justificativa explícita no código ou memória → REJEITADA
- Problema Médio com justificativa aceitável → APROVADA + documentar
- Problemas Baixos → APROVADA + documentar

### 5. Saída

Ao final, produza um resumo estruturado:

```
SEMANTIC REVIEW RESULT
----------------------
Alinhamento com task spec: [OK | Divergências encontradas]
Alinhamento com PRD: [OK | Divergências encontradas]
Alinhamento com TechSpec: [OK | Divergências encontradas]
Alinhamento com ADRs: [OK | N/A | Divergências encontradas]

Skills de stack aplicadas:
- [skill-name-1] — [OK | Problemas]
- [skill-name-2] — [OK | Problemas]

Problemas encontrados:
1. [Severidade] [Categoria] — [descrição]
   Arquivo: [path:linha]
   Trecho: [snippet se aplicável]
2. ...

Verdict: [APROVADA | REJEITADA]
Motivo de rejeição (se aplicável): [descrição curta]
```

Este output alimenta diretamente:
- O arquivo `[task]_task_review.md`
- A skill `flow-quality-ledger` (que vai classificar e registrar)

## Regras de disciplina

- NÃO edite código. Você é reviewer. Se encontrou problema, REJEITE.
- NÃO suavize severidade para aprovar ("ah, é só médio, vou deixar passar"). Aplique o critério.
- NÃO rejeite por preferência pessoal — rejeite apenas por desvio de padrão, requisito ou boa prática documentada
- NÃO aprove sem ter conferido linha por linha contra o task spec — é a fonte mais próxima da verdade

## Tratamento de casos ambíguos

- Se o task spec é ambíguo e a implementação escolheu uma interpretação razoável, NÃO rejeite — mas registre como "Origem Provável: Task mal fragmentada" no ledger
- Se o padrão da skill é ambíguo, NÃO rejeite — registre como sugestão de melhoria na skill
- Se você hesita entre aprovar e rejeitar, **rejeite** — melhor pagar custo de uma iteração a mais do que deixar passar um bug

## Referência cruzada

Após esta skill, o reviewer deve carregar:

1. `flow-quality-ledger` — para registrar telemetria dos problemas encontrados
2. `flow-workflow-memory` (já carregada) — para decidir promoção de aprendizados para `MEMORY.md`
