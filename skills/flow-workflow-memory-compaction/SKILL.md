---
name: flow-workflow-memory-compaction
description: Compacta arquivos de memória do workflow (MEMORY.md e memory/*.md) quando ficam grandes ou ruidosos, preservando estado, decisões e riscos ativos. Use quando um arquivo de memória cresceu além do útil, tem repetição, logs longos ou narrativa cronológica. Não use para compactar código, documentos do PRD ou o quality-ledger.
pipeline_stage: runtime
consumed_by: [implementer, reviewer]
requires: ["tasks/prd-[slug]/MEMORY.md", "tasks/prd-[slug]/memory/[N]_task.md"]
produces: []
---

# Workflow Memory Compaction

Mantém arquivos de memória enxutos sem perder contexto crítico.

## Quando usar

Aplique compactação quando qualquer condição for verdadeira:

- O arquivo passou de ~200 linhas
- Tem repetição óbvia entre seções
- Tem narrativa cronológica ("fiz X, depois Y, depois Z") em vez de fatos
- Contém transcrições de comandos, stack traces longos ou output de ferramentas
- Tem notas stale (referentes a código que já mudou)

## Ordem de compactação

Se ambos os arquivos precisam ser compactados, **compacte `MEMORY.md` primeiro**, depois `memory/[task]_task.md`. O arquivo compartilhado define o contexto cross-task que o arquivo de tarefa não deve duplicar.

## Regras de compactação

### Preservar

- Estado atual do workflow
- Decisões duráveis com justificativa
- Learnings reutilizáveis
- Riscos abertos
- Notas de handoff ativas

### Remover

- Repetição entre seções
- Notas stale (desatualizadas pelo repositório atual)
- Transcrições longas de comandos ou output
- Fatos deriváveis do repositório, PRD ou task files
- Narrativa cronológica de "fiz isso, depois aquilo"
- Grandes blocos de código embutidos

### Reescrever

- Itens preservados viram **bullets curtos e factuais**
- Um item = uma afirmação, sem contexto redundante
- Preserve as seções padrão do template (`## Estado Atual`, `## Decisões Compartilhadas`, etc.)
- Remova seções vazias apenas se realmente não tiverem uso

## Processo passo a passo

1. **Leia o arquivo inteiro** — não compacte cegamente
2. **Marque o que preservar** — aplique as regras de preservação
3. **Identifique duplicatas** — consolide itens que dizem a mesma coisa
4. **Reescreva em bullets curtos** — cada item em 1 linha factual quando possível
5. **Reorganize por seção** — mantenha o template, mova itens para a seção correta
6. **Verifique invariantes** — estado, decisões e riscos ativos ainda estão presentes
7. **Grave o resultado** — sobrescreva o arquivo original

## Exemplo: antes e depois

### Antes (ruidoso)

```markdown
## Decisões Compartilhadas

- Hoje de manhã eu estava tentando decidir entre usar Kafka ou RabbitMQ para
  a publicação de eventos e depois de pesquisar um pouco e conversar com
  o time decidi que vamos usar Kafka por causa do volume esperado
- Depois o time reforçou que Kafka é a melhor escolha
- Rodei `mvn clean install` e passou sem erros, então segui com a implementação
- O build levou 3min45s
- Decidimos então seguir com Kafka definitivamente
```

### Depois (compactado)

```markdown
## Decisões Compartilhadas

- Kafka escolhido como broker de eventos (volume > 10k msg/s esperado; RabbitMQ descartado)
```

Cinco bullets ruidosos viraram um bullet factual. A decisão e a justificativa estão preservadas. Output de comando e narrativa cronológica foram removidos.

## Regras críticas

- NÃO remova riscos ativos ou decisões duráveis, mesmo para reduzir tamanho
- NÃO consolide itens que parecem similares mas tratam de escopos diferentes
- NÃO invente conteúdo para "melhorar" a memória — apenas consolide o que já está lá
- Se compactar deixaria o arquivo com informação ambígua ou incompleta, **mantenha o arquivo maior** — tamanho não é o problema, ambiguidade é

## Tratamento de erros

- Se a compactação resultaria em remoção de contexto crítico, aborte e reporte ao caller
- Se o arquivo tem conteúdo que conflita entre si, mantenha a versão mais recente (última entrada prevalece) e registre o conflito como nota
- Se a compactação não reduz significativamente (< 30% de redução), provavelmente o arquivo não precisava ser compactado — reverta e siga adiante
