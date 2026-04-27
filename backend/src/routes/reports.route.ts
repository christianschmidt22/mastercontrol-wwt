/**
 * reports.route.ts — Phase 2 / Step 5d.
 *
 * Endpoints (validated via zod schemas in `report.schema.ts`):
 *
 *   GET    /api/reports                           → reportModel.list()
 *   POST   /api/reports                           → reportModel.create(body)
 *   GET    /api/reports/:id                       → reportModel.get(id)
 *   PUT    /api/reports/:id                       → reportModel.update(id, body)
 *   DELETE /api/reports/:id                       → reportModel.remove(id)
 *   POST   /api/reports/:id/run-now               → runReport(scheduleId, now)
 *   GET    /api/reports/:id/runs                  → reportRunModel.listBySchedule(...)
 *   GET    /api/reports/:id/runs/:run_id/output   → read & return .md file content
 *   GET    /api/reports/:id/schedules             → reportScheduleModel.listByReport(id)
 *   POST   /api/reports/:id/schedules             → reportScheduleModel.upsert(id, body)
 *
 * `run-now` runs synchronously (awaits runReport) and returns
 * `{ run_id, output_path }` on success. A second run-now in the same wall
 * second is a no-op thanks to UNIQUE(schedule_id, fire_time) — the response
 * still 200s but `executed: false` is returned in the body so callers can
 * distinguish.
 *
 * NOTE (Stream 6): this router is NOT mounted in `index.ts` here — the main
 * agent wires it after all five streams finish.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { reportModel } from '../models/report.model.js';
import { reportScheduleModel } from '../models/reportSchedule.model.js';
import { reportRunModel } from '../models/reportRun.model.js';
import {
  ReportCreateSchema,
  ReportUpdateSchema,
  ReportScheduleUpsertSchema,
  type ReportCreate,
  type ReportUpdate,
  type ReportScheduleUpsert,
} from '../schemas/report.schema.js';
import { validateBody } from '../lib/validate.js';
import { HttpError } from '../middleware/errorHandler.js';
import { runReport } from '../services/reports.service.js';
import { resolveSafePath } from '../lib/safePath.js';

export const reportsRouter = Router();

function parseId(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ---------------------------------------------------------------------------
// Reports CRUD
// ---------------------------------------------------------------------------

reportsRouter.get('/', (_req, res) => {
  res.json(reportModel.list());
});

reportsRouter.post('/', validateBody(ReportCreateSchema), (req, res) => {
  const body = req.validated as ReportCreate;
  const report = reportModel.create({
    name: body.name,
    prompt_template: body.prompt_template,
    target: body.target,
    output_format: body.output_format,
    enabled: body.enabled,
  });
  res.status(201).json(report);
});

reportsRouter.get('/:id', (req, res, next) => {
  const id = parseId(req.params.id);
  if (id === null) return next(new HttpError(400, 'Invalid id'));
  const report = reportModel.get(id);
  if (!report) return next(new HttpError(404, 'Report not found'));
  res.json(report);
});

reportsRouter.put(
  '/:id',
  validateBody(ReportUpdateSchema),
  (req, res, next) => {
    const id = parseId(req.params.id);
    if (id === null) return next(new HttpError(400, 'Invalid id'));
    const patch = req.validated as ReportUpdate;
    const updated = reportModel.update(id, patch);
    if (!updated) return next(new HttpError(404, 'Report not found'));
    res.json(updated);
  },
);

reportsRouter.delete('/:id', (req, res, next) => {
  const id = parseId(req.params.id);
  if (id === null) return next(new HttpError(400, 'Invalid id'));
  const removed = reportModel.remove(id);
  if (!removed) return next(new HttpError(404, 'Report not found'));
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Schedules — listed and upserted under a parent report
// ---------------------------------------------------------------------------

reportsRouter.get('/:id/schedules', (req, res, next) => {
  const id = parseId(req.params.id);
  if (id === null) return next(new HttpError(400, 'Invalid id'));
  const report = reportModel.get(id);
  if (!report) return next(new HttpError(404, 'Report not found'));
  res.json(reportScheduleModel.listByReport(id));
});

reportsRouter.post(
  '/:id/schedules',
  validateBody(ReportScheduleUpsertSchema),
  (req, res, next) => {
    const id = parseId(req.params.id);
    if (id === null) return next(new HttpError(400, 'Invalid id'));
    const report = reportModel.get(id);
    if (!report) return next(new HttpError(404, 'Report not found'));
    const body = req.validated as ReportScheduleUpsert;
    const schedule = reportScheduleModel.upsert(id, {
      cron_expr: body.cron_expr,
      enabled: body.enabled,
      next_run_at: body.next_run_at ?? null,
    });
    res.status(201).json(schedule);
  },
);

// ---------------------------------------------------------------------------
// Runs — list + run-now
// ---------------------------------------------------------------------------

reportsRouter.get('/:id/runs', (req, res, next) => {
  const id = parseId(req.params.id);
  if (id === null) return next(new HttpError(400, 'Invalid id'));
  const report = reportModel.get(id);
  if (!report) return next(new HttpError(404, 'Report not found'));
  const schedules = reportScheduleModel.listByReport(id);
  if (schedules.length === 0) {
    res.json([]);
    return;
  }
  // Aggregate runs across every schedule attached to the report and sort by
  // fire_time DESC so the freshest runs appear first.
  const runs = schedules.flatMap((s) =>
    reportRunModel.listBySchedule(s.id, 50),
  );
  runs.sort((a, b) =>
    b.fire_time !== a.fire_time ? b.fire_time - a.fire_time : b.id - a.id,
  );
  res.json(runs);
});

// ---------------------------------------------------------------------------
// Run output — return .md file content as JSON for inline preview
// ---------------------------------------------------------------------------

reportsRouter.get('/:id/runs/:run_id/output', (req, res, next) => {
  const id = parseId(req.params.id);
  if (id === null) return next(new HttpError(400, 'Invalid id'));

  const runId = parseId(req.params.run_id);
  if (runId === null) return next(new HttpError(400, 'Invalid run_id'));

  const report = reportModel.get(id);
  if (!report) return next(new HttpError(404, 'Report not found'));

  const run = reportRunModel.get(runId);
  if (!run) return next(new HttpError(404, 'Run not found'));

  // Verify the run belongs to a schedule that belongs to this report.
  const schedule = reportScheduleModel.get(run.schedule_id);
  if (!schedule || schedule.report_id !== id) {
    return next(new HttpError(400, 'Run does not belong to this report'));
  }

  if (run.status !== 'done' || run.output_path === null) {
    return next(new HttpError(404, 'Run has no output'));
  }

  // Defense-in-depth: verify the path is inside the reports directory even
  // though it was server-derived (R-026 ethos). The output_path is absolute
  // so we pass it directly — resolveSafePath will resolve + check containment.
  const reportsRoot = path.join(process.cwd(), 'reports');
  let absPath: string;
  try {
    absPath = resolveSafePath(run.output_path, reportsRoot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return next(new HttpError(404, `Output file not accessible: ${msg}`));
  }

  let content: string;
  try {
    content = readFileSync(absPath, 'utf8');
  } catch {
    return next(new HttpError(404, 'Output file not found on disk'));
  }

  res.json({
    content,
    output_path: run.output_path,
    output_sha256: run.output_sha256,
  });
});

reportsRouter.post('/:id/run-now', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return next(new HttpError(400, 'Invalid id'));

    const report = reportModel.get(id);
    if (!report) return next(new HttpError(404, 'Report not found'));

    const schedules = reportScheduleModel.listByReport(id);
    if (schedules.length === 0) {
      return next(
        new HttpError(409, 'Report has no schedule attached — cannot run-now'),
      );
    }

    // Deterministic pick: lowest schedule id (the canonical schedule).
    const schedule = schedules[0];

    // fireTime in UNIX seconds — matches schema (INTEGER) and lets two
    // run-now requests in the same wall second collide on UNIQUE.
    const fireTime = Math.floor(Date.now() / 1000);

    const result = await runReport(schedule.id, fireTime);

    res.status(200).json({
      run_id: result.runId,
      output_path: result.outputPath,
      executed: result.executed,
    });
  } catch (err) {
    next(err);
  }
});
