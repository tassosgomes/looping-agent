# Architecture

This document is the external-facing architecture summary for Looping Agent.
It intentionally stays shorter than the implementation TechSpec while preserving
the core shape of the system and the architectural decisions that matter to users
and contributors.

For the full implementation detail, read the
[TechSpec](../tasks/prd-orquestrador-em-codigo/techspec.md).

## System Overview

Looping Agent is a Node.js CLI that coordinates a deterministic workflow around
ACP-capable runtimes. The system bundles 19 `flow-*` skills, installs them into
the current project under `.agents/skills` with a `.claude/skills`
compatibility symlink, opens a local MCP server for completion tools, and
drives a three-phase loop for each pending task.

The three execution phases are:

1. `implementer`
2. `reviewer`
3. `finalizer`

The orchestrator does not try to be intelligent by itself. The workflow logic
mostly lives in the bundled skills and in the explicit retry rules enforced by
code.

## Component Diagram

```text
┌──────────────────── @looping-agent/cli ────────────────────┐
│ setup | update | run | doctor                              │
│ argument parsing, terminal UI, user-facing exit codes      │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌──────────────── @looping-agent/orchestrator ───────────────┐
│ reads tasks.md                                             │
│ runs implementer -> reviewer -> finalizer                  │
│ applies retry/halt rules                                   │
│ writes task telemetry and run summaries                    │
└───────────────┬───────────────────────────────┬────────────┘
                │                               │
                │ ACP session                   │ JSON files
                ▼                               ▼
┌──────── ACP runtime ────────┐      ┌───── tasks/prd-*/telemetry/ ─────┐
│ Claude / Codex / Copilot    │      │ N_telemetry.json                 │
│ executes bundled skills     │      │ N_telemetry/*.jsonl              │
│ invokes completion tools    │      │ run-summary-*.json               │
└──────────────┬──────────────┘      └──────────────────────────────────┘
               │
               ▼
┌──────────────── @looping-agent/mcp-server ────────────────┐
│ report_implementer_result                                  │
│ report_review_result                                       │
│ report_finalizer_result                                    │
│ schema validation for tool inputs                          │
└────────────────────────────────────────────────────────────┘
```

## Package Responsibilities

`packages/cli`

- exposes the `looping-agent` executable
- implements `setup`, `update`, `run`, and `doctor`
- renders progress, halt reasons, and summary paths in the terminal

`packages/orchestrator`

- reads pending tasks from `tasks.md`
- detects or accepts the target runtime
- coordinates the phase loop and retry policy
- persists task telemetry and run summaries

`packages/mcp-server`

- exposes the three `report_*` completion tools
- keeps the tool interface versioned with the product
- gives ACP runtimes a single MCP surface independent of runtime-specific adapters

`packages/schemas`

- holds shared Zod schemas for tool payloads, skill frontmatter, state, and telemetry
- ensures CLI, orchestrator, and MCP server validate the same contracts

## Task Execution Flow

At runtime, one task follows this path:

1. The orchestrator reads `tasks.md` and selects the next pending task.
2. It opens the `implementer` session and waits for
   `report_implementer_result`.
3. If implementation succeeds, it opens the `reviewer` session and waits for
   `report_review_result`.
4. If review requires rework, the task returns to `implementer` with the review
   issues injected into the retry prompt.
5. If review approves, it opens the `finalizer` session and waits for
   `report_finalizer_result`.
6. If the finalizer reports `committed: false`, the run halts immediately.
7. Every attempt writes telemetry, including stop reasons, token usage when
   available, tool-call metadata, and notification log paths.

## Telemetry Layout

Telemetry follows the product decision from ADR-003: one summary JSON per task in
the PRD directory, plus raw ACP notification logs as JSONL.

```text
tasks/prd-<slug>/telemetry/
├── 1_telemetry.json
├── 1_telemetry/
│   ├── implementer-attempt-1-notifications.jsonl
│   ├── reviewer-attempt-1-notifications.jsonl
│   └── finalizer-attempt-1-notifications.jsonl
└── run-summary-<timestamp>.json
```

This keeps debugging local to the PRD package instead of relying on a global
database or daemon.

## Main Architecture Decisions

- [ADR-001](../tasks/prd-orquestrador-em-codigo/adrs/adr-001.md): TypeScript +
  Node.js >= 20, distributed as an npm CLI.
- [ADR-002](../tasks/prd-orquestrador-em-codigo/adrs/adr-002.md): the
  completion tools are exposed by a local MCP server hosted by the product.
- [ADR-003](../tasks/prd-orquestrador-em-codigo/adrs/adr-003.md): telemetry is
  stored as JSON files inside the PRD directory.
- [ADR-004](../tasks/prd-orquestrador-em-codigo/adrs/adr-004.md): skills are
  installed in project scope and refreshed with `.bak` backups on update.
- [ADR-005](../tasks/prd-orquestrador-em-codigo/adrs/adr-005.md): missing
  `completion_tool` invocations trigger retry-with-reinforcement and can halt the
  run when retries are exhausted.

## Design Constraints Worth Remembering

- The product assumes one local execution at a time.
- The orchestrator is deterministic about retry and halt decisions.
- Skills are the main extension point; the orchestrator enforces contracts around
  them instead of replacing them.
- The MCP server and the schemas ship with the CLI so runtimes do not need
  custom adapters per vendor.

## Related Docs

- [README](../README.md)
- [CLI usage](cli-usage.md)
- [Skills customization](skills-customization.md)
- [Troubleshooting](troubleshooting.md)
