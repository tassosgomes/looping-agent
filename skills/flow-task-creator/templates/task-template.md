---
status: pending # Opcoes: pending, in-progress, completed, excluded
parallelizable: false # Se pode executar em paralelo
blocked_by: [] # IDs de tarefas que devem ser completadas primeiro
---

<task_context>
<domain>engine/infra/[subdominio]</domain>
<type>implementation|integration|testing|documentation</type>
<scope>core_feature|middleware|configuration|performance</scope>
<complexity>low|medium|high</complexity>
<dependencies>external_apis|database|temporal|http_server</dependencies>
<unblocks>"[IDs de tarefas desbloqueadas]"</unblocks>
</task_context>

# Tarefa X.0: [Titulo da Tarefa Principal]

## Relacionada as User Stories

- [US-XX] [Titulo da user story] ([cobertura direta|cobertura parcial|suporte])

## Visao Geral

[Breve descricao da tarefa, contexto e motivacao]

## Requisitos

- [Requisito 1]
- [Requisito 2]

## Arquivos Envolvidos

- **Criar:**
  - `[caminho/completo/do/arquivo.ext]`
  - `[caminho/completo/do/arquivo.test.ext]`
- **Modificar:**
  - `[caminho/completo/do/arquivo.ext]` ([descricao breve da alteracao])
- **Referencia:**
  - `[caminho/completo/do/arquivo.ext]` ([interface/tipo/config a consultar])
- **Skills para consultar durante implementacao:**
  - `[stack]-architecture` — [aspecto relevante, ex: "padrao de Repository"]
  - `[stack]-testing` — [aspecto relevante, ex: "convencao de naming de testes"]

## Subtarefas

- [ ] X.1 [Descricao da subtarefa]
- [ ] X.2 [Descricao da subtarefa]
- [ ] X.3 [Testes unitarios]

## Sequenciamento

- Bloqueado por: [IDs ou "Nenhum"]
- Desbloqueia: [IDs]
- Paralelizavel: [Sim/Nao] ([justificativa])

## Rastreabilidade

- Esta tarefa cobre: [IDs das user stories]
- Evidencia esperada: [criterios de aceite, artefatos, testes ou docs que provam a cobertura]

## Detalhes de Implementacao

[Secoes relevantes da spec tecnica, incluindo snippets de codigo, assinaturas de interfaces e decisoes de design. Copie o contexto necessario aqui para que o agente de codigo nao precise consultar outros documentos.]

**Convencoes da stack (das skills consultadas):**
- [Convencao 1 — ex: "Usar Repository Pattern conforme dotnet-architecture"]
- [Convencao 2 — ex: "Testes seguem padrao Arrange-Act-Assert conforme dotnet-testing"]
- [Convencao 3 — ex: "Logs estruturados com Serilog conforme dotnet-observability"]

## Criterios de Sucesso (Verificaveis)

- [ ] Testes passam: `[comando de teste especifico]`
- [ ] Build compila sem erros: `[comando de build]`
- [ ] [Verificacao funcional especifica — ex: endpoint responde 200 para request valido]
- [ ] [Verificacao de edge case — ex: endpoint responde 422 para input invalido]
- [ ] [Verificacao de qualidade — ex: lint passa sem warnings]