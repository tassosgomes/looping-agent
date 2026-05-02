import { stat } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { getDefaultSkillsSourceDir } from "../../src/commands/shared.js";

describe("getDefaultSkillsSourceDir", () => {
  it("resolves a skills directory that contains the bundled flow skills", async () => {
    const sourceDir = getDefaultSkillsSourceDir();

    await expect(stat(path.join(sourceDir, "flow-prd-creator", "SKILL.md"))).resolves.toBeDefined();
  });
});