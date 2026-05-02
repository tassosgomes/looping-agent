const SUPPORTED_RUNTIME_NAMES = [
  "claude-agent-acp",
  "claude-acp",
  "codex-acp",
  "copilot-acp"
] as const;

export function buildCliHelpText(binName: string): string {
  return [
    "",
    "Examples:",
    `  ${binName} setup`,
    `  ${binName} update --force`,
    `  ${binName} run --prd-dir tasks/prd-minha-feature --max-retries 3`,
    `  ${binName} doctor`,
    "",
    "Commands:",
    "  setup   Install bundled flow-* skills into the current project.",
    "  update  Refresh installed skills and preserve local changes in .bak.",
    "  run     Execute the orchestrator loop for a PRD directory.",
    "  doctor  Diagnose runtime, skills, backups, and MCP availability."
  ].join("\n");
}

export function buildRunHelpText(binName: string): string {
  return [
    "",
    "Run examples:",
    `  ${binName} run --prd-dir tasks/prd-orquestrador-em-codigo`,
    `  ${binName} run --prd-dir tasks/prd-orquestrador-em-codigo --runtime claude-acp --debug`,
    "",
    `Supported runtime names: ${SUPPORTED_RUNTIME_NAMES.join(", ")}`,
    "The selected runtime is also the agent tool used for phase execution today."
  ].join("\n");
}

export function supportedRuntimeHelpNames(): readonly string[] {
  return SUPPORTED_RUNTIME_NAMES;
}
