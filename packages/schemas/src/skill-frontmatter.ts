import { z } from "zod";

export const PIPELINE_STAGES = [
  "vision",
  "domain",
  "prd",
  "contract",
  "techspec",
  "tasks",
  "implementer",
  "reviewer",
  "finalizer",
  "runtime"
] as const;

export const SKILL_CONSUMERS = [
  "planning",
  "orchestrator",
  "implementer",
  "reviewer",
  "finalizer"
] as const;

export const PHASE_PIPELINE_STAGES = [
  "implementer",
  "reviewer",
  "finalizer"
] as const;

export const COMPLETION_TOOLS = [
  "report_implementer_result",
  "report_review_result",
  "report_finalizer_result"
] as const;

export const FlowSkillName = z.string().regex(/^flow-/);
export type FlowSkillNameT = z.infer<typeof FlowSkillName>;

export const PipelineStage = z.enum(PIPELINE_STAGES);
export type PipelineStageT = z.infer<typeof PipelineStage>;

export const SkillConsumer = z.enum(SKILL_CONSUMERS);
export type SkillConsumerT = z.infer<typeof SkillConsumer>;

export const CompletionToolName = z.enum(COMPLETION_TOOLS);
export type CompletionToolNameT = z.infer<typeof CompletionToolName>;

export const BaseSkillFrontmatter = z.object({
  name: FlowSkillName,
  description: z.string().min(1),
  pipeline_stage: PipelineStage,
  consumed_by: z.array(SkillConsumer),
  requires: z.array(z.string()),
  produces: z.array(z.string())
}).strict();
export type BaseSkillFrontmatterT = z.infer<typeof BaseSkillFrontmatter>;

export const PhaseSkillFrontmatter = BaseSkillFrontmatter.extend({
  pipeline_stage: z.enum(PHASE_PIPELINE_STAGES),
  consumed_by: z.array(z.literal("orchestrator")),
  loads_skills: z.array(FlowSkillName),
  completion_tool: CompletionToolName
}).strict();
export type PhaseSkillFrontmatterT = z.infer<typeof PhaseSkillFrontmatter>;
