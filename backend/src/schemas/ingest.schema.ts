import { z } from 'zod';

/**
 * Phase 2 — zod request schemas for the ingest module.
 * All param schemas are `.strict()` so unknown keys are rejected.
 */

/** Params for routes that take an ingest_error id (e.g. POST /errors/:id/retry). */
export const IngestErrorIdParamSchema = z
  .object({
    id: z.coerce.number().int().positive(),
  })
  .strict();
