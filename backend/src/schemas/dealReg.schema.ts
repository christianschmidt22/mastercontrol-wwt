import { z } from 'zod';

export const DealRegInputSchema = z.object({
  vendor: z.string().max(240).optional().nullable(),
  customer: z.string().max(240).optional().nullable(),
  deal_reg_number: z.string().max(240).optional().nullable(),
  project: z.string().max(240).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export type DealRegInput = z.infer<typeof DealRegInputSchema>;
