import { describe, expect, it } from "vitest";

import {
  BaseSkillFrontmatter,
  PhaseSkillFrontmatter
} from "../src/index.js";

describe("skill frontmatter schemas", () => {
  it("accepts valid base skill frontmatter", () => {
    expect(BaseSkillFrontmatter.parse({
      name: "flow-prd-creator",
      description: "Cria PRDs detalhados.",
      pipeline_stage: "prd",
      consumed_by: ["planning"],
      requires: [],
      produces: ["tasks/prd-[slug]/prd.md"]
    })).toMatchObject({ pipeline_stage: "prd" });
  });

  it("rejects invalid base skill frontmatter", () => {
    expect(() => BaseSkillFrontmatter.parse({
      name: "prd-creator",
      description: "Missing flow prefix.",
      pipeline_stage: "prd",
      consumed_by: ["planning"],
      requires: [],
      produces: []
    })).toThrow();

    expect(() => BaseSkillFrontmatter.parse({
      name: "flow-prd-creator",
      description: "",
      pipeline_stage: "prd",
      consumed_by: ["planning"],
      requires: [],
      produces: []
    })).toThrow();

    expect(() => BaseSkillFrontmatter.parse({
      name: "flow-prd-creator",
      description: "Extra fields are invalid.",
      pipeline_stage: "prd",
      consumed_by: ["planning"],
      requires: [],
      produces: [],
      completion_tool: "report_implementer_result"
    })).toThrow();
  });

  it("accepts valid phase skill frontmatter", () => {
    expect(PhaseSkillFrontmatter.parse({
      name: "flow-implementer",
      description: "Executa a task.",
      pipeline_stage: "implementer",
      consumed_by: ["orchestrator"],
      requires: ["tasks.md"],
      produces: ["report_implementer_result"],
      loads_skills: ["flow-task-implementation", "flow-quality-checks"],
      completion_tool: "report_implementer_result"
    })).toMatchObject({ completion_tool: "report_implementer_result" });
  });

  it("rejects phase frontmatter without phase-only fields", () => {
    expect(() => PhaseSkillFrontmatter.parse({
      name: "flow-reviewer",
      description: "Revisa a task.",
      pipeline_stage: "reviewer",
      consumed_by: ["orchestrator"],
      requires: [],
      produces: []
    })).toThrow();
  });

  it("rejects invalid phase frontmatter variants", () => {
    expect(() => PhaseSkillFrontmatter.parse({
      name: "flow-finalizer",
      description: "Finaliza a task.",
      pipeline_stage: "runtime",
      consumed_by: ["orchestrator"],
      requires: [],
      produces: [],
      loads_skills: ["flow-git-linear"],
      completion_tool: "report_finalizer_result"
    })).toThrow();

    expect(() => PhaseSkillFrontmatter.parse({
      name: "flow-finalizer",
      description: "Finaliza a task.",
      pipeline_stage: "finalizer",
      consumed_by: ["finalizer"],
      requires: [],
      produces: [],
      loads_skills: ["flow-git-linear"],
      completion_tool: "report_finalizer_result"
    })).toThrow();

    expect(() => PhaseSkillFrontmatter.parse({
      name: "flow-finalizer",
      description: "Finaliza a task.",
      pipeline_stage: "finalizer",
      consumed_by: ["orchestrator"],
      requires: [],
      produces: [],
      loads_skills: ["git-linear"],
      completion_tool: "report_finalizer_result"
    })).toThrow();
  });
});
