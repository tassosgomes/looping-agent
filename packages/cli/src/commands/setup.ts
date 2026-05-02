import { detectRuntime } from "@looping-agent/orchestrator";

import { EXIT_NO_RUNTIME } from "../exit-codes.js";
import { EXPECTED_SKILLS } from "../skills-list.js";
import { installAll } from "../skills-installer.js";
import { getStateFilePath } from "../state-manager.js";

import {
  colorsForStream,
  describeRuntime,
  errorMessage,
  getClaudeSkillsCompatPath,
  getSkillsInstallDir,
  resolveCommandContext,
  runMcpSmokeTest,
  writeLine,
  type CommandRuntimeOptions,
  type McpSmokeTestResult
} from "./shared.js";

export interface SetupCommandOptions extends CommandRuntimeOptions {
  force?: boolean;
  detectRuntime?: typeof detectRuntime;
  installAll?: typeof installAll;
  smokeTestMcpServer?: () => Promise<McpSmokeTestResult>;
}

export async function runSetup(options: SetupCommandOptions = {}): Promise<number> {
  const { projectDir, sourceDir, stdout, stderr } = resolveCommandContext(options);
  const colors = colorsForStream(options, stdout);
  const detectRuntimeFn = options.detectRuntime ?? detectRuntime;
  const installAllFn = options.installAll ?? installAll;
  const smokeTestMcpServer = options.smokeTestMcpServer ?? runMcpSmokeTest;

  try {
    const runtime = await detectRuntimeFn();
    writeLine(stdout, `${colors.info("Runtime")} ${describeRuntime(runtime)}`);
  } catch (error) {
    writeLine(stderr, colors.error(errorMessage(error)));
    writeLine(stderr, `${colors.muted("Project")} ${projectDir}`);
    return EXIT_NO_RUNTIME;
  }

  let report;
  try {
    report = await installAllFn({
      sourceDir,
      projectDir,
      ...(options.force ? { force: true } : {})
    });
  } catch (error) {
    writeLine(stderr, colors.error(`Setup failed for ${projectDir}: ${errorMessage(error)}`));
    writeLine(stderr, `${colors.muted("Suggested command")} looping-agent setup --force`);
    return EXIT_NO_RUNTIME;
  }

  if (report.failed.length > 0) {
    writeLine(stderr, colors.error(`Setup could not install ${String(report.failed.length)} skill(s).`));
    for (const failure of report.failed) {
      writeLine(stderr, `- ${failure.skill}: ${failure.reason}`);
    }
    writeLine(stderr, `${colors.muted("Suggested command")} inspect ${sourceDir} and rerun looping-agent setup --force`);
    return EXIT_NO_RUNTIME;
  }

  try {
    const smoke = await smokeTestMcpServer();
    const unchangedOnly = report.copied.length === 0
      && report.backedUp.length === 0
      && report.unchanged.length === EXPECTED_SKILLS.length;
    const summary = unchangedOnly && !options.force
      ? "Setup already up to date"
      : "Setup completed";

    writeLine(stdout, `${colors.success(summary)} ${projectDir}`);
    writeLine(
      stdout,
      `${colors.info("Skills")} copied=${String(report.copied.length)} unchanged=${String(report.unchanged.length)} backed_up=${String(report.backedUp.length)}`
    );
    writeLine(stdout, `${colors.info("Skills dir")} ${getSkillsInstallDir(projectDir)}`);
    writeLine(stdout, `${colors.info("Claude compat")} ${getClaudeSkillsCompatPath(projectDir)}`);
    writeLine(stdout, `${colors.info("State")} ${getStateFilePath(projectDir)}`);
    writeLine(stdout, `${colors.info("MCP smoke")} ok (${smoke.toolNames.join(", ")})`);
    return 0;
  } catch (error) {
    writeLine(stderr, colors.error(`MCP smoke test failed: ${errorMessage(error)}`));
    writeLine(stderr, `${colors.muted("Suggested command")} rerun looping-agent setup --force after verifying the local install.`);
    return EXIT_NO_RUNTIME;
  }
}
