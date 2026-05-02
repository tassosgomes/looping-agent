#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

function printUsage(errorMessage) {
  if (errorMessage) {
    console.error(errorMessage);
    console.error("");
  }

  console.error("Usage: node scripts/install-local-cli.mjs <target-repo> [--no-save] [--skip-build]");
}

function parseArgs(argv) {
  let targetRepo = null;
  let noSave = false;
  let skipBuild = false;

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    if (arg === "--no-save") {
      noSave = true;
      continue;
    }

    if (arg === "--skip-build") {
      skipBuild = true;
      continue;
    }

    if (arg.startsWith("--")) {
      printUsage(`Unknown flag: ${arg}`);
      process.exit(1);
    }

    if (targetRepo !== null) {
      printUsage(`Unexpected argument: ${arg}`);
      process.exit(1);
    }

    targetRepo = arg;
  }

  if (targetRepo === null) {
    printUsage("You must provide the absolute or relative path to the target repository.");
    process.exit(1);
  }

  return { targetRepo, noSave, skipBuild };
}

function run(command, args, cwd, description) {
  console.log(`[run] ${description}`);
  console.log(`  $ ${[command, ...args].join(" ")}`);

  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["inherit", "pipe", "inherit"]
  }).trim();
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const cliPackageDir = path.join(repoRoot, "packages", "cli");
const { targetRepo, noSave, skipBuild } = parseArgs(process.argv.slice(2));
const resolvedTargetRepo = path.resolve(process.cwd(), targetRepo);
const targetPackageJson = path.join(resolvedTargetRepo, "package.json");
const hasPackageJson = existsSync(targetPackageJson);

if (!existsSync(resolvedTargetRepo)) {
  printUsage(`Target repository does not exist: ${resolvedTargetRepo}`);
  process.exit(1);
}

let tarballPath = null;

try {
  if (!skipBuild) {
    run("npm", ["run", "build"], repoRoot, "Build the monorepo and bundle the CLI");
  }

  const tarballName = run("npm", ["pack", "--silent"], cliPackageDir, "Pack the CLI workspace");
  tarballPath = path.join(cliPackageDir, tarballName);

  const installArgs = ["install"];
  const effectiveNoSave = noSave || !hasPackageJson;

  if (!hasPackageJson) {
    console.log("[info] Target repository has no package.json; using a transient --no-save install for testing.");
  }

  if (effectiveNoSave) {
    installArgs.push("--no-save");
  }

  installArgs.push(tarballPath);
  run("npm", installArgs, resolvedTargetRepo, "Install the packed CLI into the target repository");
  run(
    "npx",
    ["--no-install", "looping-agent", "--help"],
    resolvedTargetRepo,
    "Verify the installed CLI entrypoint"
  );

  console.log("");
  console.log("Local CLI install completed successfully.");
  console.log(`Target repository: ${resolvedTargetRepo}`);
  console.log(`package.json detected: ${hasPackageJson ? "yes" : "no"}`);
  console.log(`CLI source workspace: ${cliPackageDir}`);
  console.log("Temporary tarball cleaned up after installation.");
} finally {
  if (tarballPath !== null && existsSync(tarballPath)) {
    await rm(tarballPath, { force: true });
  }
}