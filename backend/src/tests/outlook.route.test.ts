/**
 * outlook.route.test.ts
 *
 * Supertest tests for the 3 Outlook routes. The outlook.service module is
 * mocked so no PowerShell process is spawned.
 *
 * Routes under test:
 *   GET  /api/outlook/status
 *   POST /api/outlook/sync-now
 *   GET  /api/outlook/messages
 *
 * Auth routes (auth-start, auth-poll) were removed when the integration
 * was switched from Microsoft Graph device-code OAuth to Windows COM
 * automation (ADR 0009).
 *
 * NOTE: vitest module mocking requires the mock to be defined BEFORE the
 * module is imported via dynamic import in buildAppWithOutlook(). We use
 * vi.mock() at the top of the file.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { makeOrg } from '../test/factories.js';
import { outlookMessageModel } from '../models/outlookMessage.model.js';

// ---------------------------------------------------------------------------
// Mock outlook.service and outlookSync.service BEFORE any imports that might
// transitively load them.
// ---------------------------------------------------------------------------

vi.mock('../services/outlook.service.js', () => ({
  getOutlookStatus: vi.fn().mockResolvedValue({
    connected: false,
    email: null,
    last_sync: null,
  }),
  fetchOutlookMessages: vi.fn().mockResolvedValue([]),
}));

vi.mock('../services/outlookSync.service.js', () => ({
  syncOutlook: vi.fn().mockResolvedValue(undefined),
}));

// buildApp is imported AFTER mocks are established.
let app: Express;
beforeAll(async () => {
  const { buildAppWithOutlook } = await import('./outlookTestApp.js');
  app = await buildAppWithOutlook();
});

// ---------------------------------------------------------------------------
// GET /api/outlook/status
// ---------------------------------------------------------------------------

describe('GET /api/outlook/status', () => {
  it('returns { connected: false, email: null, last_sync: null } by default', async () => {
    const res = await request(app).get('/api/outlook/status');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      connected: false,
      email: null,
      last_sync: null,
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/outlook/sync-now
// ---------------------------------------------------------------------------

describe('POST /api/outlook/sync-now', () => {
  it('returns { ok: true } after triggering sync', async () => {
    const res = await request(app).post('/api/outlook/sync-now');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// GET /api/outlook/messages
// ---------------------------------------------------------------------------

describe('GET /api/outlook/messages', () => {
  it('rejects missing org_id with 400', async () => {
    const res = await request(app).get('/api/outlook/messages');
    expect(res.status).toBe(400);
  });

  it('rejects org_id=0 with 400', async () => {
    const res = await request(app).get('/api/outlook/messages?org_id=0');
    expect(res.status).toBe(400);
  });

  it('returns an empty array for an org with no linked messages', async () => {
    const org = makeOrg({ name: 'No Messages Org' });
    const res = await request(app).get(
      `/api/outlook/messages?org_id=${org.id}`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns messages linked to the org', async () => {
    const org = makeOrg({ name: 'Messages Org' });
    const msg = outlookMessageModel.upsert({
      internet_message_id: '<route-test-001@example.com>',
      subject: 'Test email',
      from_email: 'sender@example.com',
      sent_at: '2026-04-01T10:00:00Z',
    });
    outlookMessageModel.upsertOrgLink(msg.id, org.id, 0.8);

    const res = await request(app).get(
      `/api/outlook/messages?org_id=${org.id}&limit=5`,
    );
    expect(res.status).toBe(200);
    const body = res.body as Array<{ internet_message_id: string }>;
    expect(body.length).toBe(1);
    expect(body[0].internet_message_id).toBe('<route-test-001@example.com>');
  });

  it('respects the limit query parameter', async () => {
    const org = makeOrg({ name: 'Limit Org Route' });
    for (let i = 1; i <= 5; i++) {
      const msg = outlookMessageModel.upsert({
        internet_message_id: `<limit-route-00${i}@example.com>`,
        sent_at: `2026-04-0${i}T10:00:00Z`,
      });
      outlookMessageModel.upsertOrgLink(msg.id, org.id, 0.9);
    }

    const res = await request(app).get(
      `/api/outlook/messages?org_id=${org.id}&limit=2`,
    );
    expect(res.status).toBe(200);
    expect((res.body as unknown[]).length).toBe(2);
  });
});
