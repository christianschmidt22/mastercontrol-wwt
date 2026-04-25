import type { ErrorRequestHandler } from 'express';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = typeof err?.status === 'number' ? err.status : 500;
  const message = err?.message ?? 'Internal server error';
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({ error: message });
};

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
