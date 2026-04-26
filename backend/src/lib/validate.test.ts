/**
 * validate.test.ts
 *
 * Tests for validateBody, validateQuery, validateParams middleware.
 * Uses fake Express req/res/next objects — no HTTP server needed.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validateBody, validateQuery, validateParams } from './validate.js';

// ---------------------------------------------------------------------------
// Helpers: build minimal Express req/res/next fakes
// ---------------------------------------------------------------------------

function makeRes(): Response {
  return {} as Response;
}

function makeNext(): NextFunction {
  return vi.fn();
}

/**
 * Build a fake Request with the given property.
 * We augment with `validated` because the middleware assigns `req.validated`.
 */
function makeReq(part: Partial<Request> & { validated?: unknown }): Request {
  return { ...part } as Request & { validated: unknown };
}

// ---------------------------------------------------------------------------
// Schema fixtures
// ---------------------------------------------------------------------------

const bodySchema = z.object({
  name: z.string().min(1, 'name is required'),
  type: z.enum(['customer', 'oem']),
});

const querySchema = z.object({
  limit: z.string().regex(/^\d+$/, 'limit must be numeric').optional(),
});

const paramsSchema = z.object({
  id: z.string().regex(/^\d+$/, 'id must be numeric'),
});

// ---------------------------------------------------------------------------
// validateBody
// ---------------------------------------------------------------------------

describe('validateBody', () => {
  it('calls next() with no args and stashes parsed value on req.validated for valid input', () => {
    const mw = validateBody(bodySchema);
    const req = makeReq({ body: { name: 'Fairview', type: 'customer' } });
    const res = makeRes();
    const next = makeNext();

    mw(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect((req as Request & { validated: unknown }).validated).toEqual({
      name: 'Fairview',
      type: 'customer',
    });
  });

  it('calls next(HttpError(400, ...)) with field error message when body is invalid', () => {
    const mw = validateBody(bodySchema);
    const req = makeReq({ body: { name: '', type: 'customer' } }); // name too short
    const res = makeRes();
    const next = makeNext();

    mw(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    const errorArg = (next as ReturnType<typeof vi.fn>).mock.calls[0][0] as Error & { status: number };
    expect(errorArg).toBeInstanceOf(Error);
    expect(errorArg.status).toBe(400);
    expect(errorArg.message).toMatch(/name is required/);
  });

  it('includes the field path in the error message', () => {
    const mw = validateBody(bodySchema);
    const req = makeReq({ body: { name: 'Ok', type: 'invalid_type' } });
    const res = makeRes();
    const next = makeNext();

    mw(req, res, next);

    const errorArg = (next as ReturnType<typeof vi.fn>).mock.calls[0][0] as Error;
    expect(errorArg.message).toMatch(/type/);
  });

  it('does not call next() without args when validation fails', () => {
    const mw = validateBody(bodySchema);
    const req = makeReq({ body: {} });
    const res = makeRes();
    const next = makeNext();

    mw(req, res, next);

    // next was called, but with an error argument (not empty)
    expect((next as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// validateQuery
// ---------------------------------------------------------------------------

describe('validateQuery', () => {
  it('calls next() and stashes parsed value for valid query', () => {
    const mw = validateQuery(querySchema);
    const req = makeReq({ query: { limit: '10' } });
    const res = makeRes();
    const next = makeNext();

    mw(req, res, next);

    expect(next).toHaveBeenCalledWith();
    const validated = (req as Request & { validated: unknown }).validated as { limit?: string };
    expect(validated.limit).toBe('10');
  });

  it('produces 400 with field error for invalid query param', () => {
    const mw = validateQuery(querySchema);
    const req = makeReq({ query: { limit: 'not-a-number' } });
    const res = makeRes();
    const next = makeNext();

    mw(req, res, next);

    const errorArg = (next as ReturnType<typeof vi.fn>).mock.calls[0][0] as Error & { status: number };
    expect(errorArg.status).toBe(400);
    expect(errorArg.message).toMatch(/limit must be numeric/);
  });

  it('passes when optional param is absent', () => {
    const mw = validateQuery(querySchema);
    const req = makeReq({ query: {} });
    const res = makeRes();
    const next = makeNext();

    mw(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });
});

// ---------------------------------------------------------------------------
// validateParams
// ---------------------------------------------------------------------------

describe('validateParams', () => {
  it('calls next() and stashes parsed value for valid params', () => {
    const mw = validateParams(paramsSchema);
    const req = makeReq({ params: { id: '42' } });
    const res = makeRes();
    const next = makeNext();

    mw(req, res, next);

    expect(next).toHaveBeenCalledWith();
    const validated = (req as Request & { validated: unknown }).validated as { id: string };
    expect(validated.id).toBe('42');
  });

  it('produces 400 with field error for invalid path param', () => {
    const mw = validateParams(paramsSchema);
    const req = makeReq({ params: { id: 'not-a-number' } });
    const res = makeRes();
    const next = makeNext();

    mw(req, res, next);

    const errorArg = (next as ReturnType<typeof vi.fn>).mock.calls[0][0] as Error & { status: number };
    expect(errorArg.status).toBe(400);
    expect(errorArg.message).toMatch(/id must be numeric/);
  });

  it('error message prefix is "Invalid path params"', () => {
    const mw = validateParams(paramsSchema);
    const req = makeReq({ params: { id: 'bad' } });
    const res = makeRes();
    const next = makeNext();

    mw(req, res, next);

    const errorArg = (next as ReturnType<typeof vi.fn>).mock.calls[0][0] as Error;
    expect(errorArg.message).toMatch(/Invalid path params/);
  });

  it('query error message prefix is "Invalid query params"', () => {
    const mw = validateQuery(querySchema);
    const req = makeReq({ query: { limit: 'x' } });
    const res = makeRes();
    const next = makeNext();

    mw(req, res, next);

    const errorArg = (next as ReturnType<typeof vi.fn>).mock.calls[0][0] as Error;
    expect(errorArg.message).toMatch(/Invalid query params/);
  });

  it('body error message prefix is "Invalid request body"', () => {
    const mw = validateBody(bodySchema);
    const req = makeReq({ body: { type: 'oem' } }); // missing name
    const res = makeRes();
    const next = makeNext();

    mw(req, res, next);

    const errorArg = (next as ReturnType<typeof vi.fn>).mock.calls[0][0] as Error;
    expect(errorArg.message).toMatch(/Invalid request body/);
  });
});
