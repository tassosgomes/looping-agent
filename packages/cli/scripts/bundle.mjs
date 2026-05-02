#!/usr/bin/env node

import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(packageDir, "..", "..");
const entryPoint = path.join(packageDir, "src", "index.ts");
const mcpStandaloneEntryPoint = path.join(packageDir, "src", "mcp-standalone.ts");
const outFile = path.join(packageDir, "dist", "index.js");
const standaloneOutFile = path.join(packageDir, "bin", "standalone.mjs");
const skillsSourceDir = path.join(repoRoot, "skills");
const bundledSkillsDir = path.join(packageDir, "dist", "skills");
const staleBundleArtifacts = [
  path.join(packageDir, "dist", "index.cjs"),
  path.join(packageDir, "dist", "index.cjs.map"),
  path.join(packageDir, "bin", "standalone.mjs.map")
];

async function bundleCli() {
  await mkdir(path.dirname(outFile), { recursive: true });
  await mkdir(path.dirname(standaloneOutFile), { recursive: true });
  await Promise.all(staleBundleArtifacts.map(async (artifactPath) => {
    await rm(artifactPath, { force: true });
  }));
  await build({
    entryPoints: [entryPoint],
    outfile: outFile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    sourcemap: true,
    external: [
      "node:*",
      "@modelcontextprotocol/sdk",
      "@modelcontextprotocol/sdk/*",
      "@agentclientprotocol/sdk",
      "commander",
      "ora",
      "picocolors",
      "zod"
    ]
  });
  await build({
    entryPoints: [mcpStandaloneEntryPoint],
    outfile: standaloneOutFile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    sourcemap: true,
    external: [
      "node:*",
      "@modelcontextprotocol/sdk",
      "@modelcontextprotocol/sdk/*",
      "@agentclientprotocol/sdk",
      "zod"
    ]
  });

  await rm(bundledSkillsDir, { recursive: true, force: true });
  await cp(skillsSourceDir, bundledSkillsDir, { recursive: true });
}

bundleCli().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
