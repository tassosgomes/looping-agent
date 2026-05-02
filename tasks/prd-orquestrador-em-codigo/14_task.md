---
status: completed
parallelizable: false
blocked_by: [12.0]
---

<task_context>
<domain>cli/commands</domain>
<type>integration</type>
<scope>core_feature</scope>
<complexity>medium</complexity>
<dependencies>filesystem</dependencies>
<unblocks>"15.0"</unblocks>
</task_context>

# Tarefa 14.0: CLI — comandos `setup`, `update`, `doctor`

## Relacionada as User Stories

- US: rodar `setup` e instalar tudo automaticamente
- US: detectar agentes presentes (Claude/Codex)

## Visao Geral

Implementar os 3 comandos administrativos do CLI: `setup` (RF-01, primeira instalacao),
`update` (atualizacao via overwrite + `.bak` ADR-004) e `doctor` (diagnostico). Todos
usam `skills-installer`, `state-manager`, e o detector de runtime do orchestrator. Cada
comando mapeia exit codes conforme TechSpec secao "Mapeamento de excecoes".

## Requisitos

- `setup` valida runtime ACP detectado, copia 19 skills, cria state, faz smoke test do
  MCP server (spawn + list_tools + shutdown)
- `setup` sem runtime detectado -> exit 1 com mensagem listando runtimes esperados
- `setup` em projeto ja configurado -> idempotente, exit 0
- `update` calcula novos hashes; cria `.bak` apenas onde hash difere
- `doctor` reporta: Node version, runtime detectado, 19 skills presentes com hash ok,
  `.bak` pendentes, MCP smoke test
- Saida humana com cores; flag `--json` para output programatico (futuro — opcional MVP)

## Arquivos Envolvidos

- **Criar:**
  - `packages/cli/src/commands/setup.ts`
  - `packages/cli/src/commands/update.ts`
  - `packages/cli/src/commands/doctor.ts`
  - `packages/cli/src/exit-codes.ts` (constantes da TechSpec)
  - `packages/cli/test/commands/setup.test.ts`
  - `packages/cli/test/commands/update.test.ts`
  - `packages/cli/test/commands/doctor.test.ts`
- **Modificar:** —
- **Referencia:**
  - `tasks/prd-orquestrador-em-codigo/techspec.md` secao "Endpoints de API" + "Mapeamento de excecoes"
  - `tasks/prd-orquestrador-em-codigo/prd.md` RF-01
  - `tasks/prd-orquestrador-em-codigo/adrs/adr-004.md`
- **Skills para consultar durante implementacao:**
  - todas as 19 `flow-*` (validar lista no doctor)

## Subtarefas

- [x] 14.1 `exit-codes.ts`: constantes (`EXIT_NO_RUNTIME=1`, `EXIT_NO_TASKS_MD=2`, `EXIT_RUNTIME_UNAVAILABLE=3`, `EXIT_HALT_RETRIES=10`, `EXIT_HALT_NO_COMMIT=11`, `EXIT_HALT_CONTRACT=12`)
- [x] 14.2 `setup.ts`: detecta runtime; aborta com `EXIT_NO_RUNTIME` se ausente; chama `installAll`; cria state; smoke test do MCP server
- [x] 14.3 `setup.ts` idempotencia: se state.json existe e hash bate -> reportar e retornar 0
- [x] 14.4 `setup.ts --force`: re-instala mesmo se hash bate
- [x] 14.5 `update.ts`: chama `installAll({ force: true })`, reporta `.bak` criados
- [x] 14.6 `doctor.ts`: agrega checks (Node, runtime, skills, state, MCP smoke); exit 0 se tudo ok, exit != 0 se algo falha
- [x] 14.7 Smoke test do MCP server: spawn -> list_tools (espera 3 tools) -> shutdown
- [x] 14.8 Mensagens de erro acionaveis (path, comando sugerido)
- [x] 14.9 Testes setup: cenarios "vazio", "ja configurado", "sem runtime"
- [x] 14.10 Testes update: hash igual = no-op; hash diferente = `.bak`
- [x] 14.11 Testes doctor: reporta corretamente cada falha sintetica

## Sequenciamento

- Bloqueado por: 12.0 (e indiretamente 2.0, 4.0 — runtime-detector, e 3.0 para o smoke test do MCP)
- Desbloqueia: 15.0
- Paralelizavel: Nao

## Rastreabilidade

- Esta tarefa cobre: RF-01 (setup, idempotencia, mensagem de erro acionavel), parte de RF-02 (atualizacao preservando customizacoes via `.bak`)
- Evidencia esperada: 3 cenarios setup + 2 cenarios update + 3 cenarios doctor, todos passam.

## Detalhes de Implementacao

**Smoke test MCP (em setup):**

```typescript
const handle = createMcpServer({ onToolCall: () => {} });
await handle.start();
// usar client mock para listar tools e validar 3 nomes esperados
const tools = await listToolsViaInternalApi(handle);
assert(tools.includes("report_implementer_result") &&
       tools.includes("report_review_result") &&
       tools.includes("report_finalizer_result"));
await handle.stop();
```

**Mapeamento de exit codes (TechSpec):**

| Erro | Exit |
|---|---|
| Setup sem agent ACP | 1 |
| Setup ok / idempotente | 0 |
| `tasks.md` ausente (run) | 2 |
| Runtime indisponivel (run) | 3 |
| Halt retries esgotados | 10 |
| Halt committed=false | 11 |
| Halt contrato violado | 12 |

**Convencoes da stack:**

- Sem `any`
- Cada comando exporta uma funcao `async function runX(opts): Promise<number>` (exit code)
- `index.ts` apenas faz parse de args e despacha
- Stderr para erros fatais; stdout para output humano

## Criterios de Sucesso (Verificaveis)

- [x] Testes passam: `npm test --workspace=@looping-agent/cli -- commands`
- [x] Cobertura >= 70%
- [x] `setup` em diretorio limpo cria 19 skills + state + retorna 0
- [x] `setup` sem runtime -> exit 1 + mensagem com lista de runtimes
- [x] `setup` repetido -> exit 0 + `unchanged.length === 19`
- [x] `update` com skill modificada -> `.bak` criado (verificar `.bak` no FS de teste)
- [x] `doctor` reporta falha sintetica (skill ausente) com exit code != 0
- [x] Build compila
