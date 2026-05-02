import { z } from "zod";

import { FlowSkillName } from "./skill-frontmatter.js";

const Timestamp = z.string().datetime({ offset: true });

export const SkillInstallState = z.object({
  hash: z.string().regex(/^sha256:[a-fA-F0-9]{64}$/),
  installed_version: z.string().min(1)
}).strict();
export type SkillInstallStateT = z.infer<typeof SkillInstallState>;

export const InstallState = z.object({
  looping_agent_version: z.string().min(1),
  installed_at: Timestamp,
  skills: z.record(FlowSkillName, SkillInstallState)
}).strict();
export type InstallStateT = z.infer<typeof InstallState>;
