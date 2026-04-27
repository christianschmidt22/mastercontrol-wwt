/**
 * reports.service.test.ts — Phase 2 / Step 5b/5c.
 *
 * Coverage:
 *   - runReport happy path: directory creation, file write, sha256
 *     computation, summary truncation, schedule.last_run_at update.
 *   - runReport idempotency: a second call with same (schedule_id,
 *     fire_time) is a no-op (single run row, not re-executed).
 *   - runReport failure path: when generateReport throws, the run row is
 *     marked failed with the error message recorded.
 *   - seedDailyTaskReview happy path: creates report + 0 7 * * * schedule.
 *   - seedDailyTaskReview idempotency: second call returns existing rows.
 *
 * The Anthropic SDK is mocked indirectly via `vi.mock('@anthropic-ai/sdk')`
 * — `claude.service.ts → generateReport` builds its client from the SDK
 * default export, so the mock controls every API response. Mocking the SDK
 * (rather than `claude.service.js`) keeps the tested codepath through
 * `generateReport` real, which is what the brief calls for.
 */

// Bootstrap reports tables BEFORE any model file's prepared statements run.
import '../test/reportsSchema.js';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type * as SettingsMod from '../models/settings.model.js';

// ---------------------------------------------------------------------------
// Mock @anthropic-ai/sdk — controls the response generateReport builds.
// vi.mock is hoisted to the top of the file before any imports execute, so
// `claude.service.ts` (imported transitively below) sees the mock client
// from the moment it loads.
// ---------------------------------------------------------------------------

const mockMessagesCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  const MockAnthropic = vi.fn().mockImplementation(() => ({
    messages: { create: mockMessagesCreate },
  }));
  return { default: MockAnthropic };
});

// settingsModel.get is consulted by getClient() for the API key and by
// resolveDefaultModel() for the model id.  Stub it so neither call hits
// real DPAPI / settings rows.
vi.mock('../models/settings.model.js', async (importOriginal) => {
  const actual = await importOriginal<typeof SettingsMod>();
  return {
    ...actual,
    settingsModel: {
      ...actual.settingsModel,
      get: vi.fn((key: string) => {
        if (key === 'anthropic_api_key') return 'sk-ant-mock-key';
        if (key === 'default_model') return null;
        return null;
      }),
    },
  };
});

// ---------------------------------------------------------------------------
// Now import the service under test and the supporting models.
// ---------------------------------------------------------------------------
import {
  runReport,
  seedDailyTaskReview,
  buildPrompt,
  DAILY_TASK_REVIEW_TEMPLATE,
} from './reports.service.js';
import { reportModel } from '../models/report.model.js';
import { reportScheduleModel } from '../models/reportSchedule.model.js';
import { reportRunModel } from '../models/reportRun.model.js';

// ---------------------------------------------------------------------------
// Per-test working directory — runReport writes under
// `<cwd>/reports/<report.id>/<run.id>.md`. We chdir into a fresh tmp dir
// so writes don't pollute the worktree.
// ---------------------------------------------------------------------------

let originalCwd: string;
let tmpRoot: string;

beforeEach(() => {
  originalCwd = process.cwd();
  tmpRoot = mkdtempSync(path.join(tmpdir(), 'mc-reports-test-'));
  process.chdir(tmpRoot);
  mockMessagesCreate.mockReset();
});

afterEach(() => {
  process.chdir(originalCwd);
});

// ---------------------------------------------------------------------------
// Helpers — pre-build a report + schedule for each test.
// ---------------------------------------------------------------------------

function withMockResponse(text: string) {
  mockMessagesCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text }],
  });
}

function makeReportAndSchedule(overrides: {
  name?: string;
  prompt?: string;
} = {}): { reportId: number; scheduleId: number } {
  const report = reportModel.create({
    name: overrides.name ?? `Test report ${Math.random()}`,
    prompt_template: overrides.prompt ?? 'Static prompt body',
    target: ['all'],
  });
  const schedule = reportScheduleModel.upsert(report.id, {
    cron_expr: '0 7 * * *',
    enabled: true,
  });
  return { reportId: report.id, scheduleId: schedule.id };
}

// ---------------------------------------------------------------------------
// runReport — happy path
// ---------------------------------------------------------------------------

