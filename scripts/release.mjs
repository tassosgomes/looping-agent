#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const VALID_RELEASE_TYPES = new Set(["patch", "minor", "major"]);
const PUBLISH_ORDER = [
  "@looping-agent/cli"
];

function printUsage(errorMessage) {
  if (errorMessage) {
    console.error(errorMessage);
    console.error("");
  }

  console.error("Usage: node scripts/release.mjs <patch|minor|major> [--dry-run]");
}

function parseArgs(argv) {
  let releaseType = null;
  let dryRun = false;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg.startsWith("--")) {
      printUsage(`Unknown flag: ${arg}`);
      process.exit(1);
    }

    if (releaseType !== null) {
      printUsage(`Unexpected argument: ${arg}`);
      process.exit(1);
    }

    releaseType = arg;
  }

  if (releaseType === null || !VALID_RELEASE_TYPES.has(releaseType)) {
    printUsage("Expected a release type of patch, minor, or major.");
    process.exit(1);
  }

  return { releaseType, dryRun };
}

function formatCommand(command, args) {
  return [command, ...args].join(" ");
}

function getExitCode(error) {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }

  return 1;
}

function runStep(command, args, description, options) {
  console.log(`${options.dryRun ? "[dry-run]" : "[run]"} ${description}`);
  console.log(`  $ ${formatCommand(command, args)}`);

  if (options.dryRun) {
    return;
  }

  execFileSync(command, args, {
    cwd: options.cwd,
    stdio: "inherit"
  });
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const cliPackageJsonPath = path.join(repoRoot, "packages", "cli", "package.json");
const { version: currentVersion } = JSON.parse(readFileSync(cliPackageJsonPath, "utf8"));
const { releaseType, dryRun } = parseArgs(process.argv.slice(2));

console.log(`Preparing ${releaseType} release from version ${currentVersion}.`);

if (dryRun) {
  console.log("Dry-run mode enabled. Commands will be printed but not executed.");
}

try {
  runStep("npm", ["whoami"], "Validate npm authentication", { cwd: repoRoot, dryRun });
  runStep(
    "npm",
    ["version", releaseType, "--workspaces"],
    "Bump workspace versions with npm version",
    { cwd: repoRoot, dryRun }
  );
  runStep("npm", ["run", "build"], "Build all workspaces", { cwd: repoRoot, dryRun });

  for (const workspace of PUBLISH_ORDER) {
    const publishArgs = ["publish", `--workspace=${workspace}`, "--access", "public"];

    if (dryRun) {
      publishArgs.push("--dry-run");
    }

    runStep("npm", publishArgs, `Publish ${workspace}`, { cwd: repoRoot, dryRun });
  }
} catch (error) {
  console.error("Release failed.");
  process.exit(getExitCode(error));
}