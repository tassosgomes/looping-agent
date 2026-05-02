# CLI Usage

The `looping-agent` executable exposes four operational commands: `setup`,
`update`, `run`, and `doctor`.

By default, running `looping-agent` with no arguments prints help. All commands
support `--no-color` for plain terminal output.

## Standalone Install

The published CLI package is self-contained for the Looping Agent code and the
bundled `skills/` payload. You only need to install `@looping-agent/cli` in the
target repository.

For a local distribution test before publishing:

```bash
npm run install:local-cli -- /absolute/path/to/other-repo
```

By default the helper script rebuilds the monorepo, packs the CLI, installs the
generated tarball into the target repository, and verifies the installed binary
with `npx --no-install looping-agent --help`.

If the target repository has no `package.json`, the helper automatically uses a
transient `--no-save` install instead of failing.

Useful flags:

```bash
npm run install:local-cli -- /absolute/path/to/other-repo --no-save
npm run install:local-cli -- /absolute/path/to/other-repo --skip-build
```

You do not need to publish `@looping-agent/orchestrator`,
`@looping-agent/mcp-server`, or `@looping-agent/schemas` separately for the CLI
to work in another repository.

## `setup`

`setup` prepares the current repository for Looping Agent usage.

It does three things:

1. detects an ACP runtime on `PATH`
2. installs the 19 bundled skills into `.agents/skills/`
3. creates `.claude/skills -> ../.agents/skills`, writes
   `.claude/.looping-agent-state.json`, and runs an MCP smoke test

Examples:

```bash
looping-agent setup
looping-agent setup --force
looping-agent setup --no-color
```

Use `--force` when the project state looks inconsistent and you want a clean
reinstall of the bundled skill set.

## `update`

`update` refreshes the installed project-scoped skills from the bundled copies.

Examples:

```bash
looping-agent update
looping-agent update --force
```

Behavior to expect:

- unchanged installed skills are left alone
- changed installed skills are overwritten from the bundled source
- locally customized skills are first moved to `flow-*.bak/`
- the state file is updated with the new canonical hashes

If backups are created, the command prints the affected skill names and the path
to `.agents/skills/` so you can review them immediately.

## `run`

`run` executes the deterministic Implementer -> Reviewer -> Finalizer loop for a
PRD directory.

Required option:

- `--prd-dir <path>`: path to the PRD directory that contains `tasks.md`

Optional flags:

- `--max-retries <n>`: maximum retries per phase, default `3`
- `--runtime <name>`: override runtime auto-detection
- `--verbose`: print raw progress events to stderr
- `--debug`: include full notification payloads and verbose progress
- `--no-color`: disable ANSI output

Examples:

```bash
looping-agent run --prd-dir tasks/prd-orquestrador-em-codigo
looping-agent run --prd-dir tasks/prd-orquestrador-em-codigo --max-retries 5
looping-agent run --prd-dir tasks/prd-orquestrador-em-codigo --runtime claude-acp
looping-agent run --prd-dir tasks/prd-orquestrador-em-codigo \
  --runtime codex-acp --debug
```

Supported values for `--runtime`:

- `claude-agent-acp`
- `claude-acp`
- `codex-acp`
- `copilot-acp`

Important runtime behavior:

- the path is resolved relative to the current working directory
- missing `tasks.md` returns exit code `2`
- runtime detection failure during `run` returns exit code `3`
- halted executions always write run telemetry before exiting

## `doctor`

`doctor` is the fastest way to validate the local environment before or after a
failed run.

Examples:

```bash
looping-agent doctor
looping-agent doctor --no-color
```

The command checks:

- Node version (`>= 20`)
- ACP runtime detection
- bundled source skill availability
- `.claude/.looping-agent-state.json`
- installed skill presence and hash consistency
- `.claude/skills` compatibility symlink consistency
- pending `.bak` backups
- MCP server smoke test
  (`listTools()` returning the 3 `report_*` tools)

If any check fails, `doctor` exits non-zero and suggests rerunning `setup` or
`update --force`.

## Exit Codes

The CLI uses small, deterministic exit codes so scripts can react to outcomes.

- `0`: success
- `1`: `setup`, `update`, or `doctor` failed due to runtime, install,
  state, or smoke-test issues
- `2`: `run` could not resolve `--prd-dir` or find `tasks.md`
- `3`: `run` could not use the requested or detected runtime
- `10`: halt because retries were exhausted
- `11`: halt because the finalizer reported `committed: false`
- `12`: halt because the phase contract became unrecoverable, typically
  after repeated missing `completion_tool` invocations
- `130`: interrupted with `Ctrl+C`

## Typical Command Sequence

For a clean repository bootstrap:

```bash
looping-agent setup
looping-agent doctor
looping-agent run --prd-dir tasks/prd-minha-feature
```

For a skill upgrade in an already customized project:

```bash
looping-agent update
looping-agent doctor
diff -ru .agents/skills/flow-reviewer.bak .agents/skills/flow-reviewer
```

## Related Docs

- [README](../README.md)
- [Skills customization](skills-customization.md)
- [Troubleshooting](troubleshooting.md)
