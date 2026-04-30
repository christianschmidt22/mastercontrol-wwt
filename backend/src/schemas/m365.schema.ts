import { z } from 'zod';

/**
 * Body schema for POST /api/m365/test.
 * The endpoint needs no input — it reads config from settings directly.
 * We accept (and ignore) an empty object so the route's validateBody
 * middleware is consistent with other routes.
 */
export const M365TestBodySchema = z.object({}).strict();

export type M365TestBody = z.infer<typeof M365TestBodySchema>;
