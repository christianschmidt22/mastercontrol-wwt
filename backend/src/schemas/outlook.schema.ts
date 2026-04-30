import { z } from 'zod';

// ---------------------------------------------------------------------------
// Query schemas
// ---------------------------------------------------------------------------

export const OutlookMessagesQuerySchema = z.object({
  org_id: z.coerce.number().int().min(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// ---------------------------------------------------------------------------
// Auth poll response
// ---------------------------------------------------------------------------

export const AuthPollStatusSchema = z.enum(['pending', 'success', 'error']);

// ---------------------------------------------------------------------------
// Request body: sync-now (no body required, but we validate the empty case)
// ---------------------------------------------------------------------------
// No body schema needed for sync-now (POST with no payload).

// ---------------------------------------------------------------------------
// Response shapes (for documentation / type inference)
// ---------------------------------------------------------------------------

export const OutlookStatusResponseSchema = z.object({
  connected: z.boolean(),
  email: z.string().nullable(),
  last_sync: z.string().nullable(),
});

export const DeviceCodeStartResponseSchema = z.object({
  user_code: z.string(),
  verification_uri: z.string(),
  expires_in: z.number(),
  /** Server-side device_code is NOT sent to the client to avoid leakage.
   *  The backend stores it in a short-lived module var and polls on behalf
   *  of the client via GET /auth-poll. */
});

export const AuthPollResponseSchema = z.object({
  status: AuthPollStatusSchema,
  message: z.string().optional(),
});
