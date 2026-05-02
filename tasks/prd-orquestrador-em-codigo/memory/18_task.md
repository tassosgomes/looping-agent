# Task 18 Memory

## Snapshot do Objetivo
- Entregar um harness manual de smoke E2E com runtime ACP real, fixture positivo,
  fixture de halt e comparador de reprodutibilidade sem tocar no checkout real.

## Decisoes Importantes
- O runner cria um workspace temporario copiando o repo inteiro, porque Reviewer e
  Finalizer dependem de build/test/lint/git reais.
- O workspace sintetico recebe um repositorio git local e um `origin` bare local
  para que o Finalizer consiga executar commit e merge fast-forward.

## Learnings
- O workspace aberto neste ambiente nao tem metadata git acessivel pelo tool de
  SCM, entao o smoke nao pode depender do checkout atual ser um repo valido.

## Arquivos / Superficies
- `tests/e2e/*`
- `docs/e2e-smoke.md`
- `package.json`
- `tsconfig.json`
- `.eslintrc.cjs`

## Erros / Correcoes
- Nao havia `tests/e2e/` nem wiring no build raiz; o harness foi colocado em um
  projeto TypeScript isolado com referencia no `tsc -b`.
- O `lint` raiz nao pode varrer `tests/e2e/` inteiro porque `tests/e2e/results/`
  contem workspaces copiados; o alvo final ficou restrito a `tests/e2e/*.ts`.

## Ready for Next Run
- Validar os wrappers contra runtimes ACP reais e copiar as versoes aprovadas dos
  manifests para a matriz de baseline quando a equipe decidir formalizar um piso.