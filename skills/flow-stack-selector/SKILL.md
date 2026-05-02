---
name: flow-stack-selector
description: Identifica o stack do projeto (Java, .NET, React) e orienta quais skills do catálogo carregar antes de implementar ou revisar. Use sempre que um agente (implementer ou reviewer) precisar aplicar padrões específicos do stack. Não use para orquestração, tracking ou operações git.
pipeline_stage: runtime
consumed_by: [implementer, reviewer]
requires: []
produces: []
---

# Stack Skills Selector

Identifica stack e orienta carregamento de skills específicas do catálogo do projeto.

## Quando usar

- No Implementer: após `flow-task-implementation`, antes de começar a codificar
- No Reviewer: antes de aplicar `flow-code-review`

## Identificação do stack

Verifique a raiz do repositório e os módulos da tarefa em questão:

| Indicador | Stack |
|-----------|-------|
| Arquivos `.cs`, `.csproj`, `.sln` | .NET / C# |
| Arquivos `.java`, `pom.xml`, `build.gradle` | Java |
| Arquivos `.ts`, `.tsx`, `package.json` com React/Next | React / TypeScript |

Se o repositório tem múltiplos stacks (monorepo), identifique o stack do módulo tocado pela tarefa — não carregue skills de stacks não tocados.

## Skills por stack

### .NET / C#

Comece por `dotnet-index` — ela é o mapa de navegação das skills .NET. Depois carregue o que for relevante para a tarefa:

| Skill | Quando carregar |
|-------|------------------|
| `dotnet-architecture` | Tarefa mexe em Clean Architecture, CQRS, estrutura de pastas, ProblemDetails, FluentValidation |
| `dotnet-code-quality` | Tarefa envolve escrita de código novo — nomenclatura, SOLID, async/await, DI |
| `dotnet-dependency-config` | Tarefa mexe em EF Core, Mapster, FluentValidation, Polly, NuGet, configuração |
| `dotnet-observability` | Tarefa envolve health checks, logging, tracing, CancellationToken |
| `dotnet-performance` | Tarefa envolve queries EF Core, caching, HttpClient |
| `dotnet-testing` | Tarefa envolve xUnit, WebApplicationFactory, Testcontainers, Playwright |
| `dotnet-production-readiness` | Review pré-produção — carrega em revisões finais |

### Java

| Skill | Quando carregar |
|-------|------------------|
| `java-architecture` | Clean/Hexagonal Architecture, CQRS, ProblemDetail RFC 7807 |
| `java-code-quality` | Código novo — naming, métodos, DI, null handling, records |
| `java-dependency-config` | pom.xml, Spring Data JPA, Flyway, MapStruct, profiles |
| `java-observability` | Logging JSON, OpenTelemetry, Micrometer, Actuator |
| `java-performance` | Queries JPA, N+1, caching Caffeine/Redis, HikariCP |
| `java-testing` | JUnit 5, AssertJ, Mockito, Testcontainers, Playwright |
| `java-production-readiness` | Review pré-produção |

### React / TypeScript

| Skill | Quando carregar |
|-------|------------------|
| `react-architecture` | Estrutura de pastas, path aliases, imports |
| `react-code-quality` | Componentes novos, hooks, TypeScript strict |
| `react-observability` | OpenTelemetry Web, tracing, interceptors Axios |
| `react-runtime-config` | Configuração 12-factor, Dockerfile, nginx |
| `react-testing` | Vitest, RTL, MSW, testes de hooks |
| `react-production-readiness` | Review pré-produção |

### Comuns (qualquer stack)

| Skill | Quando carregar |
|-------|------------------|
| `git-commit` | Sempre que for commitar — formato de mensagem |
| `restful-api` | Tarefa envolve endpoints HTTP — versionamento, URLs, RFC 9457 |
| `roles-naming` | Tarefa envolve controle de acesso, papéis, perfis |

## Regra de carregamento

1. **Sempre leia o `SKILL.md` completo** de cada skill selecionada — não confie em resumos
2. **Carregue o mínimo suficiente** — não carregue tudo "por garantia"
3. **Se a tarefa é multi-camada** (ex: backend Java + teste de integração + API REST), carregue `java-code-quality` + `java-testing` + `restful-api`
4. **Para review pré-produção** (última tarefa do PRD ou task marcada como "pré-prod"), priorize a skill `*-production-readiness` — ela consolida checklist das outras

## Exemplos de seleção

### Exemplo 1: Tarefa .NET com endpoints e testes

Task spec: "Implementar endpoint `POST /v1/authz/check` retornando ProblemDetails em erros, com testes de integração via WebApplicationFactory."

Skills carregadas:
- `dotnet-architecture` (padrão CQRS, ProblemDetails)
- `dotnet-code-quality` (estilo, async/await)
- `dotnet-testing` (WebApplicationFactory)
- `restful-api` (endpoint HTTP, RFC 9457)

### Exemplo 2: Tarefa Java com filtro JPA e cache

Task spec: "Adicionar filtro por `moduleId` em `GET /audit/events` com cache Caffeine de 5min."

Skills carregadas:
- `java-code-quality` (código novo)
- `java-performance` (cache, query otimizada)
- `java-testing` (testes do cache)
- `restful-api` (endpoint, query params)

### Exemplo 3: Tarefa React com formulário e integração

Task spec: "Criar formulário `AssignRoleForm` com validação, chamada para `POST /v1/users/{id}/roles`, tracing de submissão."

Skills carregadas:
- `react-architecture` (estrutura do componente)
- `react-code-quality` (hooks, TypeScript strict)
- `react-testing` (Vitest, RTL, MSW)
- `react-observability` (tracing da submissão)

## Saída esperada

Antes de começar a implementar/revisar, imprima:

```
Stack identificado: [Java | .NET | React | Multi]
Skills carregadas:
- [skill-1] — [razão]
- [skill-2] — [razão]
- ...
```

Isso garante rastreabilidade e permite ao reviewer (ou a você em re-execução) verificar se a seleção fez sentido.

## Tratamento de erros

- Se o stack não for identificável (múltiplos indicadores conflitantes), peça clarificação ao caller
- Se uma skill listada acima não existir no repositório, ignore-a e prossiga com as existentes — não invente skills
- Se uma skill existe mas está vazia/incompleta, reporte como follow-up no `memory/[task]_task.md`
