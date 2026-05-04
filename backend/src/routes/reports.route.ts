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
import { z } from 'zod';
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
import { getNextCronTime } from '../lib/cronUtils.js';
import { getReportsRoot } from '../lib/appPaths.js';
import { notifySchedulesChanged } from '../services/scheduler.service.js';

export const reportsRouter = Router();

function parseId(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function getNextCronTimeOrThrow(cronExpr: string): number {
  try {
    return getNextCronTime(cronExpr, Math.floor(Date.now() / 1000));
  } catch {
    throw new HttpError(400, 'Invalid cron expression');
  }
}

// ---------------------------------------------------------------------------
// Reports CRUD
// ---------------------------------------------------------------------------

reportsRouter.get('/', (_req, res) => {
  const rows = reportModel.list().map((report) => {
    const schedule = reportScheduleModel.listByReport(report.id)[0] ?? null;
    const lastRun = schedule ? reportRunModel.getLastRun(schedule.id) : undefined;
    return {
      ...report,
      cron_expr: schedule?.cron_expr,
      next_run_at: schedule?.next_run_at ?? null,
      last_run_at: schedule?.last_run_at ?? null,
      last_run_status: lastRun?.status ?? null,
    };
  });
  res.json(rows);
});

reportsRouter.post('/', validateBody(ReportCreateSchema), (req, res) => {
  const body = req.validated as ReportCreate;
  const nextRunAt = body.cron_expr ? getNextCronTimeOrThrow(body.cron_expr) : undefined;
  const report = reportModel.create({
    name: body.name,
    prompt_template: body.prompt_template,
    target: body.target,
    output_format: body.output_format,
    enabled: body.enabled,
  });
  if ('cron_expr' in body && body.cron_expr) {
    const scheduleEnabled = report.enabled;
    reportScheduleModel.upsert(report.id, {
      cron_expr: body.cron_expr,
      enabled: scheduleEnabled,
      next_run_at: scheduleEnabled ? nextRunAt : null,
    });
    notifySchedulesChanged();
  }
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
    const { cron_expr: cronExpr, ...reportPatch } = patch;
    const nextRunAt = cronExpr ? getNextCronTimeOrThrow(cronExpr) : undefined;
    const updated = reportModel.update(id, reportPatch);
    if (!updated) return next(new HttpError(404, 'Report not found'));
    if (cronExpr) {
      const scheduleEnabled = updated.enabled;
      reportScheduleModel.upsert(id, {
        cron_expr: cronExpr,
        enabled: scheduleEnabled,
        next_run_at: scheduleEnabled ? nextRunAt : null,
      });
      notifySchedulesChanged();
    } else if (patch.enabled !== undefined) {
      const schedule = reportScheduleModel.listByReport(id)[0];
      if (schedule) {
        reportScheduleModel.upsert(id, {
          cron_expr: schedule.cron_expr,
          enabled: updated.enabled,
          next_run_at: updated.enabled
            ? getNextCronTimeOrThrow(schedule.cron_expr)
            : null,
        });
        notifySchedulesChanged();
      }
    }
    res.json(updated);
  },
);

reportsRouter.delete('/:id', (req, res, next) => {
  const id = parseId(req.params.id);
  if (id === null) return next(new HttpError(400, 'Invalid id'));
  const removed = reportModel.remove(id);
  if (!removed) return next(new HttpError(404, 'Report not found'));
  notifySchedulesChanged();
  res.status(204).end();
});

reportsRouter.get('/:id/runs/:run_id/download', (req, res, next) => {
  const id = parseId(req.params.id);
  if (id === null) return next(new HttpError(400, 'Invalid id'));

  const runId = parseId(req.params.run_id);
  if (runId === null) return next(new HttpError(400, 'Invalid run_id'));

  const report = reportModel.get(id);
  if (!report) return next(new HttpError(404, 'Report not found'));

  const run = reportRunModel.get(runId);
  if (!run) return next(new HttpError(404, 'Run not found'));

  const schedule = reportScheduleModel.get(run.schedule_id);
  if (!schedule || schedule.report_id !== id) {
    return next(new HttpError(400, 'Run does not belong to this report'));
  }

  if (run.status !== 'done' || run.output_path === null) {
    return next(new HttpError(404, 'Run has no output'));
  }

  let absPath: string;
  try {
    absPath = resolveSafePath(run.output_path, getReportsRoot());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return next(new HttpError(404, `Output file not accessible: ${msg}`));
  }

  res.download(absPath);
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
    const nextRunAt = getNextCronTimeOrThrow(body.cron_expr);
    const schedule = reportScheduleModel.upsert(id, {
      cron_expr: body.cron_expr,
      enabled: body.enabled,
      next_run_at: body.enabled === false ? null : nextRunAt,
    });
    notifySchedulesChanged();
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
  const reportsRoot = getReportsRoot();
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

// ---------------------------------------------------------------------------
// Run content — GET /:reportId/runs/:runId/content
// Alias for the output endpoint using validated numeric params via zod.
// Returns { content: string } for the MarkdownViewer component.
// ---------------------------------------------------------------------------

const RunContentParamsSchema = z.object({
  reportId: z.string().regex(/^\d+$/, 'reportId must be a positive integer'),
  runId:    z.string().regex(/^\d+$/, 'runId must be a positive integer'),
});

reportsRouter.get('/:reportId/runs/:runId/content', (req, res, next) => {
  const parsed = RunContentParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    return next(new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid params'));
  }

  const reportId = Number(parsed.data.reportId);
  const runId    = Number(parsed.data.runId);

  const report = reportModel.get(reportId);
  if (!report) return next(new HttpError(404, 'Report not found'));

  const run = reportRunModel.get(runId);
  if (!run) return next(new HttpError(404, 'Run not found'));

  // Verify ownership — run must belong to a schedule of this report.
  const schedule = reportScheduleModel.get(run.schedule_id);
  if (!schedule || schedule.report_id !== reportId) {
    return next(new HttpError(400, 'Run does not belong to this report'));
  }

  if (run.output_path === null) {
    return next(new HttpError(404, 'Run has no output file'));
  }

  const reportsRoot = getReportsRoot();
  let absPath: string;
  try {
    absPath = resolveSafePath(run.output_path, reportsRoot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Distinguish "outside vault" (403) from "file missing" (404).
    if (msg.includes('escapes root')) {
      return next(new HttpError(403, 'Output file path is outside the reports root'));
    }
    return next(new HttpError(404, `Output file not accessible: ${msg}`));
  }

  let content: string;
  try {
    content = readFileSync(absPath, 'utf8');
  } catch {
    return next(new HttpError(404, 'Output file not found on disk'));
  }

  res.json({ content });
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
