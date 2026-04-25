import { z } from 'zod';

export const DocumentKindSchema = z.enum(['link', 'file']);
export const DocumentSourceSchema = z.enum(['manual', 'onedrive_scan']);

export const DocumentSchema = z.object({
  id: z.number().int(),
  organization_id: z.number().int(),
  kind: DocumentKindSchema,
  label: z.string(),
  url_or_path: z.string(),
  source: DocumentSourceSchema,
  created_at: z.string(),
});

export const DocumentCreateSchema = z.object({
  organization_id: z.number().int(),
  kind: DocumentKindSchema,
  label: z.string().min(1),
  url_or_path: z.string().min(1),
  source: DocumentSourceSchema.optional(),
});

export type DocumentKind = z.infer<typeof DocumentKindSchema>;
export type DocumentSource = z.infer<typeof DocumentSourceSchema>;
export type Document = z.infer<typeof DocumentSchema>;
export type DocumentCreate = z.infer<typeof DocumentCreateSchema>;
