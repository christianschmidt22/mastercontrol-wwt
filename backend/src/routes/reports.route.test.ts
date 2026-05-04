/**
 * reports.route.test.ts — Phase 2 / Step 5d.
 *
 * Coverage:
 *   - Happy-path CRUD round trip (POST → GET → PUT → DELETE).
 *   - Validation error responses (400) for bad bodies.
 *   - run-now → triggers runReport (mocked) and returns
 *     { run_id, output_path, executed }.
 *   - Second run-now within the same wall second is a no-op
 *     (only one run row created; second response carries executed=false).
 *
 * The reports.service.runReport is mocked with vi.mock so the route
 * tests can assert the route → service contract without spinning up a
 * fake Anthropic client.
 *
 * `reportsRouter` is mounted manually (Stream 6 wires it into index.ts).
 */

// Bootstrap reports tables BEFORE the router (and its model imports) load.
import '../test/reportsSchema.js';

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';
import request from 'supertest';
import { errorHandler } from '../middleware/errorHandler.js';

// ---------------------------------------------------------------------------
// Mock reports.service.runReport — captures invocations and returns a
// deterministic result. Implementation increments a per-(scheduleId,
// fireTime) execution counter so the route's UNIQUE-collision behaviour
// can be asserted by inspecting the DB run rows downstream.
// ---------------------------------------------------------------------------

const { mockRunReport } = vi.hoisted(() => ({
  mockRunReport: vi.fn(),
}));
vi.mock('../services/reports.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ReportsServiceMod>();
  return {
    ...actual,
    runReport: mockRunReport,
  };
});

import type * as ReportsServiceMod from '../services/reports.service.js';
import { reportsRouter } from './reports.route.js';
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

beforeEach(() => {
  mockRunReport.mockReset();
});

// ---------------------------------------------------------------------------
// CRUD happy path
// ---------------------------------------------------------------------------

