import { z } from 'zod';

export const ProjectResourceSchema = z.object({
  id: z.number().int(),
  project_id: z.number().int(),
  organization_id: z.number().int(),
  name: z.string(),
  role: z.string().nullable(),
  team: z.string().nullable(),
  notes: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const ProjectResourceCreateSchema = z.object({
  name: z.string().min(1),
  role: z.string().optional().nullable(),
  team: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const ProjectResourceUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.string().optional().nullable(),
  team: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type ProjectResource = z.infer<typeof ProjectResourceSchema>;
export type ProjectResourceCreate = z.infer<typeof ProjectResourceCreateSchema>;
export type ProjectResourceUpdate = z.infer<typeof ProjectResourceUpdateSchema>;
