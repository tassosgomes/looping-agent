# Looping Agent

Looping Agent is an installable CLI and deterministic orchestrator for the
Implementer -> Reviewer -> Finalizer loop over ACP.

The product bundles 19 `flow-*` skills, installs them into the current project,
opens a local MCP server for the `report_*` completion tools, and writes
structured telemetry for every task execution.

This repository contains the source monorepo. The product entrypoint exposed to
users is the `looping-agent` CLI shipped by `@looping-agent/cli`.

The other workspace packages are internal implementation details of this
monorepo and are not meant to be published or installed directly.

## Requirements

- Node.js >= 20
- One ACP-capable runtime installed and available on `PATH` (see below)
- A preferred agent that reads project-scoped skills from `.agents/skills/` or
  can consume the compatibility link at `.claude/skills/`

### Supported ACP runtimes

The looping-agent does not bundle the runtime. Install one of the wrappers
below — the CLI auto-detects whichever is on `PATH`. Each runtime authenticates
separately (Anthropic, OpenAI/ChatGPT, GitHub) the first time you launch it.

| Kind (`--runtime`) | Binary on `PATH` | Install | Notes |
|---|---|---|---|
| `claude-agent-acp` (alias `claude-acp`) | `claude-code-acp` | `npm i -g @agentclientprotocol/claude-agent-acp` | Wraps Claude Code via ACP. The standalone `claude` CLI does not speak ACP. |
| `codex-acp` | `codex-acp` | `npm i -g @zed-industries/codex-acp` | Wraps OpenAI Codex via ACP. The standalone `codex` CLI does not speak ACP. |
| `copilot-acp` | `copilot` (with `--acp`) | `npm i -g @github/copilot` | ACP mode is built in. Run `copilot` once interactively to authenticate before using the loop. |

If runtime auto-detection is ambiguous, pass `--runtime <kind>` to
`looping-agent run`. Run `looping-agent doctor` to verify which runtime is
detected and to get the exact install command when none is found.

## What The CLI Installs

Running `looping-agent setup` in a project prepares these assets:

- `.agents/skills/flow-*/SKILL.md` with the bundled workflow skills
- `.claude/skills -> ../.agents/skills` as Claude compatibility symlink
- `.claude/.looping-agent-state.json` with the installed version and skill hashes
- project-scoped skill layout suitable for local customization and git review

Telemetry is created lazily on the first execution of `looping-agent run` under
`tasks/prd-<slug>/telemetry/`.

## Quickstart

1. Install the CLI globally.

```bash
npm install -g @looping-agent/cli
```

For a local installation test in another repository before publishing:

```bash
npm run install:local-cli -- /absolute/path/to/other-repo
```

That command builds the monorepo, packs `@looping-agent/cli`, installs the
resulting tarball into the target repository, and runs `looping-agent --help`
there to prove the install worked.

If the target repository does not have a `package.json`, the helper
automatically falls back to a transient `--no-save` install so you can still
test the CLI in a non-Node repository.

1. Enter your target project and install the bundled skills.

```bash
cd /seu/projeto
looping-agent setup
```

1. Use the planning skills in your preferred agent to create the PRD package.

```text
Use flow-prd-creator to create tasks/prd-minha-feature/prd.md
Use flow-techspec-creator to create tasks/prd-minha-feature/techspec.md
Use flow-task-creator to create tasks/prd-minha-feature/tasks.md
```

1. Execute the orchestrator for that PRD directory.

```bash
looping-agent run --prd-dir tasks/prd-minha-feature
```

1. Inspect the generated telemetry and run summary.

```text
tasks/prd-minha-feature/
└── telemetry/
    ├── 1_telemetry.json
    ├── 1_telemetry/
    │   ├── implementer-attempt-1-notifications.jsonl
    │   ├── reviewer-attempt-1-notifications.jsonl
    │   └── finalizer-attempt-1-notifications.jsonl
    └── run-summary-YYYY-MM-DDTHH-mm-ss-sssZ.json
```

## Daily Workflow

For most projects, the operational loop looks like this:

1. `looping-agent setup` once per repository clone.
1. Generate `prd.md`, `techspec.md`, and `tasks.md` with the bundled planning
   skills.
1. Run `looping-agent doctor` whenever runtime detection or skill drift is in
   doubt.
1. Run `looping-agent run --prd-dir tasks/prd-<slug>` to execute pending tasks.
1. Open `telemetry/` when a phase halts, retries too much, or needs audit data.
1. Run `looping-agent update` when upgrading the bundled skill set.

## Core Commands

The CLI surface is intentionally small:

- `looping-agent setup` installs or refreshes the project-scoped skill layout.
- `looping-agent update` applies newer bundled skills and preserves local edits
  in `.bak` backups when needed.
- `looping-agent run --prd-dir <path>` executes the deterministic loop for the
  PRD directory.
- `looping-agent doctor` validates Node, runtime detection, state, skills,
  pending backups, and MCP availability.

`looping-agent` with no arguments prints help.

## Telemetry Model

Each task gets one summary JSON file and one directory of raw ACP notifications.
That split keeps the main file readable while preserving the complete trace for
debugging.

Important fields in `N_telemetry.json`:

- `status`: `completed` or `halted`
- `halt_reason`: populated only when the loop stops early
- `phases[].attempts[].stop_reason`: ACP stop reason for each attempt
- `phases[].attempts[].completion_tool_invoked`: whether the phase respected the
  `completion_tool` contract
- `summary.total_iterations`: total number of attempts across all phases
- `summary.total_tokens`: aggregated token counts when the runtime reports them

The run-level summary is stored separately as
`telemetry/run-summary-<timestamp>.json`.

## Repository Packages

The monorepo is split into four packages:

- `packages/cli`: command parsing, terminal UI, setup/update/doctor/run
- `packages/orchestrator`: task loop, retries, runtime sessions, telemetry
- `packages/mcp-server`: local MCP server exposing `report_*` tools
- `packages/schemas`: shared Zod schemas and TypeScript types

Only `packages/cli` is intended as a distributable package. The remaining
packages stay private to the workspace.

## Documentation Map

- [CLI usage](docs/cli-usage.md)
- [Skills customization](docs/skills-customization.md)
- [Architecture](docs/architecture.md)
- [Troubleshooting](docs/troubleshooting.md)

## Updating Skills Safely

Project-scoped customizations live under `.agents/skills/`. The `.claude/skills`
path is kept only as a compatibility symlink for tools that still look there.
When `update` detects local edits relative to the recorded install state, it
renames the old skill directory to `.bak` and installs the new bundled copy.

That means the expected workflow is:

1. edit the installed project copy
1. commit those changes to git
1. run `looping-agent update`
1. diff the new skill against `flow-*.bak/`
1. reapply only the intended local customizations

The backup is a review aid, not the canonical source of truth.

## Further Reading

These repository documents contain the full implementation detail behind the
external docs in `docs/`: