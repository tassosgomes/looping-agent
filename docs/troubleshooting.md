# Troubleshooting

This guide covers the most common failures seen during `setup`, `doctor`, and
`run`.

When in doubt, start with:

```bash
looping-agent doctor
```

That command checks runtime detection, skill state, pending backups, and MCP
availability before you spend time debugging a failed run.

## Runtime ACP Not Detected

Symptoms:

- `looping-agent setup` exits with code `1`
- `looping-agent run` exits with code `3`
- the error mentions that no ACP runtime was detected on `PATH`

What it means:

The CLI could not find a supported runtime binary for Claude, Codex, or Copilot.

What to inspect:

- `node --version` and confirm Node >= 20
- whether the runtime executable is installed and visible on `PATH`
- whether `looping-agent doctor` reports `Runtime: FAIL`

What to do next:

1. Install or fix the target runtime.
2. Reopen the shell so `PATH` is refreshed.
3. Retry `looping-agent doctor`.
4. If multiple runtimes are installed, pass `--runtime <name>` explicitly.

## Setup Failed On The MCP Smoke Test

Symptoms:

- `looping-agent setup` installs files but ends with `MCP smoke test failed`
- `doctor` also reports `MCP smoke: FAIL`

What it means:

The local MCP server did not expose the expected tool list during the smoke test.
The product expects exactly these tools:

- `report_implementer_result`
- `report_review_result`
- `report_finalizer_result`

What to inspect:

- the full `setup` output
- whether the local install is complete
- whether `looping-agent doctor` fails only in the MCP section or also in
    skill/state checks

What to do next:

1. Rerun `looping-agent setup --force`.
2. If that still fails, run `looping-agent doctor` and confirm whether the
    issue is isolated to the MCP smoke test.
3. Reinstall the CLI package if the local product install looks incomplete.

## Halt Because Retries Were Exhausted

Symptoms:

- `looping-agent run` exits with code `10`
- terminal output reports a halt related to retries

What it means:

One phase kept failing until it consumed the retry budget. The default budget is
`3` attempts per phase.

Where to look:

- `tasks/prd-<slug>/telemetry/<N>_telemetry.json`
- `tasks/prd-<slug>/telemetry/<N>_telemetry/<phase>-attempt-<n>-notifications.jsonl`
- `tasks/prd-<slug>/telemetry/run-summary-*.json`

What to inspect inside telemetry:

- `halt_reason`
- `phases[].attempts[].stop_reason`
- `phases[].attempts[].completion_input`
- reviewer issues that keep sending the task back to rework

What to do next:

1. Identify which phase exhausted retries.
2. Read the last valid `completion_input` for that phase.
3. If the reviewer keeps requiring rework, inspect the reported issues and fix
    the underlying task or skill prompt.
4. If the runtime is repeatedly stopping for token or refusal reasons, rerun
    with `--debug` and inspect the raw notification logs.

## Halt Because The Finalizer Reported `committed: false`

Symptoms:

- `looping-agent run` exits with code `11`
- the halt happens in the `finalizer` phase

What it means:

The finalizer completed the phase contract but explicitly reported that it did not
produce a commit. This is a hard stop by design.

Where to look:

- the `finalizer` attempt inside `N_telemetry.json`
- `completion_input.committed`
- any summary or issue text returned by the phase

How to interpret it:

- this is not a missing tool-call problem
- this is not a runtime detection problem
- it means the finalizer concluded it could not safely commit the work

What to do next:

1. Inspect the repository state and unresolved changes.
2. Check whether the reviewer or implementer left unresolved failures earlier
    in the task.
3. Fix the blocking condition, then rerun the task.

## Halt Because The Phase Contract Was Violated

Symptoms:

- `looping-agent run` exits with code `12`
- telemetry ends with `halt_reason: "contract_violation_unrecoverable"`
- one or more attempts show `completion_tool_invoked: false`

What it means:

The ACP session ended without invoking the required `completion_tool` for the
phase, and retries were eventually exhausted.

Common causes:

- the runtime never saw the tool list
- the phase skill was customized incorrectly
- the agent answered with plain text and skipped the tool call

Where to look:

- `phases[].attempts[].completion_tool_invoked`
- `phases[].attempts[].stop_reason`
- raw notification JSONL for missing `tool_call` events
- customized copies of `.agents/skills/flow-implementer/`,
  `.agents/skills/flow-reviewer/`, or `.agents/skills/flow-finalizer/`

What to do next:

1. Run `looping-agent doctor` to confirm the MCP smoke test is healthy.
2. Check whether phase-skill frontmatter still declares the expected
    `completion_tool`.
3. If the skill was customized, compare it with the bundled version or a `.bak`
    backup.
4. Rerun with `--debug` so the notification trace is easier to inspect.

## Pending `.bak` Backups Keep Showing Up In `doctor`

Symptoms:

- `looping-agent doctor` reports `Pending backups: FAIL`
- `.agents/skills/flow-*.bak/` directories remain after an `update`

What it means:

`update` detected local customizations and preserved the previous copy for manual
review. The product leaves that decision to the repository owner.

What to do next:

1. Diff the backup against the newly installed skill.
2. Reapply only the intended local changes.
3. Commit the reconciled skill version to git.
4. Remove the stale `.bak` directory.
5. Rerun `looping-agent doctor`.

## Claude Compatibility Link Is Missing Or Wrong

Symptoms:

- `looping-agent doctor` reports `Claude compat: FAIL`
- a Claude-oriented tool no longer sees the project skills

What it means:

The compatibility symlink at `.claude/skills` is missing or points somewhere
other than `.agents/skills`.

What to do next:

1. Run `looping-agent update --force` or `looping-agent setup --force`.
2. If the path still conflicts, inspect whether `.claude/skills` already exists
   as a real directory or custom symlink.
3. Reconcile that path manually, then rerun `looping-agent doctor`.

## `run` Says `tasks.md` Is Missing

Symptoms:

- `looping-agent run --prd-dir ...` exits with code `2`
- output says it could not find `tasks.md`

What it means:

The target directory exists, but it is not a valid PRD package for the
orchestrator yet.

What to do next:

1. Confirm the path passed to `--prd-dir` is correct relative to the current
    directory.
2. Make sure the planning skills already generated `prd.md`, `techspec.md`, and
    `tasks.md`.
3. Retry the command with the PRD directory path, not the `tasks.md` file path.

## Related Docs

- [README](../README.md)
- [CLI usage](cli-usage.md)
- [Skills customization](skills-customization.md)
- [Architecture](architecture.md)
