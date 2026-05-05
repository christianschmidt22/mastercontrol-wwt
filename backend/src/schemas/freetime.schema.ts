import { z } from 'zod';

export const FreetimeFindSchema = z.object({
  participant_emails: z.array(z.string().email()).max(4).default([]),
  include_self: z.boolean().default(true),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  work_start_minutes: z.number().int().min(0).max(1439),
  work_end_minutes: z.number().int().min(1).max(1440),
}).refine((value) => value.include_self || value.participant_emails.length > 0, {
  message: 'Choose at least one user or include yourself.',
}).refine((value) => value.work_end_minutes > value.work_start_minutes, {
  message: 'End time must be after start time.',
});

export type FreetimeFind = z.infer<typeof FreetimeFindSchema>;
