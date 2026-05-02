# PRD Halt Fixture

## Objetivo

Validar que o orquestrador pausa imediatamente quando o Implementer esgota os
retries em uma tarefa impossivel por construcao.

## Escopo

- O fixture nao deve passar do Implementer.
- A ausencia do arquivo de origem obrigatoria e o gatilho esperado para a
  falha.

## Criterio principal

Uma execucao bem-sucedida deste fixture termina com halt por
`retries_exhausted`, produz telemetria e nao chega ao Reviewer.