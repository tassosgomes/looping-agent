---
status: completed
parallelizable: true
blocked_by: [2.0]
---

<task_context>
<domain>engine/orchestrator</domain>
<type>integration</type>
<scope>core_feature</scope>
<complexity>high</complexity>
<dependencies>external_apis</dependencies>
<unblocks>"10.0,14.0"</unblocks>
</task_context>

# Tarefa 4.0: Orchestrator — ACP client + runtime detector

## Relacionada as User Stories

- US: detectar agentes presentes (Claude/Codex)
- US: invocar orquestrador via CLI sobre PRD (suporte)

## Visao Geral

Implementar a camada de cliente ACP (wrapper sobre `@zed-industries/agent-client-protocol`)
e o detector de runtime que encontra `claude-agent-acp`, `codex-acp` ou `copilot --acp` no
PATH. O wrapper abstrai a abertura de sessao, envio de `session/prompt`, escuta de
notificacoes `session/update` e captura do `stopReason` final. Permite mock para testes
do PhaseRunner.

## Requisitos

- API tipada e independente da SDK ACP especifica (wrapper que isole breaking changes)
- Streaming de notificacoes via `AsyncIterable<AcpNotification>` ou EventEmitter tipado
- Detector identifica runtime no PATH e retorna versao + path absoluto
- Falha de spawn ou versao ausente -> exception clara com remediacao
- Suporte a modo mock para testes (interface injetavel)
- **Pinar a ultima versao estavel** de `@zed-industries/agent-client-protocol`
  disponivel no momento de iniciar esta task (decisao registrada na TechSpec
  "Questoes em Aberto"). Documentar a versao pinada em comentario no
  `acp-client.ts` e em `docs/architecture.md` (task 17.0).

## Arquivos Envolvidos

- **Criar:**
  - `packages/orchestrator/src/acp-client.ts` (wrapper sobre SDK ACP)
  - `packages/orchestrator/src/runtime-detector.ts` (detecta `claude-agent-acp`/`codex-acp`/`copilot`)
  - `packages/orchestrator/src/acp-types.ts` (tipos: `AcpNotification`, `AcpStopReason`, `AcpSession`)
  - `packages/orchestrator/test/runtime-detector.test.ts`
  - `packages/orchestrator/test/acp-client.test.ts`
- **Modificar:**
  - `packages/orchestrator/package.json` (deps: `@zed-industries/agent-client-protocol`, `@looping-agent/schemas`)
- **Referencia:**
  - `tasks/prd-orquestrador-em-codigo/techspec.md` secao "Diagrama de Componentes" + "Pontos de Integracao"
  - `tasks/prd-orquestrador-em-codigo/prd.md` RF-03 (criterios sobre `stopReason`, `session/update`)
  - `tasks/prd-orquestrador-em-codigo/adrs/adr-001.md`
- **Skills para consultar durante implementacao:**
  - (sem skill especifica) — TechSpec define o contrato

## Subtarefas

- [x] 4.1 Definir `AcpNotification` como uniao discriminada (`plan`, `agent_message_chunk`, `tool_call`, `tool_call_update`)
- [x] 4.2 Definir `AcpStopReason` enum (`end_turn`, `refusal`, `max_tokens`, `max_turn_requests`, `error`)
- [x] 4.3 Implementar `runtime-detector.ts` (PATH lookup + flag de versao via `--version` quando disponivel)
- [x] 4.4 Implementar `acp-client.ts`: spawn do runtime, abertura de sessao, `sendPrompt(text)`, `onNotification(cb)`, `awaitFinal()` retornando `{ stopReason, tokens? }`
- [x] 4.5 Garantir cleanup do processo filho em todos os caminhos (success/error)
- [x] 4.6 Tipar tokens como `{ input: number; output: number } | null` (null = runtime nao reporta)
- [x] 4.7 Testes: detector com PATH simulado (mock `child_process.spawn` ou usar fake exec)
- [x] 4.8 Testes: ACP client com runtime fake que emite notificacoes em ordem conhecida

## Sequenciamento

- Bloqueado por: 2.0
- Desbloqueia: 10.0, 14.0
- Paralelizavel: Sim (paralelo a 3.0, 5.0, 6.0, 7.0, 8.0, 9.0)

## Rastreabilidade

- Esta tarefa cobre: RF-03 (sessao ACP por fase, captura de `session/update`, deteccao de runtime indisponivel)
- Evidencia esperada: testes demonstram spawn+kill limpo, parsing correto de notificacoes mockadas, e exception clara quando runtime nao detectado.

## Detalhes de Implementacao

**Interface sugerida:**

```typescript
// packages/orchestrator/src/acp-types.ts
export type AcpStopReason =
  | "end_turn" | "refusal" | "max_tokens" | "max_turn_requests" | "error";

export type AcpNotification =
  | { type: "plan"; content: unknown }
  | { type: "agent_message_chunk"; text: string }
  | { type: "tool_call"; name: string; input: unknown; id: string }
  | { type: "tool_call_update"; id: string; status: string; output?: unknown };

export interface AcpFinalResult {
  stopReason: AcpStopReason;
  tokens: { input: number; output: number } | null;
}

// packages/orchestrator/src/acp-client.ts
export interface AcpSession {
  sendPrompt(text: string): Promise<void>;
  onNotification(cb: (n: AcpNotification) => void): void;
  awaitFinal(): Promise<AcpFinalResult>;
  close(): Promise<void>;
}

export interface AcpClient {
  openSession(opts: {
    runtime: DetectedRuntime;
    mcpEndpoint: string; // path/URL do MCP server local para o runtime conectar
  }): Promise<AcpSession>;
}
```

**Detector:**

```typescript
// packages/orchestrator/src/runtime-detector.ts
export type RuntimeKind = "claude-agent-acp" | "codex-acp" | "copilot-acp";
export interface DetectedRuntime {
  kind: RuntimeKind;
  binary: string; // ex: "claude-agent-acp"
  args: string[]; // ex: ["--acp"] para copilot
  path: string;   // path absoluto resolvido
  version: string | null;
}

export async function detectRuntime(preferred?: RuntimeKind): Promise<DetectedRuntime>;
```

**Convencoes da stack:**

- Sem `any` (usar `unknown` e parse via Zod quando o input vem de fora)
- Sempre limpar processo filho com `child.kill()` em finally
- Streaming via callback (mais simples) ou `AsyncIterable` se preferido pelo time
- Logar via stderr apenas em modo debug (nao poluir UI do CLI)

## Criterios de Sucesso (Verificaveis)

- [x] Testes passam: `npm test --workspace=@looping-agent/orchestrator -- runtime-detector acp-client`
- [x] Build compila sem erro
- [x] Detector retorna `null`/throw com mensagem listando runtimes esperados quando PATH vazio
- [x] ACP client cleanup verificado: filho terminado em sucesso, falha e cancelamento
- [x] Mock de runtime emite sequencia de notificacoes e cliente entrega cada uma na ordem
- [x] `stopReason: refusal` parseado corretamente do payload final
