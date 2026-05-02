---
status: completed
parallelizable: false
blocked_by: [11.0, 13.0, 14.0]
---

<task_context>
<domain>cli/commands</domain>
<type>integration</type>
<scope>core_feature</scope>
<complexity>medium</complexity>
<dependencies>http_server</dependencies>
<unblocks>"16.0,17.0,18.0"</unblocks>
</task_context>

# Tarefa 15.0: CLI — comando `run` + entrypoint + parse de args

## Relacionada as User Stories

- US: invocar orquestrador via CLI sobre PRD
- US: ver status de cada task em tempo real

## Visao Geral

Implementar o comando `run` que conecta orchestrator + renderer, e o entrypoint principal
do CLI com parse de args via `commander` (ou `cac` — decisao da implementacao). Liga o
streaming do `runLoop.onProgress` ao `TerminalUi`. Mapeia exit codes do `RunResult` para
os codigos definidos em `exit-codes.ts`.

## Requisitos

- **Parser:** usar **`commander`** (decisao registrada na TechSpec "Questoes em Aberto")
- Flag `--prd-dir <path>` obrigatoria
- Flag `--max-retries <n>` default 3
- Flag `--runtime <name>` para override
- Flag `--no-color` desativa cores
- Flag `--verbose` / `--debug` aumenta verbosidade (TechSpec) — **`--debug` e GLOBAL**
  (decisao registrada): aplica a todas as fases. Filtro pos-mortem via `jq` na telemetria
  JSONL para isolar uma fase especifica.
- `tasks.md` ausente -> exit 2
- Runtime indisponivel -> exit 3
- Halt -> exit 10/11/12 conforme razao

## Arquivos Envolvidos

- **Criar:**
  - `packages/cli/src/index.ts` (shebang `#!/usr/bin/env node`, parse args, despacho)
  - `packages/cli/src/commands/run.ts`
  - `packages/cli/src/help.ts` (texto de help — RF UX)
  - `packages/cli/test/commands/run.test.ts`
  - `packages/cli/test/index.test.ts`
- **Modificar:**
  - `packages/cli/package.json` (`bin`, dep `commander` ou `cac`)
- **Referencia:**
  - `tasks/prd-orquestrador-em-codigo/techspec.md` secao "Endpoints de API"
  - `tasks/prd-orquestrador-em-codigo/prd.md` RF-03 (criterios de execucao)
- **Skills para consultar durante implementacao:** —

## Subtarefas

- [x] 15.1 `index.ts`: shebang + parse via lib escolhida + dispatch para `setup`/`update`/`run`/`doctor`/`--help`/`--version`
- [x] 15.2 `run.ts`: validar `--prd-dir` (existe? tem `tasks.md`? exit 2 se nao); criar `TerminalUi`; chamar `runLoop({ ..., onProgress })`; tratar resultado e mapear exit code
- [x] 15.3 Mapeamento de halt -> exit code:
  - `haltReason === "retries_exhausted"` -> 10
  - `haltReason === "finalizer_not_committed"` -> 11
  - `haltReason === "contract_violation_unrecoverable"` -> 12
- [x] 15.4 Tratamento de Ctrl+C: `process.on("SIGINT")` -> aborta via `AbortController`; render `halt({ reason: "interrupted" })`; exit code 130
- [x] 15.5 `help.ts` com texto explicativo, exemplos
- [x] 15.6 Testes integrados com mocks: 1 task ok -> exit 0
- [x] 15.7 Testes integrados: halt retry exhausted -> exit 10
- [x] 15.8 Testes integrados: `--prd-dir` invalido -> exit 2
- [x] 15.9 Testes: `--no-color` desativa ANSI (consumir via `colors.ts` toggle)

## Sequenciamento

- Bloqueado por: 11.0, 13.0, 14.0
- Desbloqueia: 16.0, 17.0, 18.0
- Paralelizavel: Nao

## Rastreabilidade

- Esta tarefa cobre: RF-03 (CLI invocando o loop), parte de RF-04 (mapeamento de exit codes), parte de RF-06 (telemetria persistida — feita pelo orchestrator)
- Evidencia esperada: testes integrados cobrem os principais exit codes; entrypoint executavel via `node packages/cli/dist/index.js run --help`.

## Detalhes de Implementacao

**Entrypoint:**

```typescript
#!/usr/bin/env node
// packages/cli/src/index.ts
import { Command } from "commander";
import { runSetup } from "./commands/setup.js";
import { runUpdate } from "./commands/update.js";
import { runRun } from "./commands/run.js";
import { runDoctor } from "./commands/doctor.js";

const program = new Command()
  .name("looping-agent")
  .version(VERSION);

program.command("setup").option("--force").action(async (opts) => process.exit(await runSetup(opts)));
program.command("update").option("--force").action(async (opts) => process.exit(await runUpdate(opts)));
program.command("run")
  .requiredOption("--prd-dir <path>")
  .option("--max-retries <n>", "default 3", "3")
  .option("--runtime <name>")
  .option("--no-color")
  .option("--verbose")
  .option("--debug")
  .action(async (opts) => process.exit(await runRun(opts)));
program.command("doctor").action(async () => process.exit(await runDoctor()));

await program.parseAsync(process.argv);
```

**Mapeamento de halt -> exit (em `run.ts`):**

```typescript
const result = await runLoop({...});
if (result.status === "completed") return 0;
switch (result.haltReason) {
  case "retries_exhausted": return 10;
  case "finalizer_not_committed": return 11;
  case "contract_violation_unrecoverable": return 12;
  default: return 1;
}
```

**Convencoes da stack:**

- Sem `any`
- `commander` (decisao confirmada — TechSpec "Questoes em Aberto" resolvida)
- Shebang necessario para `npm install -g`

## Criterios de Sucesso (Verificaveis)

- [x] Testes passam: `npm test --workspace=@looping-agent/cli -- run index`
- [x] `looping-agent --help` (apos build) imprime texto com 4 comandos
- [x] `looping-agent run --prd-dir nao-existe` -> exit 2
- [x] `looping-agent run --prd-dir <ok>` com mocks de runtime/MCP -> exit 0 em fluxo feliz
- [x] Halt sintetico no orchestrator (retries esgotados) -> exit 10 do CLI
- [x] SIGINT durante execucao -> render halt + exit 130
- [x] Build produz `dist/index.js` executavel (`node dist/index.js --version` funciona)
