import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeRuntimeKind, runSmoke, type RuntimeKind, type Sequence, type SmokeManifest } from "./run-smoke.js";

interface ReproducibilityOptions {
  runtime: RuntimeKind;
  fixture: string;
  resultsDir: string;
  runs: number;
  threshold: number;
  manualFloor: number;
  debug: boolean;
}

interface SequencePair {
  leftRunId: string;
  rightRunId: string;
  equal: boolean;
}

interface ReproducibilityReport {
  schemaVersion: "1.0";
  runtime: RuntimeKind;
  fixture: string;
  startedAt: string;
  endedAt: string;
  runsRequested: number;
  runsCompleted: number;
  pairwiseEqualityRate: number;
  modalSequenceRate: number;
  longRunTargetMet: boolean;
  manualGateMet: boolean;
  success: boolean;
  reportPath: string;
  pairComparisons: SequencePair[];
  runs: {
    runId: string;
    manifestPath: string;
    success: boolean;
    telemetryPath: string | null;
    sequence: Sequence;
  }[];
}

const REPO_ROOT = findRepoRoot(fileURLToPath(new URL(".", import.meta.url)));
const DEFAULT_RESULTS_DIR = join(REPO_ROOT, "tests", "e2e", "results");

function findRepoRoot(moduleDir: string): string {
  const candidates = [resolve(moduleDir, "../.."), resolve(moduleDir, "../../..")];

  for (const candidate of candidates) {
    if (existsSync(join(candidate, "package.json")) && existsSync(join(candidate, "packages", "cli"))) {
      return candidate;
    }
  }

  throw new Error(`Could not resolve the repository root from ${moduleDir}.`);
}

