# TechSpec Halt Fixture

## Estrategia

- O arquivo `tests/e2e/fixtures/prd-halt/missing-source.txt` nao existe e nao
  deve ser criado.
- A task exige copiar exatamente esse arquivo ausente para um destino local.
- Se a origem nao existir, o Implementer deve reportar falha explicita em vez
  de fabricar conteudo ou criar uma origem artificial.

## Resultado esperado

- O orquestrador consome os tres retries do Implementer e pausa a execucao com
  telemetria preservada.