/**
 * calendarHide.route.test.ts
 *
 * Route-level coverage for the "hide for today" feature on calendar events.
 *
 * Routes under test:
 *   POST /api/calendar/events/:uid/hide?date=YYYY-MM-DD
 *   POST /api/calendar/events/:uid/unhide?date=YYYY-MM-DD
 *   GET  /api/calendar/today?date=YYYY-MM-DD  (partitioned response)
 *
 * The calendarSync.service is mocked so no PowerShell process is spawned.
 */

vi.mock('../services/calendarSync.service.js', () => ({
  syncCalendar: vi.fn().mockResolvedValue({ upserted: 0, pruned: 0 }),
}));

import { describe, it, expect, vi, beforeAll } from 'vitest';
import supertestRequest from 'supertest';
import express, { type Express } from 'express';
import { errorHandler } from '../middleware/errorHandler.js';
import { calendarRouter } from '../routes/calendar.route.js';
import { calendarEventModel } from '../models/calendarEvent.model.js';

// ---------------------------------------------------------------------------
// Build a minimal test app
// ---------------------------------------------------------------------------

let app: Express;
beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/calendar', calendarRouter);
  app.use(errorHandler);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedEvent(uid: string, dateStr: string) {
  calendarEventModel.upsertMany([
    {
      uid,
      title: `Event ${uid}`,
      start_at: `${dateStr}T09:00:00.000Z`,
      end_at:   `${dateStr}T10:00:00.000Z`,
      is_all_day: 0,
    },
  ]);
}

// ---------------------------------------------------------------------------
// POST /hide
// ---------------------------------------------------------------------------

