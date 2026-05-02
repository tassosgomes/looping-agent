---
name: flow-vision-creator
description: >
  Cria o Vision Document (Nível 0) para sistemas grandes e complexos com múltiplos domínios,
  módulos ou perfis de usuário. Use esta skill sempre que o usuário quiser iniciar um sistema
  novo, modernizar um legado, ou estruturar um projeto grande antes de criar qualquer PRD.
  Dispare quando o usuário mencionar "sistema grande", "vários módulos", "ERP", "plataforma",
  "onde começo", "visão geral do projeto", "vision doc", "mapa do sistema", ou quando for
  evidente que o escopo é amplo demais para um único PRD. Esta skill é o Nível 0 do pipeline
  Vision → Domain → PRD → TechSpec → Tasks. Deve ser executada antes de qualquer Domain Doc ou PRD
  quando o sistema tiver mais de um domínio de negócio.
pipeline_stage: vision
consumed_by: [planning]
requires: []
produces: [vision.md, "domains/[dominio]/"]
---

# Vision Creator

Produz o Vision Document — âncora de contexto global para todo o desenvolvimento do sistema.
O documento gerado serve como entrada obrigatória para a skill `flow-domain-creator` e, indiretamente,
para todas as skills subsequentes do pipeline.

## Template

Antes de redigir, leia o template em `templates/vision-template.md`.

## Entradas e Saída

- **Entradas aceitas:** discovery com cliente · sistema legado para modernizar · ideia nova (greenfield)
- **Documento de saída:** `vision.md` (raiz do projeto)
- **Estrutura criada:** `domains/[dominio-N]/` (uma pasta por domínio identificado)

## Fluxo de Trabalho

O fluxo é sequencial. Cada etapa deve ser completada antes de avançar.

### 1. Identificar o Tipo de Entrada

Antes de qualquer pergunta, identifique o ponto de partida:

- **Discovery com cliente** → atuar como entrevistador estruturado, focar no negócio, não em tecnologia
- **Sistema legado** → pedir descrição do sistema atual: o que faz, onde falha, o que preservar vs. substituir
- **Greenfield** → fazer perguntas de validação de negócio antes de qualquer coisa: problema, usuários, escala

Se o tipo de entrada não estiver claro, pergunte antes de continuar.

### 2. Esclarecer (Não pule esta etapa)

Adapte as perguntas ao tipo de entrada. Ao final, os seguintes pontos devem estar claros:

**Negócio:**
- Qual problema central o sistema resolve?
- Para quem? (perfis de usuário — roles)
- Qual o impacto atual de não ter a solução?
- Quais são os objetivos de negócio mensuráveis?

**Escopo:**
- Quais são as grandes áreas de responsabilidade? (domínios candidatos)
- O que está explicitamente fora do escopo?
- Há sistema legado? O que será migrado, integrado ou descartado?

**Restrições:**
- Há stack tecnológica obrigatória?
- Há prazo, orçamento ou restrições regulatórias?
- Há integrações obrigatórias com sistemas externos?

**Roadmap:**
- Qual seria um MVP mínimo entregável?
- Há fases naturais de entrega?
- Quais domínios têm prioridade?

Se houver informações críticas ausentes, continue perguntando. Não gere o Vision Doc ainda.

### 3. Identificar e Validar Domínios

Com base nas respostas, proponha a lista de domínios candidatos e apresente ao usuário para validação:

- Nome claro para cada domínio (ex: `Financeiro`, `Gestão de Contratos`, `Portal do Paciente`)
- Responsabilidade principal em uma frase por domínio
- Dependências entre domínios identificadas
- Agrupamento por fases de entrega sugerido

**Critérios de um bom domínio:**
- Responsabilidade coesa e bem delimitada (bounded context)
- Pode ser desenvolvido com razoável independência dos demais
- Tem pelo menos um perfil de usuário que se beneficia diretamente
- Se tiver mais de 15 features previstas, considere dividir

Aguarde validação dos domínios antes de continuar.

### 4. Planejar

Apresente ao usuário antes de redigir:

- Lista final de domínios com responsabilidades
- Mapa de interdependências proposto
- Roadmap macro em fases com critérios de conclusão
- Premissas assumidas
- Riscos identificados
- Glossário inicial de termos de negócio

Aguarde confirmação antes de redigir.

### 5. Redigir o Vision Doc

Use o template `templates/vision-template.md`.

Diretrizes obrigatórias:

- **Foco em negócio, não em tecnologia** — evite frameworks, linguagens ou arquitetura técnica
- **Domínios como bounded contexts** — cada domínio auto-explicativo em uma frase
- **Glossário completo** — todo termo de negócio não-óbvio deve estar no glossário
- **Roadmap por valor entregado** — cada fase com critério claro de conclusão (definition of done)
- **Non-Goals explícitos** — o que o sistema NÃO faz é tão importante quanto o que faz
- **Manter entre ~800 e 1.500 palavras** no corpo principal (excluindo tabelas e glossário)

### 6. Validação Interna

Antes de finalizar, execute a autoavaliação:

- [ ] Todos os domínios têm responsabilidade claramente definida sem sobreposição?
- [ ] O mapa de interdependências está completo e sem ciclos não-intencionais?
- [ ] O roadmap é realista dado as restrições declaradas?
- [ ] Existem termos vagos no documento? (ex: "moderno", "eficiente", "intuitivo")
- [ ] Os Non-Goals estão explícitos o suficiente para evitar scope creep?
- [ ] O glossário cobre todos os termos de domínio usados no documento?
- [ ] Um agente de IA conseguiria criar Domain Docs a partir deste Vision Doc sem perguntas adicionais?

Se houver falhas, corrija antes de prosseguir.

### 7. Salvar e Criar Estrutura

- Salvar Vision Doc como: `vision.md` (raiz do projeto)
- Criar pasta para cada domínio identificado: `domains/[nome-do-dominio]/`
- Confirmar operação de escrita e estrutura criada

### 8. Protocolo de Saída

A resposta final deve conter:

1. Resumo das decisões principais — domínios identificados, fases do roadmap, restrições críticas
2. Conteúdo completo do Vision Doc em Markdown
3. Caminho do arquivo salvo e estrutura de pastas criada
4. Próximos passos — quais Domain Docs criar primeiro (baseado em dependências e roadmap)
5. Questões em aberto que precisam de validação com stakeholders
6. Indicação de próximo passo: "Para detalhar cada domínio, use a skill `flow-domain-creator`"

## Como Usar em Sessões Futuras

Ao iniciar qualquer sessão de Domain Doc, PRD, Tech Spec ou Tasks, forneça o `vision.md` como contexto:

> "Contexto do projeto: [vision.md]. Agora vamos criar o Domain Doc do domínio Financeiro."

Isso garante que a IA mantenha coerência com o escopo global sem precisar reexplicar o projeto a cada sessão.

## Princípios Fundamentais

- O Vision Doc é um **contrato de escopo**, não uma especificação técnica
- **Prefira domínios menores e bem definidos** a domínios grandes e vagos
- **Interdependências são riscos** — minimize-as no design de domínios sempre que possível
- **Legado não é inimigo** — identifique o que pode ser reaproveitado antes de propor substituição total
- Um Vision Doc bem feito permite retomar o contexto em qualquer sessão futura sem retrabalho