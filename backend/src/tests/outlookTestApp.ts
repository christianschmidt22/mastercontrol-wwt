/**
 * outlookTestApp.ts — test Express app that mounts only the outlook router.
 *
 * Kept separate from buildApp() because buildApp() does not include the
 * outlook route (it was added after buildApp's static mount list). This
 * helper builds a minimal app with just the routes the outlook test needs.
 */

import express, { type Express } from 'express';
import { errorHandler } from '../middleware/errorHandler.js';
import { outlookRouter } from '../routes/outlook.route.js';

// Also mount org route so makeOrg() results are queryable (not strictly needed
// for these tests, but keeps the app consistent with prod).
let _app: Express | null = null;

export async function buildAppWithOutlook(): Promise<Express> {
  if (_app) return _app;

  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/outlook', outlookRouter);

  app.use(errorHandler);

  _app = app;
  return app;
}
