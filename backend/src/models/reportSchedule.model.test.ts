/**
 * reportSchedule.model.test.ts — Phase 2 / Step 5a.
 *
 * Covers listByReport / get / getEnabled / upsert / updateLastRun /
 * updateNextRun / remove.
 */

// Bootstrap reports tables BEFORE the model imports its prepared statements.
import '../test/reportsSchema.js';

import { describe, it, expect } from 'vitest';
import { reportModel } from './report.model.js';
import { reportScheduleModel } from './reportSchedule.model.js';

function makeReport(name = 'Sched test report') {
  return reportModel.create({
    name,
    prompt_template: 'template',
    target: ['all'],
  });
}

describe('reportScheduleModel.upsert', () => {
  it('inserts a new schedule on first call', () => {
    const report = makeReport('upsert insert');
    const s = reportScheduleModel.upsert(report.id, {
      cron_expr: '0 7 * * *',
      enabled: true,
    });
    expect(s.id).toBeTypeOf('number');
    expect(s.report_id).toBe(report.id);
    expect(s.cron_expr).toBe('0 7 * * *');
    expect(s.enabled).toBe(true);
    expect(s.next_run_at).toBeNull();
    expect(s.last_run_at).toBeNull();
  });

  it('returns the existing row when called twice for the same report', () => {
    const report = makeReport('upsert dedupe');
    const first = reportScheduleModel.upsert(report.id, {
      cron_expr: '0 7 * * *',
    });
    const second = reportScheduleModel.upsert(report.id, {
      cron_expr: '0 7 * * *',
    });
    expect(second.id).toBe(first.id);
    expect(reportScheduleModel.listByReport(report.id)).toHaveLength(1);
  });

  it('flips enabled on upsert when provided', () => {
    const report = makeReport('upsert toggle');
    const first = reportScheduleModel.upsert(report.id, {
      cron_expr: '0 7 * * *',
      enabled: true,
    });
    const second = reportScheduleModel.upsert(report.id, {
      cron_expr: '0 7 * * *',
      enabled: false,
    });
    expect(second.id).toBe(first.id);
    expect(second.enabled).toBe(false);
  });
});

describe('reportScheduleModel.listByReport / get', () => {
  it('listByReport returns the canonical schedule after cron changes', () => {
    const report = makeReport('multi sched');
    reportScheduleModel.upsert(report.id, { cron_expr: '0 7 * * *' });
    reportScheduleModel.upsert(report.id, { cron_expr: '0 19 * * *' });
    const list = reportScheduleModel.listByReport(report.id);
    expect(list).toHaveLength(1);
    expect(list[0]?.cron_expr).toBe('0 19 * * *');
  });

  it('get fetches by id', () => {
    const report = makeReport('get sched');
    const s = reportScheduleModel.upsert(report.id, {
      cron_expr: '0 7 * * *',
    });
    expect(reportScheduleModel.get(s.id)?.cron_expr).toBe('0 7 * * *');
  });

  it('get returns undefined for unknown id', () => {
    expect(reportScheduleModel.get(9_999_999)).toBeUndefined();
  });
});

describe('reportScheduleModel.getEnabled', () => {
  it('returns only enabled=true schedules', () => {
    const enabledReport = makeReport('enabled-filter-on');
    const disabledReport = makeReport('enabled-filter-off');
    const a = reportScheduleModel.upsert(enabledReport.id, {
      cron_expr: '0 1 * * *',
      enabled: true,
    });
    const b = reportScheduleModel.upsert(disabledReport.id, {
      cron_expr: '0 2 * * *',
      enabled: false,
    });
    const enabled = reportScheduleModel.getEnabled();
    const ids = enabled.map((s) => s.id);
    expect(ids).toContain(a.id);
    expect(ids).not.toContain(b.id);
  });

  it('does not return schedules attached to disabled reports', () => {
    const report = makeReport('disabled-report-filter');
    reportModel.update(report.id, { enabled: false });
    const schedule = reportScheduleModel.upsert(report.id, {
      cron_expr: '0 3 * * *',
      enabled: true,
    });

    const ids = reportScheduleModel.getEnabled().map((s) => s.id);
    expect(ids).not.toContain(schedule.id);
  });
});

describe('reportScheduleModel.updateLastRun / updateNextRun', () => {
  it('persists the integer fire-time on updateLastRun', () => {
    const report = makeReport('updateLastRun');
    const s = reportScheduleModel.upsert(report.id, {
      cron_expr: '0 7 * * *',
    });
    reportScheduleModel.updateLastRun(s.id, 1700000000);
    expect(reportScheduleModel.get(s.id)?.last_run_at).toBe(1700000000);
  });

  it('persists null on updateNextRun(null)', () => {
    const report = makeReport('updateNextRun');
    const s = reportScheduleModel.upsert(report.id, {
      cron_expr: '0 7 * * *',
      next_run_at: 1700000123,
    });
    expect(reportScheduleModel.get(s.id)?.next_run_at).toBe(1700000123);
    reportScheduleModel.updateNextRun(s.id, null);
    expect(reportScheduleModel.get(s.id)?.next_run_at).toBeNull();
  });
});

describe('reportScheduleModel.remove', () => {
  it('removes the schedule and returns true', () => {
    const report = makeReport('remove sched');
    const s = reportScheduleModel.upsert(report.id, {
      cron_expr: '0 7 * * *',
    });
    expect(reportScheduleModel.remove(s.id)).toBe(true);
    expect(reportScheduleModel.get(s.id)).toBeUndefined();
  });

  it('returns false for an unknown id', () => {
    expect(reportScheduleModel.remove(9_999_999)).toBe(false);
  });
});
