import { z } from 'zod';

export const AlertSeveritySchema = z.enum(['error', 'warn', 'info']);
export const AlertStatusFilterSchema = z.enum([
  'active',
  'unread',
  'unresolved',
  'resolved',
  'all',
]);

export const AlertListQuerySchema = z.object({
  unread_only: z.enum(['true', 'false']).optional(),
  status: AlertStatusFilterSchema.optional(),
  severity: z.union([AlertSeveritySchema, z.literal('all')]).optional(),
  source: z.string().trim().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const AlertParamsSchema = z.object({
  id: z.coerce.number().int().min(1),
});

export type AlertStatusFilter = z.infer<typeof AlertStatusFilterSchema>;
