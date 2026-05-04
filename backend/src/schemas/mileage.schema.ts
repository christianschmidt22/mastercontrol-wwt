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

export const MileageCalculateSchema = z.object({
  from_address: z.string().min(3).max(500),
  to_address: z.string().min(3).max(500),
});

export const MileageExportRowSchema = z.object({
  uid: z.string().min(1).max(200),
  date: DateStringSchema,
  subject: z.string().trim().max(500),
  from_address: z.string().trim().min(3).max(500),
  to_address: z.string().trim().min(3).max(500),
  type: z.literal('round trip'),
  miles: z.number().nonnegative().nullable(),
});

export const MileageExportPdfSchema = z
  .object({
    start_date: DateStringSchema,
    end_date: DateStringSchema,
    total_miles: z.number().nonnegative(),
    rows: z.array(MileageExportRowSchema).min(1).max(500),
  })
  .refine((value) => value.end_date >= value.start_date, {
    message: 'end_date must be on or after start_date',
    path: ['end_date'],
  });

export type MileageReportQuery = z.infer<typeof MileageReportQuerySchema>;
export type MileageCalculate = z.infer<typeof MileageCalculateSchema>;
export type MileageExportPdf = z.infer<typeof MileageExportPdfSchema>;
