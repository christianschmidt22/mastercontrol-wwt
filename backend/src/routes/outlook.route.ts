/**
 * outlook.route.ts — Outlook integration endpoints.
 *
 * Routes:
 *   GET  /api/outlook/status        → { connected, email, last_sync }
 *   POST /api/outlook/sync-now      → triggers immediate sync; returns { ok: true }
 *   GET  /api/outlook/messages      → OutlookMessage[] filtered by org_id
 *
 * Auth routes removed: COM automation reads directly from the local Outlook
 * desktop app — no OAuth, no device-code flow required (ADR 0009).
 *
 * R-013: Errors go through next(err) — never log req.body or raw error objects.
 */

import { Router } from 'express';
import { validateQuery } from '../lib/validate.js';
import { getOutlookStatus } from '../services/outlook.service.js';
import { syncOutlook } from '../services/outlookSync.service.js';
import { outlookMessageModel } from '../models/outlookMessage.model.js';
import { OutlookMessagesQuerySchema } from '../schemas/outlook.schema.js';

export const outlookRouter = Router();

// ---------------------------------------------------------------------------
// GET /api/outlook/status
// ---------------------------------------------------------------------------

outlookRouter.get('/status', (_req, res, next) => {
  getOutlookStatus()
    .then((status) => res.json(status))
    .catch(next);
});

// ---------------------------------------------------------------------------
// POST /api/outlook/sync-now
// ---------------------------------------------------------------------------

outlookRouter.post('/sync-now', (_req, res, next) => {
  syncOutlook()
    .then(() => res.json({ ok: true }))
    .catch(next);
});

// ---------------------------------------------------------------------------
// GET /api/outlook/messages?org_id=N&limit=20
// ---------------------------------------------------------------------------

outlookRouter.get(
  '/messages',
  validateQuery(OutlookMessagesQuerySchema),
  (req, res, next) => {
    try {
      const { org_id, limit } = req.validated as { org_id: number; limit: number };
      const messages = outlookMessageModel.findByOrg(org_id, limit);
      res.json(messages);
    } catch (err) {
      next(err);
    }
  },
);
