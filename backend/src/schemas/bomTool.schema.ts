import { z } from 'zod';

export const BomToolFileUploadSchema = z.object({
  name: z.string().min(1).max(240),
  mime_type: z.string().min(1).max(160).optional().nullable(),
  data_base64: z.string().min(1),
});

export const BomToolFilesQuerySchema = z.object({
  org_id: z.coerce.number().int().positive(),
});

export const BomToolUploadSchema = z.object({
  organization_id: z.number().int().positive(),
  files: z.array(BomToolFileUploadSchema).min(1).max(12),
});

export const BomToolAnalyzeSchema = z.object({
  organization_id: z.number().int().positive(),
  file_names: z.array(z.string().min(1).max(240)).min(1).max(20),
  prompt: z.string().max(8000).optional().nullable(),
});

export const BomToolMoveSchema = z.object({
  from_organization_id: z.number().int().positive(),
  to_organization_id: z.number().int().positive(),
  file_names: z.array(z.string().min(1).max(240)).min(1).max(50),
});

export const BomToolPreferenceSchema = z.object({
  id: z.number().int().positive().optional().nullable(),
  label: z.string().min(1).max(120),
  value: z.string().max(2000).optional().nullable(),
  is_standard: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
});

export const BomToolPreferencesSaveSchema = z.object({
  organization_id: z.number().int().positive(),
  preferences: z.array(BomToolPreferenceSchema).max(100),
});

export type BomToolFilesQuery = z.infer<typeof BomToolFilesQuerySchema>;
export type BomToolUpload = z.infer<typeof BomToolUploadSchema>;
export type BomToolAnalyze = z.infer<typeof BomToolAnalyzeSchema>;
export type BomToolMove = z.infer<typeof BomToolMoveSchema>;
export type BomToolPreferencesSave = z.infer<typeof BomToolPreferencesSaveSchema>;
