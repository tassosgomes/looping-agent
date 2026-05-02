# Skills Customization

Looping Agent installs skills in the project scope, not globally. That choice is
intentional: each repository can version, review, and evolve its own `flow-*`
customizations.

The canonical installed location is:

```text
<repo>/.agents/skills/<skill-name>/SKILL.md
```

For Claude-oriented tooling compatibility, `setup` and `update` also maintain:

```text
<repo>/.claude/skills -> ../.agents/skills
```

The install state used by `setup`, `update`, and `doctor` lives at:

```text
<repo>/.claude/.looping-agent-state.json
```

## Recommended Workflow

1. Install the bundled skills with `looping-agent setup`.
2. Edit the project copy in `.agents/skills/`, not the source copy under
   `skills/` in this repository.
3. Commit the customized skill to git so the repository, not the `.bak` backup,
   becomes the source of truth.
4. When a newer product version is installed, run `looping-agent update`.
5. Review any generated `.bak` backup, reapply the intended local changes, and
   remove the stale backup after reconciliation.

## What `.bak` Means

`update` compares the installed skill hash with the hash recorded at install time.
When they differ, the command assumes the project copy was modified locally.

In that case, it does this:

1. renames the installed directory to `<skill-name>.bak/`
2. writes the fresh bundled version to `<skill-name>/`
3. reports the backup path in CLI output

Example:

```text
.agents/skills/
├── flow-reviewer/
│   └── SKILL.md
└── flow-reviewer.bak/
    └── SKILL.md
```

Important details from ADR-004:

- backups do not rotate
- a newer `update` overwrites the previous `.bak`
- `.bak` is a review artifact, not an automatic merge mechanism
- `looping-agent doctor` lists backups that still require manual review

## Safe Customizations

Safe changes are usually in the instructional body of the skill:

- project-specific naming rules
- coding standards
- internal checklists
- repository-specific commands
- additional review expectations compatible with the existing phase contract

Those edits preserve the skill as an extension point while keeping the
orchestrator contract intact.

## Fields You Should Not Change

Do not alter the frontmatter contract of bundled skills unless you also intend to
change the orchestrator and schemas that consume them.

For all skills, keep these fields stable:

- `name`
- `description`
- `pipeline_stage`
- `consumed_by`

For phase skills used directly by the orchestrator, also keep these fields stable:

- `completion_tool`
- `loads_skills`

Changing `completion_tool` or removing required metadata can break setup/update
validation and may cause `run` to halt with contract-related failures.

## Recommended Review Flow After `update`

When you see a pending backup, compare the old and new versions before copying any
local edits back.

Example:

```bash
diff -ru .agents/skills/flow-reviewer.bak .agents/skills/flow-reviewer
```

Copy back only the repository-specific intent, such as additional checklist items
or local command examples. Do not blindly restore the whole `.bak`, because that
would also restore outdated product-level instructions.

## Git Guidance

The recommended policy is simple:

- version your customized installed skills in git
- review diffs for skill changes like any other product change
- treat `.bak` as temporary and delete it after reconciliation

This keeps the extension point explicit and aligns with the project-scoped
installation model chosen in ADR-004.

## Related Docs

- [README](../README.md)
- [CLI usage](cli-usage.md)
- [Architecture](architecture.md)
- [ADR-004](../tasks/prd-orquestrador-em-codigo/adrs/adr-004.md)
- [ADR-005](../tasks/prd-orquestrador-em-codigo/adrs/adr-005.md)
