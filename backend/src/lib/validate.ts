import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { z } from 'zod';
import { HttpError } from '../middleware/errorHandler.js';

type ZodSchema = z.ZodTypeAny;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      validated: unknown;
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
    next();
  };
}
