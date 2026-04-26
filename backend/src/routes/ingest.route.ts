/**
 * ingest.route.ts
 *
 * Manual-trigger endpoints for the WorkVault ingest pipeline (Phase 2, Step 3d).
 *
 *   POST /api/ingest/scan    — trigger a full scan of workvault_root
 *   GET  /api/ingest/status  — most-recent source row + last 20 errors
 *
 * This router is mounted by index.ts (integration step) — do NOT mount it here.
 */

import { Router } from 'express';
import { HttpError } from '../middleware/errorHandler.js';
import { settingsModel } from '../models/settings.model.js';
import { ingestSourceModel } from '../models/ingestSource.model.js';
import { scanWorkvault } from '../services/ingest.service.js';

export const ingestRouter = Router();

// ---------------------------------------------------------------------------
// POST /scan
//
// Reads workvault_root from settings, gets-or-creates the matching
// ingest_sources row, calls scanWorkvault, returns the ScanResult.
//
// No request body — no validateBody needed.
// ---------------------------------------------------------------------------

ingestRouter.post('/scan', async (_req, res, next) => {
  try {
    const rootPath = settingsModel.get('workvault_root');
    if (!rootPath) {
      return next(new HttpError(400, 'workvault_root is not configured in settings'));
    }

    const source = ingestSourceModel.getOrCreate(rootPath, 'workvault');
    const result = await scanWorkvault({ sourceId: source.id, rootPath });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /status
//
// Returns the most-recent ingest_sources row plus the last 20 ingest_errors.
// ---------------------------------------------------------------------------

ingestRouter.get('/status', (_req, res, next) => {
  try {
    const sources = ingestSourceModel.list();
    const latest = sources[0] ?? null;
    const errors = latest ? ingestSourceModel.listErrors(latest.id, 20) : [];

    res.json({ source: latest, errors });
  } catch (err) {
    next(err);
  }
});
