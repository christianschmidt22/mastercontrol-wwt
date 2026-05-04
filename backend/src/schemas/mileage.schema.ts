import { z } from 'zod';

const DateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

const BooleanQuerySchema = z.preprocess((value) => {
  if (value === undefined) return false;
  if (typeof value === 'string') return value === 'true' || value === '1';
  return value;
}, z.boolean());

export const MileageReportQuerySchema = z
  .object({
    start_date: DateStringSchema,
    end_date: DateStringSchema,
    calculate: BooleanQuerySchema.optional().default(false),
  })
  .refine((value) => value.end_date >= value.start_date, {
    message: 'end_date must be on or after start_date',
    path: ['end_date'],
  });

export type MileageReportQuery = z.infer<typeof MileageReportQuerySchema>;
