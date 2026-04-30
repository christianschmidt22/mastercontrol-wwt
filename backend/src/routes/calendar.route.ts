import { Router } from 'express';
import { calendarEventModel } from '../models/calendarEvent.model.js';
import { settingsModel } from '../models/settings.model.js';
import { syncCalendar } from '../services/calendarSync.service.js';
import { HttpError } from '../middleware/errorHandler.js';
import { HideEventParamsSchema, HideEventQuerySchema } from '../schemas/calendar.schema.js';

export const calendarRouter = Router();

// GET /api/calendar/today?date=YYYY-MM-DD
// Returns cached events for a given day (defaults to today local date from the
// server clock, but the client should always pass ?date= to avoid timezone drift).
calendarRouter.get('/today', (req, res, next) => {
  const dateParam = typeof req.query['date'] === 'string' ? req.query['date'] : null;
  const dateStr = dateParam ?? new Date().toISOString().slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return next(new HttpError(400, 'date must be YYYY-MM-DD'));
  }

  const { visible, hidden } = calendarEventModel.listForDayPartitioned(dateStr);
  const lastSync = settingsModel.get('calendar_last_sync') ?? null;
  res.json({
    date: dateStr,
    events: visible,
    hidden_events: hidden,
    last_sync: lastSync,
  });
});

// POST /api/calendar/events/:uid/hide?date=YYYY-MM-DD
calendarRouter.post('/events/:uid/hide', (req, res, next) => {
  const params = HideEventParamsSchema.safeParse(req.params);
  if (!params.success) return next(new HttpError(400, 'invalid uid'));
  const query = HideEventQuerySchema.safeParse(req.query);
  if (!query.success) return next(new HttpError(400, 'date must be YYYY-MM-DD'));

  calendarEventModel.hideForDate(params.data.uid, query.data.date);
  res.json({ ok: true });
});

// POST /api/calendar/events/:uid/unhide?date=YYYY-MM-DD
calendarRouter.post('/events/:uid/unhide', (req, res, next) => {
  const params = HideEventParamsSchema.safeParse(req.params);
  if (!params.success) return next(new HttpError(400, 'invalid uid'));
  const query = HideEventQuerySchema.safeParse(req.query);
  if (!query.success) return next(new HttpError(400, 'date must be YYYY-MM-DD'));

  calendarEventModel.unhideForDate(params.data.uid, query.data.date);
  res.json({ ok: true });
});

// POST /api/calendar/sync — on-demand sync triggered from the UI refresh button.
calendarRouter.post('/sync', async (_req, res, next) => {
  try {
    const result = await syncCalendar();
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});
