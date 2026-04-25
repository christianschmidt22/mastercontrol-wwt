import { z } from 'zod';

export const AgentSectionSchema = z.enum(['customer', 'oem']);

export const AgentConfigSchema = z.object({
  id: z.number().int(),
  section: AgentSectionSchema,
  organization_id: z.number().int().nullable(),
  system_prompt_template: z.string(),
  tools_enabled: z.record(z.string(), z.unknown()),
  model: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const AgentConfigUpdateSchema = z.object({
  system_prompt_template: z.string().optional(),
  tools_enabled: z.record(z.string(), z.unknown()).optional(),
  model: z.string().optional(),
});

export type AgentSection = z.infer<typeof AgentSectionSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type AgentConfigUpdate = z.infer<typeof AgentConfigUpdateSchema>;
