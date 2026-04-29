import { z } from 'zod';

export const BacklogStatusSchema = z.enum(['open', 'done', 'snoozed']);

export const BacklogItemCreateSchema = z.object({
  title: z.string().trim().min(1).max(500),
  notes: z.string().max(5_000).optional().nullable(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  status: BacklogStatusSchema.optional(),
});

export const BacklogItemUpdateSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  notes: z.string().max(5_000).optional().nullable(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  status: BacklogStatusSchema.optional(),
});

export const BacklogItemQuerySchema = z.object({
  status: BacklogStatusSchema.optional(),
});

export const BacklogItemParamsSchema = z.object({
  id: z.coerce.number().int().min(1),
});
