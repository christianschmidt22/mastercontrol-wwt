import { z } from 'zod';

export const ContactSchema = z.object({
  id: z.number().int(),
  organization_id: z.number().int(),
  name: z.string(),
  title: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  role: z.string().optional().nullable(),
  details: z.string().optional().nullable(),
  created_at: z.string(),
  assigned_org_ids: z.array(z.number().int()).default([]),
});

export const ContactCreateSchema = z.object({
  organization_id: z.number().int(),
  name: z.string().min(1),
  title: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  role: z.string().optional().nullable(),
  details: z.string().optional().nullable(),
  assigned_org_ids: z.array(z.number().int()).optional(),
});

export const ContactUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  title: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  role: z.string().optional().nullable(),
  details: z.string().optional().nullable(),
  assigned_org_ids: z.array(z.number().int()).optional(),
});

export const ContactListQuerySchema = z.object({
  org_id: z.coerce.number().int().positive().optional(),
  q: z.string().optional(),
});

export const ContactEnrichmentSuggestionSchema = z.object({
  name: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()).default([]),
});

export const ContactEnrichmentResponseSchema = z.object({
  contact_id: z.number().int(),
  suggestions: ContactEnrichmentSuggestionSchema,
  notes: z.array(z.string()).default([]),
});

export type Contact = z.infer<typeof ContactSchema>;
export type ContactCreate = z.infer<typeof ContactCreateSchema>;
export type ContactUpdate = z.infer<typeof ContactUpdateSchema>;
export type ContactEnrichmentResponse = z.infer<typeof ContactEnrichmentResponseSchema>;
