/**
 * reportsContent.route.test.ts
 *
 * Tests for GET /api/reports/:reportId/runs/:runId/content
 *
 * Coverage:
 *   - Happy path: returns { content } for a done run with a valid output file.
 *   - 404 when the run does not exist.
 *   - 404 when the run is not done (no output_path).
 *   - 403 when the output_path resolves outside the reports root
 *     (path-escape attempt).
 *   - 400 for non-numeric params (reportId / runId).
 *   - 400 when the run belongs to a different report.
 */

// Bootstrap reports tables before any model imports.
import '../test/reportsSchema.js';

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';
import request from 'supertest';
import { errorHandler } from '../middleware/errorHandler.js';
import { reportsRouter } from '../routes/reports.route.js';
import { reportModel } from '../models/report.model.js';
import { reportScheduleModel } from '../models/reportSchedule.model.js';
import { reportRunModel } from '../models/reportRun.model.js';
import { getReportsRoot } from '../lib/appPaths.js';

let app: Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/reports', reportsRouter);
  app.use(errorHandler);
});

// ---------------------------------------------------------------------------
// File helpers — write real files so resolveSafePath + readFileSync succeed.
// ---------------------------------------------------------------------------

let tmpDir: string;
let tmpFile: string;
const CONTENT = '# Hello\n\nThis is test content.';

beforeEach(() => {
  tmpDir = path.join(getReportsRoot(), '__content_test__');
  mkdirSync(tmpDir, { recursive: true });
  tmpFile = path.join(tmpDir, 'output.md');
  writeFileSync(tmpFile, CONTENT, 'utf8');
});

afterEach(() => {
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('GET /api/reports/:reportId/runs/:runId/content', () => {
  it('returns { content } for a done run with an output file', async () => {
    const report = reportModel.create({ name: 'Content happy', prompt_template: 't' });
    const schedule = reportScheduleModel.upsert(report.id, { cron_expr: '0 7 * * *' });
    const { run } = reportRunModel.create({ schedule_id: schedule.id, fire_time: 1000 });
    reportRunModel.updateStatus(run.id, 'done', {
      output_path: tmpFile,
      output_sha256: 'abc'.repeat(21) + 'a', // 64-char dummy
    });

    const res = await request(app).get(
      `/api/reports/${report.id}/runs/${run.id}/content`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ content: CONTENT });
  });

  // ---------------------------------------------------------------------------
  // 404 cases
  // ---------------------------------------------------------------------------

  it('returns 404 when the run does not exist', async () => {
    const report = reportModel.create({ name: 'Content missing run', prompt_template: 't' });
    const res = await request(app).get(
      `/api/reports/${report.id}/runs/9999999/content`,
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when the report does not exist', async () => {
    const res = await request(app).get('/api/reports/9999999/runs/1/content');
    expect(res.status).toBe(404);
  });

  it('returns 404 when the run has no output_path (not done)', async () => {
    const report = reportModel.create({ name: 'Content queued', prompt_template: 't' });
    const schedule = reportScheduleModel.upsert(report.id, { cron_expr: '0 7 * * *' });
    const { run } = reportRunModel.create({ schedule_id: schedule.id, fire_time: 2000, status: 'queued' });

    const res = await request(app).get(
      `/api/reports/${report.id}/runs/${run.id}/content`,
    );
    expect(res.status).toBe(404);
    expect((res.body as { error?: string }).error).toMatch(/no output/i);
  });

  // ---------------------------------------------------------------------------
  // 403 — path escapes vault root
  // ---------------------------------------------------------------------------

  it('returns 403 when the output_path escapes the reports root (existing file)', async () => {
    // We need an EXISTING file outside getReportsRoot() so that realpathSync
    // succeeds (Step 2 in resolveSafePath) and we reach the containment check
    // (Step 3), which then rejects with "escapes root" → 403.
    // Use the project package.json — it exists and is outside the reports root.
    const outsideFile = path.resolve(process.cwd(), 'package.json');
    const reportsRoot = getReportsRoot();

    // Safety: skip this assertion if, by some configuration, outsideFile
    // happens to be inside the reports root (would never happen in practice
    // but keeps the test robust across environments).
    const outsideNorm = path.normalize(outsideFile);
    const rootNorm = path.normalize(reportsRoot) + path.sep;
    if (outsideNorm.startsWith(rootNorm)) {
      return; // environment is unusual — skip rather than false-pass
    }

    const report = reportModel.create({ name: 'Content escape', prompt_template: 't' });
    const schedule = reportScheduleModel.upsert(report.id, { cron_expr: '0 7 * * *' });
    const { run } = reportRunModel.create({ schedule_id: schedule.id, fire_time: 3000 });
    reportRunModel.updateStatus(run.id, 'done', {
      output_path: outsideFile,
      output_sha256: null,
    });

    const res = await request(app).get(
      `/api/reports/${report.id}/runs/${run.id}/content`,
    );
    // resolveSafePath will throw "escapes root" → 403.
    expect(res.status).toBe(403);
  });

  // ---------------------------------------------------------------------------
  // 400 cases — invalid params / ownership mismatch
  // ---------------------------------------------------------------------------

  it('returns 400 for non-numeric reportId', async () => {
    const res = await request(app).get('/api/reports/abc/runs/1/content');
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-numeric runId', async () => {
    const report = reportModel.create({ name: 'Content bad runId', prompt_template: 't' });
    const res = await request(app).get(
      `/api/reports/${report.id}/runs/not-a-number/content`,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when the run belongs to a different report', async () => {
    const r1 = reportModel.create({ name: 'Content report A', prompt_template: 't' });
    const r2 = reportModel.create({ name: 'Content report B', prompt_template: 't' });
    const s1 = reportScheduleModel.upsert(r1.id, { cron_expr: '0 7 * * *' });
    const { run } = reportRunModel.create({ schedule_id: s1.id, fire_time: 4000 });
    reportRunModel.updateStatus(run.id, 'done', {
      output_path: tmpFile,
      output_sha256: null,
    });

    // Query the run under r2 — ownership mismatch.
    const res = await request(app).get(
      `/api/reports/${r2.id}/runs/${run.id}/content`,
    );
    expect(res.status).toBe(400);
  });
});
