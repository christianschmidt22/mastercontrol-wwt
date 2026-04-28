import { Router } from 'express';
import { calendarEventModel } from '../models/calendarEvent.model.js';
import { settingsModel } from '../models/settings.model.js';
import { syncCalendar } from '../services/calendarSync.service.js';
import { HttpError } from '../middleware/errorHandler.js';

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

  const events = calendarEventModel.listForDay(dateStr);
  const lastSync = settingsModel.get('calendar_last_sync') ?? null;
  res.json({ date: dateStr, events, last_sync: lastSync });
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
