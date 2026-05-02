---
name: flow-final-verify
description: Exige evidência fresca de verificação antes de qualquer claim de conclusão, aprovação ou commit. Use quando um agente está prestes a declarar sucesso, aprovar uma tarefa ou fazer commit. Não use para planejamento inicial, brainstorming ou tarefas que ainda não chegaram em um passo concreto de verificação.
pipeline_stage: runtime
consumed_by: [implementer, reviewer]
requires: []
produces: ["Verification Report"]
---

# Verificação Antes de Declarar Conclusão

## Visão geral

Declarar trabalho concluído sem verificação é desonestidade, não eficiência.

**Princípio central:** Evidência antes de afirmação, sempre.

**Violar a letra desta regra é violar o espírito dela.**

## A Lei de Ferro

```
SEM CLAIMS DE CONCLUSÃO SEM EVIDÊNCIA FRESCA DE VERIFICAÇÃO
```

Se o comando de verificação não foi executado na mensagem atual, o resultado não pode ser afirmado.

## A função de gate

```
ANTES de declarar qualquer status ou expressar satisfação:

1. IDENTIFIQUE: qual comando prova essa afirmação?
2. EXECUTE: rode o comando COMPLETO (fresh, do zero)
3. LEIA: output completo, verifique exit code, conte falhas
4. VERIFIQUE: o output confirma a afirmação?
   - SE NÃO: declare o status real com a evidência
   - SE SIM: declare a afirmação COM a evidência
5. SÓ ENTÃO: faça a afirmação

Pular qualquer passo = mentir, não verificar
```

## Escopo da verificação

Combine o escopo da verificação com o escopo da afirmação:

- **Afirmação estreita** (ex: "este teste passa"): rode o teste específico
- **Afirmação ampla** (ex: "tarefa concluída", "pronto para commit"): rode o **pipeline completo** — formatação, lint, todos os testes, build

Uma verificação estreita não sustenta uma afirmação ampla. Rodar `mvn test` sozinho não justifica "tarefa completa". Rodar o linter sozinho não justifica "pronto para commit".

**Na dúvida, rode o pipeline completo.** Sobreverificar desperdiça minutos. Subverificar desperdiça horas.

**Pipeline verde ≠ requisitos atendidos.** Um build verde prova que o código compila, passa lint e passa nos testes existentes. NÃO prova que a implementação atende aos requisitos. Para claims de "tarefa concluída" ou "requisitos atendidos", valide também os deliverables contra a especificação original — linha por linha, não por suposição.

## Comandos de verificação por stack

### Java / Maven

```bash
mvn clean verify
```

Inclui: compile, test, integration-test (se configurado), checkstyle/spotless (se configurado).

### .NET / C#

```bash
dotnet build --configuration Release && dotnet test --configuration Release
```

Se houver script de lint separado (ex: `dotnet format --verify-no-changes`), inclua-o.

### React / TypeScript / Node

```bash
npm run build && npm run test && npm run lint && npm run typecheck
```

Ajuste conforme o que está configurado no `package.json`. Se houver um único gate (`npm run verify` ou similar), use-o.

### Regra geral

Se o projeto define um único comando de gate (ex: `make verify`, `npm run ci`), execute ESSE comando. Confie no gate do projeto.

## Falhas comuns

| Afirmação | Requer | Não basta |
|-----------|--------|-----------|
| Testes passam | Output do test command: 0 falhas | Execução anterior, "deve passar" |
| Linter limpo | Output do linter: 0 erros | Check parcial, extrapolação |
| Build OK | Build command: exit 0 | Linter passando, logs parecem OK |
| Bug corrigido | Teste do sintoma original: passa | Código mudou, assumido corrigido |
| Teste de regressão funciona | Ciclo red-green verificado | Teste passa uma vez |
| Agent concluiu | Diff mostra as mudanças | Agent reportou "sucesso" |
| Requisitos atendidos | Checklist linha por linha | Testes passando |

## Bandeiras vermelhas

- Usar "deve", "provavelmente", "parece que"
- Expressar satisfação antes da verificação
- Prestes a commitar, push ou abrir PR sem verificação
- Confiar em relatório de sucesso de outro agent
- Apoiar-se em verificação parcial
- Pensar "só dessa vez"
- Qualquer construção verbal que implique sucesso sem evidência atual

