import { z } from 'zod';

/**
 * Phase 2 / Step 5 — zod request schemas for the reports module.
 * All request schemas are `.strict()` so unknown keys are rejected
 * before they reach the model layer.
 */

// `target` is either a flat list of org ids OR the literal `["all"]`.
// We accept both and normalise downstream — the union narrows nicely.
const ReportTargetSchema = z.union([
  z.tuple([z.literal('all')]),
  z.array(z.number().int().positive()),
]);

const OutputFormatSchema = z.enum(['markdown']);

export const ReportCreateSchema = z
  .object({
    name: z.string().min(1),
    prompt_template: z.string().min(1),
    target: ReportTargetSchema.optional(),
    output_format: OutputFormatSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

export const ReportUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    prompt_template: z.string().min(1).optional(),
    target: ReportTargetSchema.optional(),
    output_format: OutputFormatSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

export const ReportScheduleUpsertSchema = z
  .object({
    cron_expr: z.string().min(1),
    enabled: z.boolean().optional(),
    next_run_at: z.number().int().nullable().optional(),
  })
  .strict();

/** POST /api/reports/:id/run-now — params */
export const RunNowParamsSchema = z
  .object({
    id: z.coerce.number().int().positive(),
  })
  .strict();

export type ReportTargetInput = z.infer<typeof ReportTargetSchema>;
export type ReportCreate = z.infer<typeof ReportCreateSchema>;
export type ReportUpdate = z.infer<typeof ReportUpdateSchema>;
export type ReportScheduleUpsert = z.infer<typeof ReportScheduleUpsertSchema>;
export type RunNowParams = z.infer<typeof RunNowParamsSchema>;
