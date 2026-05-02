export const EXPECTED_SKILLS = [
  "flow-vision-creator",
  "flow-domain-creator",
  "flow-prd-creator",
  "flow-contract-creator",
  "flow-techspec-creator",
  "flow-frontend-techspec-creator",
  "flow-task-creator",
  "flow-implementer",
  "flow-reviewer",
  "flow-finalizer",
  "flow-workflow-memory",
  "flow-workflow-memory-compaction",
  "flow-task-implementation",
  "flow-stack-selector",
  "flow-final-verify",
  "flow-quality-checks",
  "flow-code-review",
  "flow-quality-ledger",
  "flow-git-linear"
] as const;

export type ExpectedSkillName = (typeof EXPECTED_SKILLS)[number];