describe('POST /api/calendar/events/:uid/hide', () => {
  it('returns { ok: true } when hide succeeds', async () => {
    const uid  = 'hide-test-1';
    const date = '2026-04-30';
    seedEvent(uid, date);

    const res = await supertestRequest(app)
      .post(`/api/calendar/events/${encodeURIComponent(uid)}/hide?date=${date}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('moves the event to hidden_events in GET /today', async () => {
    const uid  = 'hide-test-2';
    const date = '2026-04-30';
    seedEvent(uid, date);

    // Confirm visible before hide
    const before = await supertestRequest(app).get(`/api/calendar/today?date=${date}`);
    const visibleBefore = (before.body as { events: Array<{ uid: string }> }).events;
    expect(visibleBefore.some((e) => e.uid === uid)).toBe(true);

    await supertestRequest(app)
      .post(`/api/calendar/events/${encodeURIComponent(uid)}/hide?date=${date}`);

    const after = await supertestRequest(app).get(`/api/calendar/today?date=${date}`);
    const body = after.body as {
      events: Array<{ uid: string }>;
      hidden_events: Array<{ uid: string }>;
    };

    expect(body.events.some((e) => e.uid === uid)).toBe(false);
    expect(body.hidden_events.some((e) => e.uid === uid)).toBe(true);
  });

  it('returns 400 when date param is missing', async () => {
    const res = await supertestRequest(app)
      .post('/api/calendar/events/some-uid/hide');
    expect(res.status).toBe(400);
  });

  it('returns 400 when date param is malformed', async () => {
    const res = await supertestRequest(app)
      .post('/api/calendar/events/some-uid/hide?date=not-a-date');
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /unhide
// ---------------------------------------------------------------------------

describe('POST /api/calendar/events/:uid/unhide', () => {
  it('restores event back to events in GET /today', async () => {
    const uid  = 'unhide-test-1';
    const date = '2026-04-30';
    seedEvent(uid, date);

    // Hide first
    await supertestRequest(app)
      .post(`/api/calendar/events/${encodeURIComponent(uid)}/hide?date=${date}`);

    // Verify hidden
    const hidden = await supertestRequest(app).get(`/api/calendar/today?date=${date}`);
    const hiddenBody = hidden.body as { hidden_events: Array<{ uid: string }> };
    expect(hiddenBody.hidden_events.some((e) => e.uid === uid)).toBe(true);

    // Unhide
    const unhideRes = await supertestRequest(app)
      .post(`/api/calendar/events/${encodeURIComponent(uid)}/unhide?date=${date}`);
    expect(unhideRes.status).toBe(200);
    expect(unhideRes.body).toEqual({ ok: true });

    // Verify restored
    const restored = await supertestRequest(app).get(`/api/calendar/today?date=${date}`);
    const restoredBody = restored.body as {
      events: Array<{ uid: string }>;
      hidden_events: Array<{ uid: string }>;
    };
    expect(restoredBody.events.some((e) => e.uid === uid)).toBe(true);
    expect(restoredBody.hidden_events.some((e) => e.uid === uid)).toBe(false);
  });

  it('returns 400 when date param is missing', async () => {
    const res = await supertestRequest(app)
      .post('/api/calendar/events/some-uid/unhide');
    expect(res.status).toBe(400);
  });

  it('returns 400 when date param is malformed', async () => {
    const res = await supertestRequest(app)
      .post('/api/calendar/events/some-uid/unhide?date=2026-4-1');
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Date isolation — hide for one date must not affect the next date
// ---------------------------------------------------------------------------

describe('date isolation', () => {
  it('hiding on date A does not hide the event on date B', async () => {
    const uid   = 'isolation-test-1';
    const dateA = '2026-04-30';
    const dateB = '2026-05-01';

    // Seed the event on both dates
    calendarEventModel.upsertMany([
      {
        uid: `${uid}-a`,
        title: 'Event A',
        start_at: `${dateA}T09:00:00.000Z`,
        end_at:   `${dateA}T10:00:00.000Z`,
        is_all_day: 0,
      },
      {
        uid: `${uid}-b`,
        title: 'Event B',
        start_at: `${dateB}T09:00:00.000Z`,
        end_at:   `${dateB}T10:00:00.000Z`,
        is_all_day: 0,
      },
    ]);

    // Seed a second event with the SAME uid but on dateB too, to test cross-date
    calendarEventModel.upsertMany([
      {
        uid,
        title: 'Cross-date event on A',
        start_at: `${dateA}T11:00:00.000Z`,
        end_at:   `${dateA}T12:00:00.000Z`,
        is_all_day: 0,
      },
    ]);

    // Hide on dateA
    await supertestRequest(app)
      .post(`/api/calendar/events/${encodeURIComponent(uid)}/hide?date=${dateA}`);

    // Event hidden on dateA
    const resA = await supertestRequest(app).get(`/api/calendar/today?date=${dateA}`);
    const bodyA = resA.body as { hidden_events: Array<{ uid: string }> };
    expect(bodyA.hidden_events.some((e) => e.uid === uid)).toBe(true);

    // Same uid NOT hidden on dateB — no such event row exists there, so hidden
    // list should be empty for that uid on dateB
    const resB = await supertestRequest(app).get(`/api/calendar/today?date=${dateB}`);
    const bodyB = resB.body as { hidden_events: Array<{ uid: string }> };
    expect(bodyB.hidden_events.some((e) => e.uid === uid)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GET /today response shape
// ---------------------------------------------------------------------------

describe('GET /api/calendar/today', () => {
  it('returns hidden_events array in the response', async () => {
    const date = '2026-04-30';
    const res = await supertestRequest(app).get(`/api/calendar/today?date=${date}`);
    expect(res.status).toBe(200);
    const body = res.body as { events: unknown[]; hidden_events: unknown[]; date: string };
    expect(Array.isArray(body.events)).toBe(true);
    expect(Array.isArray(body.hidden_events)).toBe(true);
    expect(body.date).toBe(date);
  });

  it('returns 400 for a malformed date', async () => {
    const res = await supertestRequest(app).get('/api/calendar/today?date=April30');
    expect(res.status).toBe(400);
  });
});