describe('runReport — happy path', () => {
  it('creates the output directory, writes the file, hashes it, and stamps the run', async () => {
    const { reportId, scheduleId } = makeReportAndSchedule({
      name: 'Happy report',
    });
    const fakeOutput = '# Daily review\n\nA'.repeat(20);
    withMockResponse(fakeOutput);

    const fireTime = 1700_010_000;
    const result = await runReport(scheduleId, fireTime);

    expect(result.executed).toBe(true);
    expect(result.outputPath).not.toBeNull();

    // Directory exists under <cwd>/reports/<report.id>/
    const expectedDir = path.join(tmpRoot, 'reports', String(reportId));
    expect(statSync(expectedDir).isDirectory()).toBe(true);

    // File exists at <run.id>.md
    expect(existsSync(result.outputPath!)).toBe(true);
    expect(result.outputPath!.endsWith(`${result.runId}.md`)).toBe(true);
    expect(readFileSync(result.outputPath!, 'utf8')).toBe(fakeOutput);

    // Run row stamped: status=done, output_path, sha256, summary, finished_at.
    const run = reportRunModel.get(result.runId)!;
    expect(run.status).toBe('done');
    expect(run.output_path).toBe(result.outputPath);
    expect(run.output_sha256).toBe(
      createHash('sha256').update(fakeOutput, 'utf8').digest('hex'),
    );
    expect(run.summary).toBe(fakeOutput.slice(0, 200));
    expect(run.summary!.length).toBeLessThanOrEqual(200);
    expect(run.finished_at).not.toBeNull();

    // Schedule's last_run_at advanced.
    expect(reportScheduleModel.get(scheduleId)?.last_run_at).toBe(fireTime);
  });

  it('truncates summary at exactly 200 characters even when the output is longer', async () => {
    const { scheduleId } = makeReportAndSchedule({ name: 'Truncate' });
    const longOutput = 'X'.repeat(500);
    withMockResponse(longOutput);

    const result = await runReport(scheduleId, 1700_010_001);
    const run = reportRunModel.get(result.runId)!;

    expect(run.summary).toHaveLength(200);
    expect(run.summary).toBe('X'.repeat(200));
  });
});

// ---------------------------------------------------------------------------
// runReport — idempotency on (schedule_id, fire_time)
// ---------------------------------------------------------------------------

describe('runReport — idempotency', () => {
  it('a second call with the same fire_time is a silent no-op', async () => {
    const { scheduleId } = makeReportAndSchedule({ name: 'Idempotent' });
    const fakeOutput = 'first run output';
    withMockResponse(fakeOutput);

    const fireTime = 1700_020_000;
    const first = await runReport(scheduleId, fireTime);
    expect(first.executed).toBe(true);

    // Second call: should NOT call Anthropic again, should NOT write a new
    // file, should return executed=false referencing the same run row.
    const second = await runReport(scheduleId, fireTime);
    expect(second.executed).toBe(false);
    expect(second.runId).toBe(first.runId);

    // Anthropic was called exactly once.
    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);

    // Only one run row exists for this fire_time.
    const runs = reportRunModel
      .listBySchedule(scheduleId)
      .filter((r) => r.fire_time === fireTime);
    expect(runs).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// runReport — failure path
// ---------------------------------------------------------------------------

describe('runReport — Anthropic failure', () => {
  it('marks the run failed with the error message and rethrows', async () => {
    const { scheduleId } = makeReportAndSchedule({ name: 'Failing' });
    mockMessagesCreate.mockRejectedValueOnce(new Error('upstream blew up'));

    await expect(runReport(scheduleId, 1700_030_000)).rejects.toThrow(
      'upstream blew up',
    );

    const runs = reportRunModel.listBySchedule(scheduleId);
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe('failed');
    expect(runs[0].error).toBe('upstream blew up');
    expect(runs[0].finished_at).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildPrompt — sanity check on template var expansion
// ---------------------------------------------------------------------------

describe('buildPrompt', () => {
  it('replaces every {{var}} in the Daily Task Review template', () => {
    const report = reportModel.create({
      name: 'BuildPrompt test',
      prompt_template: DAILY_TASK_REVIEW_TEMPLATE,
      target: ['all'],
    });
    const expanded = buildPrompt(reportModel.get(report.id)!);
    expect(expanded).not.toContain('{{date}}');
    expect(expanded).not.toContain('{{tasks_due_today}}');
    expect(expanded).not.toContain('{{tasks_overdue}}');
    expect(expanded).not.toContain('{{tasks_stale}}');
    expect(expanded).not.toContain('{{recent_notes}}');
    expect(expanded).not.toContain('{{tasks_due_count}}');
  });
});

// ---------------------------------------------------------------------------
// seedDailyTaskReview — idempotency
// ---------------------------------------------------------------------------

describe('seedDailyTaskReview', () => {
  it('creates the report + 0 7 * * * schedule on first call', () => {
    const result = seedDailyTaskReview();
    expect(result.created).toBe(true);
    expect(result.report.name).toBe('Daily Task Review');
    expect(result.report.prompt_template).toBe(DAILY_TASK_REVIEW_TEMPLATE);
    expect(result.schedule.cron_expr).toBe('0 7 * * *');
    expect(result.schedule.enabled).toBe(true);
  });

  it('a second call returns the existing rows without duplicating', () => {
    const first = seedDailyTaskReview();
    const second = seedDailyTaskReview();

    expect(second.created).toBe(false);
    expect(second.report.id).toBe(first.report.id);
    expect(second.schedule.id).toBe(first.schedule.id);

    // Only one report named "Daily Task Review" exists.
    const all = reportModel.list().filter((r) => r.name === 'Daily Task Review');
    expect(all).toHaveLength(1);

    // Only one schedule attached.
    const schedules = reportScheduleModel.listByReport(first.report.id);
    expect(schedules).toHaveLength(1);
  });
});
