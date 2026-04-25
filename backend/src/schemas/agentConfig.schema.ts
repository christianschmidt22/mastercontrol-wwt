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

/** POST /agents/threads body */
export const AgentThreadCreateSchema = z.object({
  organization_id: z.number().int().positive(),
  title: z.string().optional(),
});

/** GET /agents/threads?org_id= query */
export const AgentThreadListQuerySchema = z.object({
  org_id: z.coerce.number().int().positive(),
});

/** POST /agents/:org_id/chat body */
export const AgentChatBodySchema = z.object({
  thread_id: z.number().int().positive().optional(),
  content: z.string().min(1),
});

/** GET /agents/audit?thread_id= query */
export const AuditListQuerySchema = z.object({
  thread_id: z.coerce.number().int().positive(),
});

export type AgentSection = z.infer<typeof AgentSectionSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type AgentConfigUpdate = z.infer<typeof AgentConfigUpdateSchema>;
export type AgentThreadCreate = z.infer<typeof AgentThreadCreateSchema>;
export type AgentChatBody = z.infer<typeof AgentChatBodySchema>;
