import { z } from 'zod';

export const NoteRoleSchema = z.enum([
  'user',
  'assistant',
  'agent_insight',
  'imported',
]);

// Provenance JSON shape — captured as a typed object then stored as JSON in the DB
export const NoteProvenanceSchema = z
  .object({
    tool: z.string().optional(),
    source_thread_id: z.number().int().optional(),
    source_org_id: z.number().int().optional(),
    web_citations: z.array(z.string()).optional(),
  })
  .nullable();

export const NoteSchema = z.object({
  id: z.number().int(),
  organization_id: z.number().int(),
  content: z.string(),
  ai_response: z.string().nullable(),
  source_path: z.string().nullable(),
  file_mtime: z.string().nullable(),
  role: NoteRoleSchema,
  thread_id: z.number().int().nullable(),
  provenance: NoteProvenanceSchema,
  confirmed: z.boolean(),
  created_at: z.string(),
});

export const NoteCreateSchema = z.object({
  organization_id: z.number().int(),
  project_id: z.number().int().min(1).optional().nullable(),
  content: z.string().min(1),
  role: NoteRoleSchema.optional(),
  thread_id: z.number().int().optional().nullable(),
  provenance: NoteProvenanceSchema.optional(),
});

export const CaptureNoteSchema = z.object({
  organization_id: z.number().int().min(1),
  project_id: z.number().int().min(1).optional().nullable(),
  content: z.string().min(1),
  capture_source: z.string().trim().min(1).max(120).optional().nullable(),
});

export const NoteProposalStatusSchema = z.enum([
  'pending',
  'approved',
  'denied',
  'discussing',
]);

export const NoteProposalQuerySchema = z.object({
  status: NoteProposalStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const NoteProposalStatusUpdateSchema = z.object({
  status: z.enum(['approved', 'denied', 'discussing']),
  discussion: z.string().max(2000).optional().nullable(),
});

export const NoteProposalParamsSchema = z.object({
  id: z.coerce.number().int().min(1),
});

/** GET /api/notes/recent query params — limit clamped to max 50 */
export const RecentNotesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

/** GET /api/notes/unconfirmed query params */
export const UnconfirmedInsightsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/** GET /api/notes/cross-org-insights query params */
export const CrossOrgInsightsQuerySchema = z.object({
  org_id: z.coerce.number().int().min(1),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/** Shape returned by GET /api/notes/unconfirmed — Note + org fields */
export const NoteWithOrgSchema = NoteSchema.extend({
  org_name: z.string(),
  org_type: z.string(),
});

export type NoteRole = z.infer<typeof NoteRoleSchema>;
export type NoteProvenance = z.infer<typeof NoteProvenanceSchema>;
export type Note = z.infer<typeof NoteSchema>;
export type NoteCreate = z.infer<typeof NoteCreateSchema>;
export type CaptureNote = z.infer<typeof CaptureNoteSchema>;
export type NoteProposalStatus = z.infer<typeof NoteProposalStatusSchema>;
export type NoteWithOrg = z.infer<typeof NoteWithOrgSchema>;
