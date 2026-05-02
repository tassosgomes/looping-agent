# Runtime and Model Selection Roadmap

This roadmap covers three related changes for the `looping-agent run` flow:

1. replace the deprecated ACP SDK package
2. stop fragmented streamed agent logs in the terminal
3. let users choose the tool/runtime and model independently

## Current Findings

- The CLI currently exposes only `--runtime <name>`.
- The renderer writes every `agent_message_chunk` notification as a new line,
  which breaks streamed text into outputs such as `[agent] En`, `[agent] cont`,
  `[agent] rei`.
- The deprecated ACP SDK package in the repo is
  `@zed-industries/agent-client-protocol@0.4.5`.
- The replacement package on npm is `@agentclientprotocol/sdk@0.21.0`.
- The current ACP protocol docs describe session configuration through
  `configOptions`, including selectors categorized as `model` and `mode`.
- The locally installed `copilot` CLI already exposes `--model` and `--mode`
  flags, but support should still be treated as capability-based at the ACP
  session layer instead of hardcoded per runtime.

## Workstream 1: Terminal Log Rendering

Status: completed in the current branch.

Scope:

- Coalesce consecutive `agent_message_chunk` notifications before writing a
  terminal line.
- Flush the buffered agent text before tool events, phase endings, task endings,
  halt output, and final run output.
- Keep `--verbose` and `--debug` raw progress output unchanged.

Validation:

- Add a renderer regression test proving `En` + `cont` + `rei` becomes a single
  `[agent] Encontrei` line.

## Workstream 2: ACP SDK Migration

Priority: high.

Why this is not just a package rename:

- The deprecated package version in use today is `0.4.5`.
- The replacement package is already at `0.21.0`.
- Current ACP docs emphasize `configOptions` for session configuration, which
  means the adapter around `newSession()` and session configuration needs a
  compatibility review.

Implementation steps:

1. Replace package references in:
   - `packages/orchestrator/package.json`
   - `packages/cli/package.json`
   - `packages/cli/scripts/bundle.mjs`
   - `packages/orchestrator/src/acp-client.ts`
2. Keep the ACP SDK isolated behind `acp-client.ts` so protocol changes stay in
   one adapter.
3. Normalize session capabilities in the adapter so the rest of the code can
   consume a stable internal shape regardless of whether the runtime returns:
   - legacy `models` / `modes`
   - newer `configOptions` with `category: model` or `category: mode`
4. Re-verify:
   - session initialization
   - `newSession()` response parsing
   - `prompt()` final result handling
   - `sessionUpdate` notification mapping

Validation:

- `npm run build`
- `npm run test`
- `npm run lint`
- one real ACP smoke run with an installed runtime

## Workstream 3: Runtime vs Model UX

Priority: high.

Desired user-facing behavior:

- Users should choose the tool independently from the model.
- The CLI should keep a stable low-level runtime override for scripts.
- The CLI should fail clearly when a runtime does not expose model selection.

Proposed CLI surface:

```bash
looping-agent run --prd-dir tasks/prd-demo --tool copilot --model gpt-5.4
looping-agent run --prd-dir tasks/prd-demo --tool claude --model opus
looping-agent run --prd-dir tasks/prd-demo --runtime copilot-acp --model gpt-5.4
```

Recommended behavior:

- Keep `--runtime` for backward compatibility.
- Add `--tool <claude|codex|copilot>` as the friendly selector.
- Add `--model <id>` to request a model.
- Resolve `--tool` into the current runtime identifiers:
  - `claude` -> `claude-agent-acp`
  - `codex` -> `codex-acp`
  - `copilot` -> `copilot-acp`
- Reject `--tool` combined with a conflicting `--runtime`.

Session behavior:

1. Detect the runtime as today.
2. Open the ACP session.
3. Read exposed model or config-option capabilities from the session.
4. If `--model` was requested and the runtime exposes a matching ACP selector,
   apply it through the ACP session.
5. If the runtime does not expose model selection, fail with a clear message
   instead of silently ignoring the flag.

Recommended follow-up UX:

- Add `looping-agent doctor` output for supported runtime capabilities.
- Consider a future `--list-models` mode if the supported runtimes expose model
  inventories consistently.

## Workstream 4: Documentation and Verification

Scope:

- Update `docs/cli-usage.md` after the CLI flags are implemented.
- Add one focused test for CLI option parsing and conflict handling.
- Re-run the local tarball install flow with:

```bash
npm run install:local-cli -- /absolute/path/to/other-repo
```

## Suggested Delivery Order

1. Land the renderer fix.
2. Migrate the ACP SDK behind the existing adapter.
3. Add `--tool` and `--model` with capability-based session negotiation.
4. Update docs and re-run the external install validation.

## Delivery Risk

- Log rendering is low risk.
- CLI flag parsing is low to medium risk.
- ACP SDK migration is medium risk because the package rename comes with a large
  protocol-version gap.
- Model selection is medium risk because some runtimes may expose selection via
  ACP, some via CLI startup flags, and some may not expose it at all.