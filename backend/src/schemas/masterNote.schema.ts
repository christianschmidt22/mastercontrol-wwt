import { z } from 'zod';

/** PUT body — autosaved master-note content from the UI. */
export const MasterNoteSaveSchema = z.object({
  content: z.string().max(200_000),
});

/** Path params for org-scoped routes. */
export const OrgIdParamsSchema = z.object({
  orgId: z.coerce.number().int().min(1),
});

/** Path params for project-scoped routes. */
export const OrgProjectIdParamsSchema = z.object({
  orgId: z.coerce.number().int().min(1),
  projectId: z.coerce.number().int().min(1),
});
