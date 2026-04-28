import { z } from 'zod';

const MetadataValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const MetadataSchema = z.record(z.string(), MetadataValueSchema);

export const OrgTypeSchema = z.enum(['customer', 'oem']);

export const OrganizationSchema = z.object({
  id: z.number().int(),
  type: OrgTypeSchema,
  name: z.string(),
  metadata: MetadataSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const OrganizationCreateSchema = z.object({
  type: OrgTypeSchema,
  name: z.string().min(1),
  metadata: MetadataSchema.optional().nullable(),
});

export const OrganizationUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    metadata: MetadataSchema.optional().nullable(),
  })
  // .strict() rejects unknown fields (e.g. `type`) which would otherwise
  // be silently ignored and let invalid payloads reach the model.
  .strict()
  .refine((data) => data.name !== undefined || data.metadata !== undefined, {
    message: 'At least one organization field is required.',
  });

/** GET /organizations/recent?limit= query */
export const RecentOrgsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/** GET /organizations?type= query */
export const OrgTypeQuerySchema = z.object({
  type: OrgTypeSchema.optional(),
});

/** GET /organizations/last-touched?type= query — type is required */
export const OrgLastTouchedQuerySchema = z.object({
  type: OrgTypeSchema,
});

/** GET /organizations/:id/notes?limit=&include_unconfirmed= query */
export const OrgNotesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().optional(),
  include_unconfirmed: z.enum(['true', 'false']).optional(),
});

export type OrgType = z.infer<typeof OrgTypeSchema>;
export type MetadataValue = z.infer<typeof MetadataValueSchema>;
export type Metadata = z.infer<typeof MetadataSchema>;
export type Organization = z.infer<typeof OrganizationSchema>;
export type OrganizationCreate = z.infer<typeof OrganizationCreateSchema>;
export type OrganizationUpdate = z.infer<typeof OrganizationUpdateSchema>;
