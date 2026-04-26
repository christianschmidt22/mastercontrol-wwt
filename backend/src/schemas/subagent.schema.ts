/**
 * subagent.schema.ts — zod schemas for the /api/subagent/* endpoints.
 */
import { z } from 'zod';

export const DelegateRequestSchema = z
  .object({
    /** The user-supplied task. The first user message in the Anthropic call. */
    task: z.string().min(1).max(50_000),
    /** Override the default model. Defaults to claude-sonnet-4-6 server-side. */
    model: z.string().max(120).optional(),
    /** Optional max_tokens. Capped at 8192 server-side regardless. */
    max_tokens: z.number().int().positive().max(8192).optional(),
    /** Optional system prompt. */
    system: z.string().max(50_000).optional(),
    /** Pass-through tool definitions. Validated as an array of objects. */
    tools: z.array(z.unknown()).optional(),
    /** Short label for the activity feed (≤140 chars). */
    task_summary: z.string().max(140).optional(),
  })
  .strict();

export type DelegateRequest = z.infer<typeof DelegateRequestSchema>;

export const UsagePeriodSchema = z.enum(['session', 'today', 'week', 'all']);
export type UsagePeriodValue = z.infer<typeof UsagePeriodSchema>;

export const UsageQuerySchema = z
  .object({
    period: UsagePeriodSchema,
  })
  .strict();

export const RecentUsageQuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().max(100).optional(),
  })
  .strict();
