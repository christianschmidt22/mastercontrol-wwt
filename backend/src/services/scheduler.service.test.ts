/**
 * scheduler.service.test.ts
 *
 * Tests for `runMissedJobs()`. The scheduler depends on Stream 2's
 * `reportScheduleModel.getEnabled()` (returns enabled `report_schedules`
 * rows) and `runReport(scheduleId, fireTime)` (executes a single report
 * run). Both are fully mocked here — this test is a pure logic test for
 * the catch-up decision: "is the most-recent fire-time newer than
 * `last_run_at`?"
 *
 * Cases covered:
 *   - schedule whose `last_run_at` is 24h before the most-recent fire-time
 *     → runReport is called once with that fire-time.
 *   - schedule whose `last_run_at` equals the most-recent fire-time
 *     → runReport is NOT called.
 *
 * `node-cron` is not exercised here; `startInProcessScheduler` registers
 * cron tasks for the lifetime of the test process and we don't want side
 * effects bleeding across tests. Only `runMissedJobs` is tested.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must appear before the SUT import
// ---------------------------------------------------------------------------

const getEnabledMock = vi.fn();
const runReportMock = vi.fn();

vi.mock('../models/reportSchedule.model.js', () => ({
  reportScheduleModel: {
    getEnabled: () => getEnabledMock(),
  },
}));

vi.mock('./reports.service.js', () => ({
  runReport: (scheduleId: number, fireTime: number) => runReportMock(scheduleId, fireTime),
}));

// ---------------------------------------------------------------------------
// Helper to control what `getMostRecentCronTime` returns. Rather than mock
// the cron lib, we just feed schedules with a known `cron_expr` and a
// known query window; for unit-test determinism we mock the cronUtils
// module too.
// ---------------------------------------------------------------------------
const getMostRecentCronTimeMock = vi.fn();

vi.mock('../lib/cronUtils.js', () => ({
  getMostRecentCronTime: (expr: string, nowSecs: number) =>
    getMostRecentCronTimeMock(expr, nowSecs),
  getNextCronTime: vi.fn(),
}));

// Import after mocks are registered.
const { runMissedJobs } = await import('./scheduler.service.js');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  getEnabledMock.mockReset();
  runReportMock.mockReset();
  getMostRecentCronTimeMock.mockReset();
  // Default: runReport resolves immediately so awaits in the SUT complete.
  runReportMock.mockResolvedValue(undefined);
});

describe('runMissedJobs', () => {
  it('calls runReport with the most-recent fire-time when last_run_at is older', async () => {
    const mostRecentFireTime = 1_700_000_000; // arbitrary UNIX seconds
    const lastRunAt = mostRecentFireTime - 86_400; // 24 hours earlier

    getEnabledMock.mockReturnValue([
      {
        id: 42,
        report_id: 1,
        cron_expr: '0 7 * * *',
        enabled: 1,
        next_run_at: null,
        last_run_at: lastRunAt,
        created_at: '2026-04-24T00:00:00Z',
      },
    ]);

    getMostRecentCronTimeMock.mockReturnValue(mostRecentFireTime);

    await runMissedJobs();

    expect(runReportMock).toHaveBeenCalledTimes(1);
    expect(runReportMock).toHaveBeenCalledWith(42, mostRecentFireTime);
  });

  it('does NOT call runReport when last_run_at equals the most-recent fire-time', async () => {
    const mostRecentFireTime = 1_700_000_000;

    getEnabledMock.mockReturnValue([
      {
        id: 42,
        report_id: 1,
        cron_expr: '0 7 * * *',
        enabled: 1,
        next_run_at: null,
        last_run_at: mostRecentFireTime,
        created_at: '2026-04-24T00:00:00Z',
      },
    ]);

    getMostRecentCronTimeMock.mockReturnValue(mostRecentFireTime);

    await runMissedJobs();

    expect(runReportMock).not.toHaveBeenCalled();
  });

  it('skips schedules whose cron expression has no past occurrence (null fire-time)', async () => {
    getEnabledMock.mockReturnValue([
      {
        id: 99,
        report_id: 2,
        cron_expr: '0 7 1 1 *',
        enabled: 1,
        next_run_at: null,
        last_run_at: null,
        created_at: '2026-04-24T00:00:00Z',
      },
    ]);

    getMostRecentCronTimeMock.mockReturnValue(null);

    await runMissedJobs();

    expect(runReportMock).not.toHaveBeenCalled();
  });
});
