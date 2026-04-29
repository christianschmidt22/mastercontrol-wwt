import { Router } from 'express';
import { systemAlertModel, type AlertSeverity } from '../models/systemAlert.model.js';
import { HttpError } from '../middleware/errorHandler.js';
import { validateParams, validateQuery } from '../lib/validate.js';
import { AlertListQuerySchema, AlertParamsSchema } from '../schemas/alert.schema.js';
import type { AlertStatusFilter } from '../schemas/alert.schema.js';

export const alertsRouter = Router();

// GET /api/alerts?status=active&severity=warn&source=calendarSync&limit=50
alertsRouter.get('/', validateQuery(AlertListQuerySchema), (req, res) => {
  const query = req.validatedQuery as {
    unread_only?: 'true' | 'false';
    status?: AlertStatusFilter;
    severity?: AlertSeverity | 'all';
    source?: string;
    limit?: number;
  };
  const status = query.unread_only === 'true' ? 'active' : query.status;
  const activeCount = systemAlertModel.unreadCount();

  res.json({
    alerts: systemAlertModel.listFiltered({
      status,
      severity: query.severity,
      source: query.source,
      limit: query.limit ?? 50,
    }),
    unread_count: activeCount,
    active_count: activeCount,
  });
});

// GET /api/alerts/count - lightweight poll for the bell badge
alertsRouter.get('/count', (_req, res) => {
  const activeCount = systemAlertModel.unreadCount();
  res.json({ unread_count: activeCount, active_count: activeCount });
});

// POST /api/alerts/:id/read
alertsRouter.post('/:id/read', validateParams(AlertParamsSchema), (req, res, next) => {
  const { id } = req.validatedParams as { id: number };
  const ok = systemAlertModel.markRead(id);
  if (!ok) return next(new HttpError(404, 'Alert not found'));
  res.json({ ok: true });
});

// POST /api/alerts/:id/resolve
alertsRouter.post('/:id/resolve', validateParams(AlertParamsSchema), (req, res, next) => {
  const { id } = req.validatedParams as { id: number };
  const ok = systemAlertModel.resolve(id);
  if (!ok) return next(new HttpError(404, 'Alert not found'));
  res.json({ ok: true });
});

// POST /api/alerts/:id/unresolve
alertsRouter.post('/:id/unresolve', validateParams(AlertParamsSchema), (req, res, next) => {
  const { id } = req.validatedParams as { id: number };
  const ok = systemAlertModel.unresolve(id);
  if (!ok) return next(new HttpError(404, 'Alert not found'));
  res.json({ ok: true });
});

// POST /api/alerts/read-all
alertsRouter.post('/read-all', (_req, res) => {
  const changed = systemAlertModel.markAllRead();
  res.json({ ok: true, marked: changed });
});
