import { z } from 'zod';

// ---------------------------------------------------------------------------
// Query schemas
// ---------------------------------------------------------------------------

export const OutlookMessagesQuerySchema = z.object({
  org_id: z.coerce.number().int().min(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// ---------------------------------------------------------------------------
// Response shapes (for documentation / type inference)
// ---------------------------------------------------------------------------

export const OutlookStatusResponseSchema = z.object({
  connected: z.boolean(),
  email: z.string().nullable(),
  last_sync: z.string().nullable(),
});
