import { detectRuntime } from "@looping-agent/orchestrator";

import { EXIT_NO_RUNTIME } from "../exit-codes.js";
import { EXPECTED_SKILLS } from "../skills-list.js";
import { installAll } from "../skills-installer.js";

import {
  colorsForStream,
  describeRuntime,
  errorMessage,
  getClaudeSkillsCompatPath,
  getSkillsInstallDir,
  resolveCommandContext,
  writeLine,
  type CommandRuntimeOptions
} from "./shared.js";

export interface UpdateCommandOptions extends CommandRuntimeOptions {
  force?: boolean;
  detectRuntime?: typeof detectRuntime;
  installAll?: typeof installAll;
}

export async function runUpdate(options: UpdateCommandOptions = {}): Promise<number> {
  const { projectDir, sourceDir, stdout, stderr } = resolveCommandContext(options);
  const colors = colorsForStream(options, stdout);
  const detectRuntimeFn = options.detectRuntime ?? detectRuntime;
  const installAllFn = options.installAll ?? installAll;

  try {
    const runtime = await detectRuntimeFn();
    writeLine(stdout, `${colors.info("Runtime")} ${describeRuntime(runtime)}`);
  } catch (error) {
    writeLine(stdout, `${colors.warning("Runtime")} ${errorMessage(error)}`);
  }

  let report;
  try {
    report = await installAllFn({
      sourceDir,
      projectDir,
      backupStrategy: "state-mismatch",
      ...(options.force ? { force: true } : {})
    });
  } catch (error) {
    writeLine(stderr, colors.error(`Update failed for ${projectDir}: ${errorMessage(error)}`));
    writeLine(stderr, `${colors.muted("Suggested command")} looping-agent update --force`);
    return EXIT_NO_RUNTIME;
  }

  if (report.failed.length > 0) {
    writeLine(stderr, colors.error(`Update could not process ${String(report.failed.length)} skill(s).`));
    for (const failure of report.failed) {
      writeLine(stderr, `- ${failure.skill}: ${failure.reason}`);
    }
    writeLine(stderr, `${colors.muted("Suggested command")} inspect ${sourceDir} and rerun looping-agent update --force`);
    return EXIT_NO_RUNTIME;
  }

  const unchangedOnly = report.copied.length === 0
    && report.backedUp.length === 0
    && report.unchanged.length === EXPECTED_SKILLS.length;
  const summary = unchangedOnly && !options.force
    ? "Update found no changes"
    : "Update completed";

  writeLine(stdout, `${colors.success(summary)} ${projectDir}`);
  writeLine(
    stdout,
    `${colors.info("Skills")} copied=${String(report.copied.length)} unchanged=${String(report.unchanged.length)} backed_up=${String(report.backedUp.length)}`
  );
  writeLine(stdout, `${colors.info("Skills dir")} ${getSkillsInstallDir(projectDir)}`);
  writeLine(stdout, `${colors.info("Claude compat")} ${getClaudeSkillsCompatPath(projectDir)}`);

  if (report.backedUp.length > 0) {
    writeLine(
      stdout,
      `${colors.warning("Backups pending review")} ${report.backedUp.join(", ")} in ${getSkillsInstallDir(projectDir)}`
    );
  }

  return 0;
}
