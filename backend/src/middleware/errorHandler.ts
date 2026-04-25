import type { ErrorRequestHandler } from 'express';

/**
 * R-013: redacting error handler. Default Express error logging includes
 * full request bodies and error stacks; `PUT /api/settings` body contains
 * the Anthropic API key, and Anthropic SDK errors can include the auth
 * header in their `.toJSON()`. The first crash that lands in the user's
 * stdout buffer otherwise leaks the key.
 *
 * Redacts well-known secret keys + the generic `value` field (the settings
 * PUT payload shape). Anthropic SDK errors collapse to status + error
 * type, never headers/request body.
 *
 * Note: callers must still avoid logging note content directly — use the
 * note id. This handler can only catch what reaches it via the error
 * object's properties.
 */

const REDACT_KEYS = new Set<string>([
  'anthropic_api_key',
  'authorization',
  'x-api-key',
  'value', // settings PUT payload
  'apikey',
  'api_key',
]);

const REDACTED = '***redacted***';

function redact(input: unknown, depth = 0): unknown {
  if (depth > 4) return '***depth-limit***';
  if (input === null || input === undefined) return input;
  if (typeof input !== 'object') return input;
  if (Array.isArray(input)) return input.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (REDACT_KEYS.has(k.toLowerCase())) {
      out[k] = REDACTED;
    } else {
      out[k] = redact(v, depth + 1);
    }
  }
  return out;
}

interface AnthropicLikeError {
  status?: number;
  error?: { type?: string; message?: string };
  message?: string;
  name?: string;
}

function isAnthropicError(err: unknown): err is AnthropicLikeError {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { status?: unknown; error?: unknown; name?: unknown };
  if (typeof e.status !== 'number') return false;
  if (typeof e.error === 'object' && e.error !== null) return true;
  return typeof e.name === 'string' && e.name.includes('Anthropic');
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = typeof err?.status === 'number' ? err.status : 500;
  const message = err?.message ?? 'Internal server error';

  if (status >= 500) {
    if (isAnthropicError(err)) {
      // Never log Anthropic err in full — headers/request can leak the key.
      console.error('[error] anthropic', {
        status: err.status,
        type: err.error?.type,
      });
    } else {
      console.error('[error]', {
        message,
        status,
        name: err?.name,
        stack: err?.stack,
        details: redact({ ...err }),
      });
    }
  }

  res.status(status).json({ error: message });
};

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Exported for tests (R-013 acceptance: PUT /api/settings 400 must not echo `value`).
export const __testing = { redact, REDACT_KEYS };