async function runReproducibilityCheck(options: ReproducibilityOptions): Promise<ReproducibilityReport> {
  const startedAt = new Date();
  const batchId = `repro-${options.fixture}-${options.runtime}-${startedAt.toISOString().replace(/[:.]/gu, "-")}`;
  const batchDir = join(options.resultsDir, batchId);
  const manifests: SmokeManifest[] = [];

  await mkdir(batchDir, { recursive: true });

  for (let runNumber = 1; runNumber <= options.runs; runNumber += 1) {
    const manifest = await runSmoke({
      runtime: options.runtime,
      fixture: options.fixture,
      resultsDir: batchDir,
      runId: `run-${String(runNumber)}`,
      maxRetries: 3,
      debug: options.debug
    });
    manifests.push(manifest);

    if (!manifest.success) {
      break;
    }
  }

  const pairComparisons = buildPairComparisons(manifests);
  const matchingPairs = pairComparisons.filter((pair) => pair.equal).length;
  const pairwiseEqualityRate = pairComparisons.length === 0 ? 1 : matchingPairs / pairComparisons.length;
  const modalSequenceRate = calculateModalSequenceRate(manifests.map((manifest) => manifest.telemetry.sequence));
  const runsCompleted = manifests.length;
  const allRunsSuccessful = manifests.length === options.runs && manifests.every((manifest) => manifest.success);
  const longRunTargetMet = allRunsSuccessful && pairwiseEqualityRate >= options.threshold;
  const manualGateMet = allRunsSuccessful && modalSequenceRate >= options.manualFloor;
  const endedAt = new Date();
  const reportPath = join(batchDir, "reproducibility-report.json");
  const report: ReproducibilityReport = {
    schemaVersion: "1.0",
    runtime: options.runtime,
    fixture: options.fixture,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    runsRequested: options.runs,
    runsCompleted,
    pairwiseEqualityRate,
    modalSequenceRate,
    longRunTargetMet,
    manualGateMet,
    success: manualGateMet,
    reportPath,
    pairComparisons,
    runs: manifests.map((manifest) => ({
      runId: manifest.runId,
      manifestPath: manifest.manifestPath,
      success: manifest.success,
      telemetryPath: manifest.telemetry.taskTelemetryPath,
      sequence: manifest.telemetry.sequence
    }))
  };

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

function buildPairComparisons(manifests: SmokeManifest[]): SequencePair[] {
  const pairs: SequencePair[] = [];

  for (let leftIndex = 0; leftIndex < manifests.length; leftIndex += 1) {
    const leftManifest = manifests[leftIndex];

    if (!leftManifest) {
      continue;
    }

    for (let rightIndex = leftIndex + 1; rightIndex < manifests.length; rightIndex += 1) {
      const rightManifest = manifests[rightIndex];

      if (!rightManifest) {
        continue;
      }

      pairs.push({
        leftRunId: leftManifest.runId,
        rightRunId: rightManifest.runId,
        equal: sequencesEqual(leftManifest.telemetry.sequence, rightManifest.telemetry.sequence)
      });
    }
  }

  return pairs;
}

function sequencesEqual(left: Sequence, right: Sequence): boolean {
  return left.length === right.length && left.every((token, index) => token === right[index]);
}

function calculateModalSequenceRate(sequences: Sequence[]): number {
  if (sequences.length === 0) {
    return 0;
  }

  const counts = new Map<string, number>();
  let highestCount = 0;

  for (const sequence of sequences) {
    const key = JSON.stringify(sequence);
    const nextCount = (counts.get(key) ?? 0) + 1;

    counts.set(key, nextCount);
    highestCount = Math.max(highestCount, nextCount);
  }

  return highestCount / sequences.length;
}

function parseReproducibilityOptions(argv: readonly string[]): ReproducibilityOptions {
  let runtime: RuntimeKind | null = null;
  let fixture = "prd-smoke";
  let resultsDir = DEFAULT_RESULTS_DIR;
  let runs = 3;
  let threshold = 0.95;
  let manualFloor = 2 / 3;
  let debug = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token) {
      continue;
    }

    switch (token) {
      case "--runtime": {
        const value = argv[index + 1];

        if (!value) {
          throw new Error("Missing value for --runtime.");
        }

        runtime = normalizeRuntimeKind(value);
        index += 1;
        break;
      }
      case "--fixture": {
        const value = argv[index + 1];

        if (!value) {
          throw new Error("Missing value for --fixture.");
        }

        fixture = value;
        index += 1;
        break;
      }
      case "--results-dir": {
        const value = argv[index + 1];

        if (!value) {
          throw new Error("Missing value for --results-dir.");
        }

        resultsDir = isAbsolute(value) ? value : resolve(REPO_ROOT, value);
        index += 1;
        break;
      }
      case "--runs": {
        const value = argv[index + 1];

        if (!value) {
          throw new Error("Missing value for --runs.");
        }

        const parsed = Number.parseInt(value, 10);

        if (!Number.isInteger(parsed) || parsed <= 1) {
          throw new Error(`Expected an integer greater than 1 for --runs, received ${JSON.stringify(value)}.`);
        }

        runs = parsed;
        index += 1;
        break;
      }
      case "--threshold": {
        const value = argv[index + 1];

        if (!value) {
          throw new Error("Missing value for --threshold.");
        }

        threshold = parseRateOption(value, "--threshold");
        index += 1;
        break;
      }
      case "--manual-floor": {
        const value = argv[index + 1];

        if (!value) {
          throw new Error("Missing value for --manual-floor.");
        }

        manualFloor = parseRateOption(value, "--manual-floor");
        index += 1;
        break;
      }
      case "--debug":
        debug = true;
        break;
      case "--help":
        printReproducibilityHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option ${JSON.stringify(token)}.`);
    }
  }

  if (runtime === null) {
    throw new Error("Missing required option --runtime <claude-agent-acp|codex-acp|copilot-acp>.");
  }

  return {
    runtime,
    fixture,
    resultsDir,
    runs,
    threshold,
    manualFloor,
    debug
  };
}

function parseRateOption(rawValue: string, flagName: string): number {
  const parsed = Number.parseFloat(rawValue);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`Expected a number between 0 and 1 for ${flagName}, received ${JSON.stringify(rawValue)}.`);
  }

  return parsed;
}

function printReproducibilityHelp(): void {
  process.stdout.write(
    [
      "Usage: node tests/e2e/dist/check-reproducibility.js --runtime <name> [options]",
      "",
      "Options:",
      "  --runtime <name>       claude-agent-acp | claude-acp | codex-acp | copilot-acp",
      "  --fixture <name>       Fixture directory under tests/e2e/fixtures (default: prd-smoke)",
      "  --results-dir <path>   Output directory for grouped run results (default: tests/e2e/results)",
      "  --runs <n>             Number of smoke runs to compare (default: 3)",
      "  --threshold <rate>     Long-run pairwise equality target (default: 0.95)",
      "  --manual-floor <rate>  Manual acceptance floor for small samples (default: 0.6666666667)",
      "  --debug                Forward --debug to the underlying smoke runs",
      "  --help                 Show this message"
    ].join("\n") + "\n"
  );
}

async function main(): Promise<void> {
  const options = parseReproducibilityOptions(process.argv.slice(2));
  const report = await runReproducibilityCheck(options);
  const status = report.success ? "PASS" : "FAIL";

  process.stdout.write(
    [
      `${status} reproducibility`,
      `Report: ${report.reportPath}`,
      `Pairwise equality rate: ${report.pairwiseEqualityRate.toFixed(4)}`,
      `Modal sequence rate: ${report.modalSequenceRate.toFixed(4)}`,
      `Long-run target met: ${report.longRunTargetMet ? "yes" : "no"}`,
      `Manual gate met: ${report.manualGateMet ? "yes" : "no"}`
    ].join("\n") + "\n"
  );

  if (!report.success) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}