---
name: flow-git-linear
description: Aplica fluxo git linear (rebase + merge fast-forward) para integrar uma feature branch em main, garantindo histórico limpo para tarefas curtas (1-2 commits). Use no finalizer após a revisão aprovar. Não use para branches com múltiplos commits complexos que exigem preservação de histórico (squash ou merge commit).
pipeline_stage: runtime
consumed_by: [finalizer]
requires: ["tasks/prd-[slug]/[N]_task_review.md APROVADA"]
produces: []
---

# Git Flow Linear

Fluxo git opinativo para tarefas curtas — prioriza histórico linear, sem merge commits desnecessários.

## Quando usar

- No Finalizer, após o reviewer retornar `APROVADA`
- Para tarefas com 1-2 commits (típico deste fluxo)
- Quando o objetivo é manter `main` com histórico linear e limpo

## Quando NÃO usar

- Tarefas com 5+ commits que têm valor histórico preservável (use merge commit ou squash com histórico explícito)
- Branches compartilhadas com outros desenvolvedores (rebase reescreve história e pode quebrar co-trabalho)

## Pré-condições obrigatórias

Antes de qualquer comando git, verifique:

1. `{prd-dir}/[task]_task_review.md` existe e tem resultado `APROVADA`
2. `{prd-dir}/tasks.md` foi atualizado com `[x]` para a tarefa atual
3. Todos os artefatos pendentes estão no working tree (vide lista abaixo)

## Artefatos que DEVEM entrar no commit

Execute `git status` e verifique que estão unstaged ou staged, não ignorados:

- Código implementado (todos os arquivos tocados pelo implementer)
- `{prd-dir}/[task]_task_review.md`
- `{prd-dir}/tasks.md` (atualizado)
- `{prd-dir}/memory/[task]_task.md` (memória da tarefa)
- `{prd-dir}/MEMORY.md` (**apenas se o reviewer promoveu algo**)
- `{prd-dir}/[task]_task.md` (só se foi alterado durante execução)
- `docs/ai-dev/quality-ledger.md` (telemetria registrada)
- `docs/ai-dev/prd-summaries/prd-[nome]-summary.md` (só se é a última tarefa do PRD)

Se qualquer um desses está modificado mas não entra no stage, **o commit está incompleto**. Corrija antes de prosseguir.

## Passo a passo

### Passo 1: Análise e commit local

```bash
git status
```

Liste os arquivos modificados. Confirme que a lista bate com os artefatos obrigatórios acima.

```bash
git add <arquivos específicos>
```

Use `git add <path>` para cada arquivo explicitamente — evite `git add .` que pode stagear lixo acidental.

Gere a mensagem de commit usando a skill `git-commit` (skill comum do catálogo). Siga o padrão da skill — tipicamente Conventional Commits ou padrão interno do projeto.

```bash
git commit -m "<mensagem gerada via skill git-commit>"
```

### Passo 2: Rebase com main (na feature branch)

Objetivo: garantir que a feature branch está atualizada com `main` antes de integrar.

```bash
git pull --rebase origin main
```

**Se houver conflito:**

1. PARE imediatamente
2. Não tente resolver automaticamente
3. Instrua o usuário:
   > "Conflito durante rebase. Resolva os conflitos manualmente, rode `git add <arquivos resolvidos>` e depois `git rebase --continue`."
4. NÃO execute `git commit` durante o rebase — isso gera merge commit indesejado

Se o rebase passou limpo, prossiga.

### Passo 3: Integração na main

```bash
git checkout main
git pull origin main
git merge <feature-branch> --ff-only
```

**Se `--ff-only` falhar:**

Significa que o rebase do Passo 2 não foi feito corretamente — a feature branch diverge de `main`. Avise o usuário:

> "Fast-forward merge falhou. A feature branch diverge de main. Rode `git checkout <feature-branch>` e refaça `git pull --rebase origin main` antes de tentar o merge novamente."

Não force merge commit — isso viola o princípio do fluxo linear.

### Passo 4: Validação

Mostre o resumo das alterações integradas:

```bash
git diff --stat HEAD~1..HEAD
```

Confirme que os arquivos commitados batem com os artefatos obrigatórios listados anteriormente.

### Passo 5: Limpeza de branch

Pergunte explicitamente ao usuário:

> "O merge fast-forward foi realizado. Deseja excluir a branch local `<nome-da-branch>`?"

Se confirmado:

```bash
git branch -d <feature-branch>
```

**Use apenas `-d` (delete seguro), nunca `-D` (force delete).** Se `-d` falhar com "not fully merged", algo está errado — investigue em vez de forçar.

## Regras de não-violação

- NÃO faça `git push` automático — push é sempre ação do usuário
- NÃO use `--force` ou `--force-with-lease` em rebase de branch compartilhada
- NÃO crie merge commits neste fluxo — use sempre `--ff-only`
- NÃO use `-D` para deletar branch — use sempre `-d`
- NÃO faça commit de arquivos sensíveis (`.env`, tokens, chaves) — verifique `git status` antes
- NÃO commite arquivos fora do escopo da tarefa — se `git status` mostra arquivos não relacionados, discuta com o usuário antes

## Atualização de issue externa

Se o arquivo de tarefa (`[task]_task.md`) contém link para issue externa (GitHub Issues, Jira, etc.):

- Atualize o status da issue conforme convenção do projeto (ex: mover para "Done", adicionar comentário com link do commit)
- Use o link do commit gerado (não o da branch, que pode ser deletada)
- Se não há permissão de API para atualizar, instrua o usuário a fazer manualmente e registre em `memory/[task]_task.md`

## Protocolo de saída

Ao concluir (ou em cada etapa que exige interação), use este formato:

### 🚀 Status da Operação
> Resumo em 1-2 linhas (ex: "Commit realizado, rebase limpo, merge fast-forward aplicado, branch deletada").

### 📄 Arquivos Commitados
Lista dos arquivos do commit (saída resumida de `git diff --stat HEAD~1..HEAD`).

### ⚠️ Ação Necessária (se houver)
- Conflito de rebase → instruir resolução manual
- `--ff-only` falhou → instruir refazer rebase
- Confirmação de deleção de branch pendente
- Push manual pendente

## Tratamento de erros

- Se `git status` mostra arquivos não relacionados à tarefa, NÃO commite — discuta com o usuário
- Se o working tree está sujo de uma tarefa anterior não finalizada, reporte ao orchestrator antes de prosseguir
- Se não há configuração de remote `origin` ou branch `main`, reporte como limitação e não tente adivinhar nomes alternativos
- Se o merge fast-forward bem-sucedido revela arquivos que não deveriam estar lá (ex: arquivos temporários), abra um commit de reversão imediato e reporte
