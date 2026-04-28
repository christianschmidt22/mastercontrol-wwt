import { Router } from 'express';
import { systemAlertModel } from '../models/systemAlert.model.js';
import { HttpError } from '../middleware/errorHandler.js';
import { z } from 'zod';

export const alertsRouter = Router();

// GET /api/alerts?unread_only=true&limit=50
alertsRouter.get('/', (req, res) => {
  const unreadOnly = req.query['unread_only'] === 'true';
  const limit = Math.min(Number(req.query['limit'] ?? 50), 200);
  const alerts = unreadOnly
    ? systemAlertModel.listUnread()
    : systemAlertModel.listRecent(limit);
  res.json({ alerts, unread_count: systemAlertModel.unreadCount() });
});

// GET /api/alerts/count — lightweight poll for the bell badge
alertsRouter.get('/count', (_req, res) => {
  res.json({ unread_count: systemAlertModel.unreadCount() });
});

// POST /api/alerts/:id/read
alertsRouter.post('/:id/read', (req, res, next) => {
  const id = Number(req.params['id']);
  if (!Number.isInteger(id) || id <= 0) return next(new HttpError(400, 'Invalid id'));
  const ok = systemAlertModel.markRead(id);
  if (!ok) return next(new HttpError(404, 'Alert not found'));
  res.json({ ok: true });
});

// POST /api/alerts/read-all
alertsRouter.post('/read-all', (_req, res) => {
  const changed = systemAlertModel.markAllRead();
  res.json({ ok: true, marked: changed });
});

export { z };
