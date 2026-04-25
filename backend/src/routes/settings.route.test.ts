/**
 * settings.route.test.ts
 *
 * Tests for:
 *   GET  /api/settings/:key
 *   PUT  /api/settings  { key, value }
 *
 * R-003 / R-013 acceptance:
 *   - GET anthropic_api_key returns ***last4 shape, never plaintext.
 *   - PUT with bad payload returns 400 and the response body / error
 *     message does not contain the submitted `value` (redacting error handler).
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildApp } from '../test/app.js';
import { settingsModel } from '../models/settings.model.js';

let app: Express;
beforeAll(async () => {
  app = await buildApp();
});

// ---------------------------------------------------------------------------
// PUT /api/settings  then  GET /api/settings/:key  round-trip
// ---------------------------------------------------------------------------

describe('PUT /api/settings → GET /api/settings/:key', () => {
  it('round-trips a non-secret key (PUT then GET)', async () => {
    const putRes = await request(app)
      .put('/api/settings')
      .send({ key: 'default_model', value: 'claude-sonnet-4-6' });

    expect(putRes.status).toBe(200);

    const getRes = await request(app).get('/api/settings/default_model');
    expect(getRes.status).toBe(200);
    expect(getRes.body).toMatchObject({ key: 'default_model', value: 'claude-sonnet-4-6' });
  });

  it('round-trips another non-secret key (workvault_root)', async () => {
    const putRes = await request(app)
      .put('/api/settings')
      .send({ key: 'workvault_root', value: 'C:\\Users\\Test\\WorkVault' });

    expect(putRes.status).toBe(200);

    const getRes = await request(app).get('/api/settings/workvault_root');
    expect(getRes.status).toBe(200);
    expect((getRes.body as { value: string }).value).toBe('C:\\Users\\Test\\WorkVault');
  });

  it('upserts — second PUT overwrites the value', async () => {
    await request(app)
      .put('/api/settings')
      .send({ key: 'ui.theme', value: 'light' });

    await request(app)
      .put('/api/settings')
      .send({ key: 'ui.theme', value: 'dark' });

    const getRes = await request(app).get('/api/settings/ui.theme');
    expect(getRes.status).toBe(200);
    expect((getRes.body as { value: string }).value).toBe('dark');
  });
});

// ---------------------------------------------------------------------------
// GET /api/settings/:key — 404 for unknown key
// ---------------------------------------------------------------------------

describe('GET /api/settings/:key', () => {
  it('returns 404 for an unknown key', async () => {
    const res = await request(app).get('/api/settings/never_set_key_xyz');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// R-003: anthropic_api_key masking
// ---------------------------------------------------------------------------

describe('anthropic_api_key — masking (R-003)', () => {
  it('GET returns ***last4 shape, never the plaintext', async () => {
    const secret = 'sk-ant-api99-supersecretkey-abcd';

    await request(app)
      .put('/api/settings')
      .send({ key: 'anthropic_api_key', value: secret });

    const getRes = await request(app).get('/api/settings/anthropic_api_key');
    expect(getRes.status).toBe(200);

    const body = getRes.body as { key: string; value: string };
    expect(body.key).toBe('anthropic_api_key');

    // Must NOT be the plaintext
    expect(body.value).not.toBe(secret);

    // Must be ***last4 format
    const last4 = secret.slice(-4);
    expect(body.value).toBe(`***${last4}`);
  });

  it('GET never returns the plaintext in the response body string', async () => {
    const secret = 'sk-ant-unique-secret-7777';

    await request(app)
      .put('/api/settings')
      .send({ key: 'anthropic_api_key', value: secret });

    const getRes = await request(app).get('/api/settings/anthropic_api_key');
    // The raw response text must not contain the original key value
    expect(getRes.text).not.toContain(secret);
  });

  it('model layer get() returns plaintext but getMasked() returns ***last4', () => {
    // White-box: verify the model layer directly enforces the contract
    const secret = 'sk-ant-white-box-test-wxyz';
    settingsModel.set('anthropic_api_key', secret);

    const plaintext = settingsModel.get('anthropic_api_key');
    expect(plaintext).toBe(secret);

    const masked = settingsModel.getMasked('anthropic_api_key');
    expect(masked).toBe(`***${secret.slice(-4)}`);
  });
});

// ---------------------------------------------------------------------------
// R-013: bad payload returns 400 without echoing `value` in response
// ---------------------------------------------------------------------------

describe('PUT /api/settings — zod validation and redaction (R-013)', () => {
  it('returns 400 for missing key', async () => {
    const res = await request(app)
      .put('/api/settings')
      .send({ value: 'orphan-value' });

    expect(res.status).toBe(400);
    // The 400 response body must not echo the value back
    expect(res.text).not.toContain('orphan-value');
  });

  it('returns 400 for empty key', async () => {
    const res = await request(app)
      .put('/api/settings')
      .send({ key: '', value: 'some-value' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for missing value field', async () => {
    const res = await request(app)
      .put('/api/settings')
      .send({ key: 'some_key' });

    expect(res.status).toBe(400);
  });

  it('does not echo the secret value in a 400 error response (R-013 redaction)', async () => {
    // Simulate a malformed request that carries an API key in the `value` field
    // but also has a validation error (empty key).
    const sensitiveValue = 'sk-ant-should-never-appear-in-error';

    const res = await request(app)
      .put('/api/settings')
      .send({ key: '', value: sensitiveValue });

    expect(res.status).toBe(400);
    // R-013: response body must not contain the submitted value
    expect(res.text).not.toContain(sensitiveValue);
  });

  it('console.error is not called with the secret value on a 400', async () => {
    // Capture stderr to verify the error handler (R-013) redacts the value field.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const secretValue = 'sk-ant-error-log-test-zzzz';
    await request(app)
      .put('/api/settings')
      .send({ key: '', value: secretValue });

    // Either console.error was not called at all (validation error handled before
    // the 500-only logging branch) or any calls did not contain the value.
    const calls = spy.mock.calls;
    for (const call of calls) {
      const callStr = JSON.stringify(call);
      expect(callStr).not.toContain(secretValue);
    }

    spy.mockRestore();
  });
});
