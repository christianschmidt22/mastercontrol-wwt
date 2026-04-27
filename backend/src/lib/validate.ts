/**
 * validate.ts — zod-backed Express middlewares.
 *
 * Each validator writes to TWO fields on the Request:
 *   - `req.validated` (legacy, single field) — last-writer-wins. Existing
 *     route handlers read this. It's safe ONLY when a route chains exactly
 *     one validator. Two chained validators silently clobber each other
 *     here, which is why the dedicated fields below were added.
 *   - `req.validatedBody` / `req.validatedQuery` / `req.validatedParams`
 *     (per-source) — never collide. New route handlers should prefer
 *     these. The legacy `req.validated` field is kept so existing routes
 *     continue to read the right value without churn.
 *
 * Migration path: when a route chains two validators, the second one will
 * silently overwrite the first's data on `req.validated`. To prevent that
 * latent bug from biting in the future, write new handlers against the
 * dedicated fields and migrate old ones opportunistically.
 */
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { z } from 'zod';
import { HttpError } from '../middleware/errorHandler.js';

type ZodSchema = z.ZodTypeAny;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      validated: unknown;
      validatedBody: unknown;
      validatedQuery: unknown;
      validatedParams: unknown;
    }
  }
}

function formatZodError(err: z.ZodError): string {
  return err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
}

export function validateBody(schema: ZodSchema): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(new HttpError(400, `Invalid request body — ${formatZodError(result.error)}`));
      return;
    }
    req.validated = result.data;
    req.validatedBody = result.data;
    next();
  };
}

export function validateQuery(schema: ZodSchema): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(new HttpError(400, `Invalid query params — ${formatZodError(result.error)}`));
      return;
    }
    req.validated = result.data;
    req.validatedQuery = result.data;
    next();
  };
}

export function validateParams(schema: ZodSchema): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      next(new HttpError(400, `Invalid path params — ${formatZodError(result.error)}`));
      return;
    }
    req.validated = result.data;
    req.validatedParams = result.data;
    next();
  };
}