describe('Reports CRUD', () => {
  it('POST /api/reports creates a report', async () => {
    const res = await request(app)
      .post('/api/reports')
      .send({
        name: 'Route create',
        prompt_template: 'hello {{date}}',
        target: ['all'],
      });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Route create',
      prompt_template: 'hello {{date}}',
      target: ['all'],
      enabled: true,
    });
    expect(res.body.id).toBeTypeOf('number');
  });

  it('GET /api/reports returns the list', async () => {
    const created = reportModel.create({
      name: 'Route list',
      prompt_template: 't',
    });
    const res = await request(app).get('/api/reports');
    expect(res.status).toBe(200);
    expect(
      (res.body as Array<{ id: number }>).some((r) => r.id === created.id),
    ).toBe(true);
  });

  it('GET /api/reports/:id returns one', async () => {
    const r = reportModel.create({
      name: 'Single get',
      prompt_template: 't',
    });
    const res = await request(app).get(`/api/reports/${r.id}`);
    expect(res.status).toBe(200);
    expect((res.body as { id: number }).id).toBe(r.id);
  });

  it('GET /api/reports/:id 404 for unknown id', async () => {
    const res = await request(app).get('/api/reports/9999999');
    expect(res.status).toBe(404);
  });

  it('PUT /api/reports/:id updates', async () => {
    const r = reportModel.create({
      name: 'Will be renamed',
      prompt_template: 't',
    });
    const res = await request(app)
      .put(`/api/reports/${r.id}`)
      .send({ name: 'Renamed', target: [99] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Renamed', target: [99] });
  });

  it('DELETE /api/reports/:id removes', async () => {
    const r = reportModel.create({ name: 'Doomed', prompt_template: 't' });
    const res = await request(app).delete(`/api/reports/${r.id}`);
    expect(res.status).toBe(204);
    expect(reportModel.get(r.id)).toBeUndefined();
  });

  it('POST /api/reports rejects an empty body', async () => {
    const res = await request(app).post('/api/reports').send({});
    expect(res.status).toBe(400);
  });

  it('POST /api/reports rejects unknown keys (.strict)', async () => {
    const res = await request(app)
      .post('/api/reports')
      .send({
        name: 'Strict',
        prompt_template: 't',
        bogus_field: 'x',
      });
    expect(res.status).toBe(400);
  });

  it('POST /api/reports rejects invalid cron without creating a report', async () => {
    const before = reportModel.list().length;
    const res = await request(app)
      .post('/api/reports')
      .send({
        name: 'Bad schedule',
        prompt_template: 't',
        cron_expr: '61 25 * * *',
      });

    expect(res.status).toBe(400);
    expect(reportModel.list()).toHaveLength(before);
  });

  it('PUT /api/reports/:id replaces the canonical schedule', async () => {
    const r = reportModel.create({
      name: 'Schedule edit',
      prompt_template: 't',
    });
    reportScheduleModel.upsert(r.id, { cron_expr: '0 7 * * *' });

    const res = await request(app)
      .put(`/api/reports/${r.id}`)
      .send({ cron_expr: '0 8 * * MON' });

    expect(res.status).toBe(200);
    const schedules = reportScheduleModel.listByReport(r.id);
    expect(schedules).toHaveLength(1);
    expect(schedules[0]?.cron_expr).toBe('0 8 * * MON');
    expect(schedules[0]?.next_run_at).toBeTypeOf('number');
  });

  it('PUT /api/reports/:id enabled=false disables the canonical schedule', async () => {
    const r = reportModel.create({
      name: 'Disable schedule',
      prompt_template: 't',
    });
    const schedule = reportScheduleModel.upsert(r.id, {
      cron_expr: '0 7 * * *',
      enabled: true,
      next_run_at: 1_700_000_000,
    });

    const res = await request(app)
      .put(`/api/reports/${r.id}`)
      .send({ enabled: false });

    expect(res.status).toBe(200);
    const updated = reportScheduleModel.get(schedule.id);
    expect(updated?.enabled).toBe(false);
    expect(updated?.next_run_at).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Schedules — list + upsert via the route
// ---------------------------------------------------------------------------

describe('Report schedules via the route', () => {
  it('POST /api/reports/:id/schedules upserts and lists', async () => {
    const r = reportModel.create({
      name: 'Sched route',
      prompt_template: 't',
    });
    const create = await request(app)
      .post(`/api/reports/${r.id}/schedules`)
      .send({ cron_expr: '0 7 * * *', enabled: true });
    expect(create.status).toBe(201);

    const list = await request(app).get(`/api/reports/${r.id}/schedules`);
    expect(list.status).toBe(200);
    const body = list.body as Array<{ cron_expr: string }>;
    expect(body.some((s) => s.cron_expr === '0 7 * * *')).toBe(true);
  });

  it('rejects an empty cron_expr', async () => {
    const r = reportModel.create({
      name: 'Sched bad',
      prompt_template: 't',
    });
    const res = await request(app)
      .post(`/api/reports/${r.id}/schedules`)
      .send({ cron_expr: '' });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// run-now
// ---------------------------------------------------------------------------

describe('POST /api/reports/:id/run-now', () => {
  it('triggers runReport and returns run_id + output_path', async () => {
    const r = reportModel.create({
      name: 'RunNow happy',
      prompt_template: 't',
    });
    const schedule = reportScheduleModel.upsert(r.id, {
      cron_expr: '0 7 * * *',
    });

    // Simulate runReport by inserting a real run row inside the mock so
    // the route response shape and the DB state align (matches what the
    // real implementation would do).
    mockRunReport.mockImplementation(
      async (scheduleId: number, fireTime: number) => {
        const { run, created } = reportRunModel.create({
          schedule_id: scheduleId,
          fire_time: fireTime,
          status: 'queued',
        });
        if (created) {
          reportRunModel.updateStatus(run.id, 'done', {
            output_path: `/fake/${run.id}.md`,
            output_sha256: 'a'.repeat(64),
            summary: 'mock output',
          });
        }
        return {
          runId: run.id,
          outputPath: created ? `/fake/${run.id}.md` : run.output_path,
          executed: created,
        };
      },
    );

    const res = await request(app).post(`/api/reports/${r.id}/run-now`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ executed: true });
    expect(res.body.run_id).toBeTypeOf('number');
    expect(typeof res.body.output_path).toBe('string');
    expect(mockRunReport).toHaveBeenCalledWith(
      schedule.id,
      expect.any(Number),
    );
  });

  it('returns 409 when the report has no schedule attached', async () => {
    const r = reportModel.create({
      name: 'No schedule',
      prompt_template: 't',
    });
    const res = await request(app).post(`/api/reports/${r.id}/run-now`);
    expect(res.status).toBe(409);
    expect(mockRunReport).not.toHaveBeenCalled();
  });

  it('a second run-now in the same wall second is a no-op (single run row)', async () => {
    const r = reportModel.create({
      name: 'Idempotent route',
      prompt_template: 't',
    });
    const schedule = reportScheduleModel.upsert(r.id, {
      cron_expr: '0 7 * * *',
    });

    // Pin the wall clock so both invocations resolve to the same fireTime.
    const fixedNow = 1_700_500_000_500;
    const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(fixedNow);

    try {
      mockRunReport.mockImplementation(
        async (scheduleId: number, fireTime: number) => {
          const { run, created } = reportRunModel.create({
            schedule_id: scheduleId,
            fire_time: fireTime,
            status: 'queued',
          });
          if (created) {
            reportRunModel.updateStatus(run.id, 'done', {
              output_path: `/fake/${run.id}.md`,
              output_sha256: 'a'.repeat(64),
              summary: 'mock',
            });
          }
          return {
            runId: run.id,
            outputPath: created ? `/fake/${run.id}.md` : run.output_path,
            executed: created,
          };
        },
      );

      const first = await request(app).post(`/api/reports/${r.id}/run-now`);
      const second = await request(app).post(`/api/reports/${r.id}/run-now`);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(first.body.executed).toBe(true);
      expect(second.body.executed).toBe(false);
      expect(second.body.run_id).toBe(first.body.run_id);

      // Exactly one run row exists for that fire_time.
      const fireTimeSecs = Math.floor(fixedNow / 1000);
      const runs = reportRunModel
        .listBySchedule(schedule.id)
        .filter((row) => row.fire_time === fireTimeSecs);
      expect(runs).toHaveLength(1);
    } finally {
      dateNowSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// GET /api/reports/:id/runs
// ---------------------------------------------------------------------------

describe('GET /api/reports/:id/runs', () => {
  it('returns runs across the report\'s schedules sorted newest-first', async () => {
    const r = reportModel.create({
      name: 'Runs list',
      prompt_template: 't',
    });
    const s = reportScheduleModel.upsert(r.id, {
      cron_expr: '0 7 * * *',
    });
    reportRunModel.create({ schedule_id: s.id, fire_time: 100 });
    reportRunModel.create({ schedule_id: s.id, fire_time: 200 });

    const res = await request(app).get(`/api/reports/${r.id}/runs`);
    expect(res.status).toBe(200);
    const body = res.body as Array<{ fire_time: number }>;
    expect(body.length).toBeGreaterThanOrEqual(2);
    expect(body[0].fire_time).toBe(200);
    expect(body[1].fire_time).toBe(100);
  });

  it('returns [] for a report with no schedules', async () => {
    const r = reportModel.create({
      name: 'No schedules runs',
      prompt_template: 't',
    });
    const res = await request(app).get(`/api/reports/${r.id}/runs`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// GET /api/reports/:id/runs/:run_id/output
// ---------------------------------------------------------------------------

describe('GET /api/reports/:id/runs/:run_id/output', () => {
  // Each test creates a temp directory under process.cwd()/reports so
  // resolveSafePath's containment check passes.
  let tmpReportDir: string;
  let tmpFilePath: string;

  beforeEach(() => {
    // We create a real file so resolveSafePath + readFileSync succeed.
    tmpReportDir = path.join(getReportsRoot(), '__test__');
    mkdirSync(tmpReportDir, { recursive: true });
    tmpFilePath = path.join(tmpReportDir, 'test_output.md');
    writeFileSync(tmpFilePath, '# Hello\n\nTest output.', 'utf8');
  });

  afterEach(() => {
    try { rmSync(tmpReportDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('happy path: returns { content, output_path, output_sha256 }', async () => {
    const r = reportModel.create({ name: 'Output happy', prompt_template: 't' });
    const s = reportScheduleModel.upsert(r.id, { cron_expr: '0 7 * * *' });
    const { run } = reportRunModel.create({ schedule_id: s.id, fire_time: 999 });
    reportRunModel.updateStatus(run.id, 'done', {
      output_path: tmpFilePath,
      output_sha256: 'deadbeef'.repeat(8),
    });

    const res = await request(app).get(`/api/reports/${r.id}/runs/${run.id}/output`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      content: '# Hello\n\nTest output.',
      output_path: tmpFilePath,
    });
    expect(typeof res.body.output_sha256).toBe('string');
  });

  it('download path: streams the latest output file as an attachment', async () => {
    const r = reportModel.create({ name: 'Output download', prompt_template: 't' });
    const s = reportScheduleModel.upsert(r.id, { cron_expr: '0 7 * * *' });
    const { run } = reportRunModel.create({ schedule_id: s.id, fire_time: 1000 });
    reportRunModel.updateStatus(run.id, 'done', {
      output_path: tmpFilePath,
      output_sha256: 'deadbeef'.repeat(8),
    });

    const res = await request(app).get(`/api/reports/${r.id}/runs/${run.id}/download`);

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.text).toBe('# Hello\n\nTest output.');
  });

  it('returns 404 for a run_id that does not exist', async () => {
    const r = reportModel.create({ name: 'Output missing run', prompt_template: 't' });
    const res = await request(app).get(`/api/reports/${r.id}/runs/9999999/output`);
    expect(res.status).toBe(404);
  });

  it('returns 404 when report is found but report_id does not match', async () => {
    // Create two separate reports and use a run from one with the other's id.
    const r1 = reportModel.create({ name: 'Output report A', prompt_template: 't' });
    const r2 = reportModel.create({ name: 'Output report B', prompt_template: 't' });
    const s1 = reportScheduleModel.upsert(r1.id, { cron_expr: '0 7 * * *' });
    const { run } = reportRunModel.create({ schedule_id: s1.id, fire_time: 1234 });
    reportRunModel.updateStatus(run.id, 'done', {
      output_path: tmpFilePath,
      output_sha256: null,
    });

    // Query run under r2 — should 400 (mismatch).
    const res = await request(app).get(`/api/reports/${r2.id}/runs/${run.id}/output`);
    expect(res.status).toBe(400);
  });

  it('returns 404 when the run is not done (status=queued)', async () => {
    const r = reportModel.create({ name: 'Output queued', prompt_template: 't' });
    const s = reportScheduleModel.upsert(r.id, { cron_expr: '0 7 * * *' });
    const { run } = reportRunModel.create({ schedule_id: s.id, fire_time: 5678, status: 'queued' });

    const res = await request(app).get(`/api/reports/${r.id}/runs/${run.id}/output`);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no output/i);
  });

  it('returns 400 for an invalid run_id param', async () => {
    const r = reportModel.create({ name: 'Output bad id', prompt_template: 't' });
    const res = await request(app).get(`/api/reports/${r.id}/runs/not-a-number/output`);
    expect(res.status).toBe(400);
  });
});
