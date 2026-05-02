# PRD Smoke Fixture

## Objetivo

Executar o loop completo do Looping Agent com uma task trivial e sem alterar
codigo de producao.

## Escopo

- O fixture existe apenas para validar `setup`, `run`, telemetria e integracao
  git no workspace temporario criado pelos scripts de smoke.
- O artefato funcional da task e um arquivo local dentro deste proprio fixture.

## Criterio principal

Uma execucao bem-sucedida precisa atravessar as fases Implementer, Reviewer e
Finalizer, produzir telemetria para a task `1.0` e encerrar com status final
`completed`.