import { z } from 'zod';

export const ContactSchema = z.object({
  id: z.number().int(),
  organization_id: z.number().int(),
  name: z.string(),
  title: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  role: z.string().optional().nullable(),
  created_at: z.string(),
});

export const ContactCreateSchema = z.object({
  organization_id: z.number().int(),
  name: z.string().min(1),
  title: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  role: z.string().optional().nullable(),
});

export const ContactUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  title: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  role: z.string().optional().nullable(),
});

export type Contact = z.infer<typeof ContactSchema>;
export type ContactCreate = z.infer<typeof ContactCreateSchema>;
export type ContactUpdate = z.infer<typeof ContactUpdateSchema>;
