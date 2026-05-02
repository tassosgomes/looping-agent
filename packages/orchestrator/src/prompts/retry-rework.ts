import type { ReportReviewResultT } from "@looping-agent/schemas";

export interface RetryReworkPromptInput {
  basePrompt: string;
  issues: ReportReviewResultT["issues"];
}

export function retryReworkPrompt(input: RetryReworkPromptInput): string {
  const formattedIssues = input.issues.map(formatIssue).join("\n");

  return `O Reviewer rejeitou a implementacao anterior com as issues abaixo.
Corrija cada uma e invoque report_implementer_result novamente.

Issues:
${formattedIssues}

${input.basePrompt}`;
}

function formatIssue(issue: ReportReviewResultT["issues"][number]): string {
  const location = formatLocation(issue.file_path, issue.line);
  const category = issue.category ? ` [${issue.category}]` : "";

  return `- [${issue.severity}]${location}${category} ${issue.description}`;
}

function formatLocation(filePath?: string, line?: number): string {
  if (!filePath) {
    return "";
  }

  if (typeof line === "number") {
    return ` ${filePath}:${String(line)}`;
  }

  return ` ${filePath}`;
}