## Prevenção de racionalização

| Desculpa | Realidade |
|----------|-----------|
| "Deve funcionar agora" | Rode a verificação |
| "Estou confiante" | Confiança ≠ evidência |
| "Só essa vez" | Sem exceções |
| "Linter passou" | Linter ≠ compilador |
| "Agent disse que deu certo" | Verifique independentemente |
| "Estou cansado" | Cansaço ≠ desculpa |
| "Check parcial basta" | Parcial prova nada |
| "Palavras diferentes, regra não se aplica" | Espírito acima da letra |

## Quando aplicar

Aplique esta skill antes de:

- Qualquer claim de sucesso ou conclusão
- Qualquer expressão de satisfação com o estado da implementação
- Qualquer commit ou criação de PR
- Qualquer handoff que implica correção
- Mover para a próxima tarefa baseado em conclusão

## Gate pré-commit e pré-PR

Commits e PRs são artefatos permanentes. Exigem o mais alto padrão de verificação.

**Antes de `git commit`:**

1. Rode o pipeline completo (ex: `mvn clean verify`). Não um subset. O pipeline completo.
2. Confirme zero erros, zero warnings, zero falhas de teste no output.
3. Produza um Verification Report (template abaixo) com verdict PASS.
4. Só então rode `git commit`.

**Antes de criar um PR:**

1. Tudo acima, mais:
2. Verifique que o diff corresponde às mudanças intencionais (`git diff`)
3. Confirme que nenhum arquivo não relacionado está staged

Se o pipeline completo não passou nesta sessão após a última mudança de código, o commit ou PR não deve prosseguir.

## Template do Verification Report

A verificação não está completa até o agent **citar o output literal do comando** na resposta. "Rodei e passou" NÃO é evidência. Se o output de verificação não é mostrado, a verificação não aconteceu.

Toda verificação DEVE ser reportada usando essa estrutura. Não desvie.

```
VERIFICATION REPORT
-------------------
Claim: [o que está sendo afirmado — ex: "testes passam", "build OK", "tarefa concluída"]
Command: [comando exato rodado — ex: `mvn clean verify`]
Executed: [timestamp ou "just now, após todas as mudanças"]
Exit code: [0 ou não-zero]
Output summary: [linhas-chave do output — contagem de testes, contagem de erros, resultado do build]
Warnings: [quaisquer warnings, ou "none"]
Errors: [quaisquer erros, ou "none"]
Verdict: PASS ou FAIL
```

Se o verdict for FAIL, NÃO use linguagem de conclusão. Declare o que falhou e o que falta.

Se o verdict for PASS, a afirmação pode prosseguir — mas apenas a afirmação específica suportada pela evidência. "Testes passam" não significa "build OK".

## Quando a verificação falha

Falha de verificação não é beco sem saída. É informação. Siga este protocolo:

1. **Leia a falha.** Identifique o erro exato: qual comando falhou, qual teste, qual regra de lint, qual erro de build. Cite as linhas relevantes do output.
2. **Diagnostique a causa raiz.** Não adivinhe. Leia a mensagem de erro. Rastreie até a fonte. Se múltiplas coisas falharam, endereçe uma de cada vez começando pela primeira.
3. **Corrija a causa raiz.** Aplique a mudança mínima que endereça o erro real. Não aplique workarounds, não suprima warnings, não pule checks.
4. **Re-verifique do zero.** Rode o comando de verificação completo de novo. Não assuma que o fix funcionou. Não rode apenas o subset que falhou antes.
5. **Reporte com evidência.** Use o template. Se passar agora, a afirmação pode prosseguir. Se falhar de novo, volte ao passo 1.

**Nunca:**

- Afirme sucesso parcial ("3 de 4 checks passam, quase lá")
- Pule re-verificação após um fix ("corrigi o erro, então deve passar")
- Culpe a ferramenta ("o linter está errado") sem evidência de falso positivo
- Avance para a próxima tarefa enquanto a verificação ainda falha

Se o comando correto de verificação não está claro, identifique-o antes de fazer qualquer claim de conclusão. Se apenas verificação parcial estiver disponível, declare essa limitação explicitamente e evite linguagem de conclusão.
