import { z } from 'zod';

export const ProjectStatusSchema = z.enum([
  'active',
  'qualifying',
  'won',
  'lost',
  'paused',
  'closed',
]);

export const ProjectSchema = z.object({
  id: z.number().int(),
  organization_id: z.number().int(),
  name: z.string(),
  status: ProjectStatusSchema,
  description: z.string().nullable(),
  doc_url: z.string().nullable(),
  notes_url: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const ProjectCreateSchema = z.object({
  organization_id: z.number().int(),
  name: z.string().min(1),
  status: ProjectStatusSchema.optional(),
  description: z.string().optional().nullable(),
  doc_url: z.string().optional().nullable(),
  notes_url: z.string().optional().nullable(),
});

export const ProjectUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  status: ProjectStatusSchema.optional(),
  description: z.string().optional().nullable(),
  doc_url: z.string().optional().nullable(),
  notes_url: z.string().optional().nullable(),
});

export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type ProjectCreate = z.infer<typeof ProjectCreateSchema>;
export type ProjectUpdate = z.infer<typeof ProjectUpdateSchema>;
