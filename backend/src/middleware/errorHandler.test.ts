/**
 * errorHandler.test.ts — R-013
 *
 * Verifies:
 *  - The redact() helper strips all known secret key names.
 *  - Anthropic-shaped errors collapse to status + type in stderr; no headers.
 *  - 400 response bodies never echo redacted field values.
 *  - console.error is captured via vi.spyOn.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { errorHandler, __testing } from './errorHandler.js';

const { redact, REDACT_KEYS } = __testing;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRes() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { status, json, _status: status, _json: json } as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
}

function makeReq(): Request {
  return {} as Request;
}

function makeNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

// ---------------------------------------------------------------------------
// __testing.redact — unit tests
// ---------------------------------------------------------------------------

describe('redact() — unit', () => {
  it('strips anthropic_api_key value', () => {
    const out = redact({ anthropic_api_key: 'sk-ant-secret' }) as Record<string, unknown>;
    expect(out['anthropic_api_key']).toBe('***redacted***');
  });

  it('strips authorization header value', () => {
    const out = redact({ authorization: 'Bearer sk-ant-secret' }) as Record<string, unknown>;
    expect(out['authorization']).toBe('***redacted***');
  });

  it('strips x-api-key header value', () => {
    const out = redact({ 'x-api-key': 'some-key' }) as Record<string, unknown>;
    expect(out['x-api-key']).toBe('***redacted***');
  });

  it('strips value field (settings PUT payload)', () => {
    const out = redact({ value: 'sk-ant-secret' }) as Record<string, unknown>;
    expect(out['value']).toBe('***redacted***');
  });

  it('strips apiKey field', () => {
    const out = redact({ apiKey: 'sk-ant-secret' }) as Record<string, unknown>;
    expect(out['apiKey']).toBe('***redacted***');
  });

  it('strips api_key field', () => {
    const out = redact({ api_key: 'sk-ant-secret' }) as Record<string, unknown>;
    expect(out['api_key']).toBe('***redacted***');
  });

  it('is case-insensitive for key matching', () => {
    const out = redact({ Authorization: 'Bearer token' }) as Record<string, unknown>;
    expect(out['Authorization']).toBe('***redacted***');
  });

  it('preserves non-secret fields', () => {
    const out = redact({ message: 'hello', status: 400 }) as Record<string, unknown>;
    expect(out['message']).toBe('hello');
    expect(out['status']).toBe(400);
  });

  it('redacts nested secret keys', () => {
    const out = redact({
      outer: {
        anthropic_api_key: 'sk-ant-nested',
        safe: 'fine',
      },
    }) as { outer: Record<string, unknown> };
    expect(out.outer['anthropic_api_key']).toBe('***redacted***');
    expect(out.outer['safe']).toBe('fine');
  });

  it('handles arrays without crashing', () => {
    const out = redact([{ anthropic_api_key: 'x' }, { safe: 'y' }]) as Array<Record<string, unknown>>;
    expect(out[0]['anthropic_api_key']).toBe('***redacted***');
    expect(out[1]['safe']).toBe('y');
  });

  it('handles null and undefined without crashing', () => {
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();
  });

  it('REDACT_KEYS contains all expected entries', () => {
    for (const key of ['anthropic_api_key', 'authorization', 'x-api-key', 'value', 'apikey', 'api_key']) {
      expect(REDACT_KEYS.has(key)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// errorHandler — response shape
// ---------------------------------------------------------------------------

describe('errorHandler — response shape', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('responds with status from HttpError and the error message', () => {
    const err = Object.assign(new Error('Not found'), { status: 404 });
    const res = makeRes();

    errorHandler(err, makeReq(), res, makeNext());

    expect(res.status).toHaveBeenCalledWith(404);
    const jsonArg = (res.status as ReturnType<typeof vi.fn>).mock.results[0].value.json.mock.calls[0][0] as { error: string };
    expect(jsonArg.error).toBe('Not found');
  });

  it('defaults to status 500 when error has no status', () => {
    const err = new Error('Something blew up');
    const res = makeRes();

    errorHandler(err, makeReq(), res, makeNext());

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('400 response body never echoes a redacted field value', () => {
    const err = Object.assign(new Error('Invalid request body — value: too short'), { status: 400 });
    const res = makeRes();

    errorHandler(err, makeReq(), res, makeNext());

    const jsonArg = (res.status as ReturnType<typeof vi.fn>).mock.results[0].value.json.mock.calls[0][0] as { error: string };
    // The response error message contains the zod error text, but NOT the
    // actual secret value. The error message here does not contain the secret.
    expect(jsonArg).not.toHaveProperty('value');
    expect(Object.keys(jsonArg)).toEqual(['error']);
  });

  it('4xx errors do NOT write to console.error', () => {
    const err = Object.assign(new Error('Bad request'), { status: 400 });
    errorHandler(err, makeReq(), makeRes(), makeNext());
    expect(consoleSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// errorHandler — Anthropic-shaped error logging (5xx)
// ---------------------------------------------------------------------------

describe('errorHandler — Anthropic error logging', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('collapses Anthropic error to status + type — no headers or request body in stderr', () => {
    const anthropicErr = {
      status: 529,
      name: 'AnthropicError',
      message: 'Overloaded',
      error: { type: 'overloaded_error', message: 'Overloaded' },
      headers: { 'x-api-key': 'sk-ant-secret-key', authorization: 'Bearer sk-ant-secret' },
      request: { body: JSON.stringify({ api_key: 'sk-ant-secret' }) },
    };

    errorHandler(anthropicErr, makeReq(), makeRes(), makeNext());

    expect(consoleSpy).toHaveBeenCalledOnce();

    const loggedArg = consoleSpy.mock.calls[0][1] as Record<string, unknown>;
    // Must include status and type
    expect(loggedArg).toMatchObject({ status: 529, type: 'overloaded_error' });
    // Must NOT include headers or request body
    expect(JSON.stringify(loggedArg)).not.toContain('sk-ant-secret');
    expect(JSON.stringify(loggedArg)).not.toContain('headers');
    expect(JSON.stringify(loggedArg)).not.toContain('request');
  });

  it('logs generic 500 error with redacted details (no secret values in stderr)', () => {
    const err = Object.assign(new Error('Database error'), {
      status: 500,
      anthropic_api_key: 'sk-ant-should-not-log',
    });

    errorHandler(err, makeReq(), makeRes(), makeNext());

    expect(consoleSpy).toHaveBeenCalledOnce();
    const loggedText = JSON.stringify(consoleSpy.mock.calls);
    expect(loggedText).not.toContain('sk-ant-should-not-log');
  });
});
