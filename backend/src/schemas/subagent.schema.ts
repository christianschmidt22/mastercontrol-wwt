/**
 * subagent.schema.ts — zod schemas for the /api/subagent/* endpoints.
 */
import { z } from 'zod';
import { ALLOWED_TOOL_NAMES } from '../services/subagentTools.service.js';

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

// ---------------------------------------------------------------------------
// Agentic delegation
// ---------------------------------------------------------------------------

/**
 * Zod enum for the five allowed coding tools. Built from the runtime array so
 * schema + service stay in sync without duplication.
 *
 * Casting: z.enum() requires a non-empty tuple literal, so we cast the
 * runtime readonly array. The ALLOWED_TOOL_NAMES array is authoritative;
 * this cast is safe because zod validates at runtime.
 */
const AllowedToolEnum = z.enum(
  ALLOWED_TOOL_NAMES as unknown as [string, ...string[]],
);

export const AgenticDelegateRequestSchema = z
  .object({
    /** The task to perform. First user message. */
    task: z.string().min(1).max(50_000),
    /** Directory the agent operates in. Defaults server-side. Max 1000 chars. */
    working_dir: z.string().max(1000).optional(),
    /** Which coding tools to enable for this run. At least one required. */
    tools: z.array(AllowedToolEnum).min(1).max(5),
    /** Override the default model. */
    model: z.string().max(120).optional(),
    /** Max agentic iterations (1–50). Default 25. */
    max_iterations: z.number().int().min(1).max(50).optional(),
    /** Max tokens per turn. Capped at 8192 server-side. */
    max_tokens: z.number().int().positive().max(8192).optional(),
    /** Optional system prompt injected before the task. */
    system: z.string().max(50_000).optional(),
    /** Short label for the activity feed (≤140 chars). */
    task_summary: z.string().max(140).optional(),
    /** Optional per-call cost cap in USD. Positive, max $100. Omit to disable. */
    max_cost_usd: z.number().positive().max(100).optional(),
  })
  .strict();

export type AgenticDelegateRequest = z.infer<typeof AgenticDelegateRequestSchema>;
