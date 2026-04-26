/**
 * reportRun.model.test.ts — Phase 2 / Step 5a.
 *
 * Covers create (with INSERT OR IGNORE silent-no-op behaviour on
 * UNIQUE(schedule_id, fire_time)), updateStatus (extras + auto
 * finished_at), listBySchedule, getLastRun.
 */

// Bootstrap reports tables BEFORE the model imports its prepared statements.
import '../test/reportsSchema.js';

import { describe, it, expect } from 'vitest';
import { reportModel } from './report.model.js';
import { reportScheduleModel } from './reportSchedule.model.js';
import { reportRunModel } from './reportRun.model.js';

function makeSchedule(name = 'run test report'): {
  reportId: number;
  scheduleId: number;
} {
  const report = reportModel.create({
    name: `${name} ${Math.random()}`,
    prompt_template: 't',
  });
  const schedule = reportScheduleModel.upsert(report.id, {
    cron_expr: '0 7 * * *',
  });
  return { reportId: report.id, scheduleId: schedule.id };
}

describe('reportRunModel.create', () => {
  it('inserts a fresh run with status=queued and created=true', () => {
    const { scheduleId } = makeSchedule('create');
    const result = reportRunModel.create({
      schedule_id: scheduleId,
      fire_time: 1700000000,
    });
    expect(result.created).toBe(true);
    expect(result.run.status).toBe('queued');
    expect(result.run.schedule_id).toBe(scheduleId);
    expect(result.run.fire_time).toBe(1700000000);
    expect(result.run.output_path).toBeNull();
    expect(result.run.output_sha256).toBeNull();
  });

  it('respects an explicit status override', () => {
    const { scheduleId } = makeSchedule('create-status');
    const result = reportRunModel.create({
      schedule_id: scheduleId,
      fire_time: 1700000001,
      status: 'running',
    });
    expect(result.run.status).toBe('running');
  });

  it('silently no-ops on UNIQUE(schedule_id, fire_time) and returns the original row', () => {
    const { scheduleId } = makeSchedule('unique-collision');
    const fireTime = 1700001000;

    const first = reportRunModel.create({
      schedule_id: scheduleId,
      fire_time: fireTime,
    });
    expect(first.created).toBe(true);

    // Concurrent second call with same key — must NOT throw.
    const second = reportRunModel.create({
      schedule_id: scheduleId,
      fire_time: fireTime,
    });
    expect(second.created).toBe(false);
    expect(second.run.id).toBe(first.run.id);

    // Only one run row exists for this schedule.
    const runs = reportRunModel.listBySchedule(scheduleId);
    expect(runs.filter((r) => r.fire_time === fireTime)).toHaveLength(1);
  });

  it('different fire_times for the same schedule are accepted', () => {
    const { scheduleId } = makeSchedule('multi-fire');
    const a = reportRunModel.create({
      schedule_id: scheduleId,
      fire_time: 1700002000,
    });
    const b = reportRunModel.create({
      schedule_id: scheduleId,
      fire_time: 1700002001,
    });
    expect(a.created).toBe(true);
    expect(b.created).toBe(true);
    expect(a.run.id).not.toBe(b.run.id);
  });
});

describe('reportRunModel.updateStatus', () => {
  it('sets output_path / output_sha256 / summary on success', () => {
    const { scheduleId } = makeSchedule('updateStatus done');
    const { run } = reportRunModel.create({
      schedule_id: scheduleId,
      fire_time: 1700003000,
    });

    reportRunModel.updateStatus(run.id, 'done', {
      output_path: '/tmp/r/1.md',
      output_sha256: 'a'.repeat(64),
      summary: 'First 200 chars …',
    });

    const after = reportRunModel.get(run.id);
    expect(after?.status).toBe('done');
    expect(after?.output_path).toBe('/tmp/r/1.md');
    expect(after?.output_sha256).toBe('a'.repeat(64));
    expect(after?.summary).toBe('First 200 chars …');
    expect(after?.finished_at).not.toBeNull();
  });

  it('records error and finished_at on failure', () => {
    const { scheduleId } = makeSchedule('updateStatus failed');
    const { run } = reportRunModel.create({
      schedule_id: scheduleId,
      fire_time: 1700003001,
    });

    reportRunModel.updateStatus(run.id, 'failed', {
      error: 'boom',
    });

    const after = reportRunModel.get(run.id);
    expect(after?.status).toBe('failed');
    expect(after?.error).toBe('boom');
    expect(after?.finished_at).not.toBeNull();
  });

  it('leaves finished_at null when transitioning to running', () => {
    const { scheduleId } = makeSchedule('updateStatus running');
    const { run } = reportRunModel.create({
      schedule_id: scheduleId,
      fire_time: 1700003002,
    });

    reportRunModel.updateStatus(run.id, 'running');

    const after = reportRunModel.get(run.id);
    expect(after?.status).toBe('running');
    expect(after?.finished_at).toBeNull();
  });

  it('preserves existing fields when called with no extras (COALESCE behaviour)', () => {
    const { scheduleId } = makeSchedule('coalesce');
    const { run } = reportRunModel.create({
      schedule_id: scheduleId,
      fire_time: 1700003003,
    });

    reportRunModel.updateStatus(run.id, 'done', {
      output_path: '/tmp/r/x.md',
      summary: 'first',
    });

    // Subsequent transition WITHOUT output_path must preserve it.
    reportRunModel.updateStatus(run.id, 'failed', { error: 'late failure' });

    const after = reportRunModel.get(run.id);
    expect(after?.status).toBe('failed');
    expect(after?.output_path).toBe('/tmp/r/x.md');
    expect(after?.summary).toBe('first');
    expect(after?.error).toBe('late failure');
  });
});

describe('reportRunModel.listBySchedule / getLastRun', () => {
  it('listBySchedule returns runs newest-first, capped at the limit', () => {
    const { scheduleId } = makeSchedule('listBySchedule');
    for (let i = 0; i < 5; i++) {
      reportRunModel.create({
        schedule_id: scheduleId,
        fire_time: 1700004000 + i,
      });
    }
    const runs = reportRunModel.listBySchedule(scheduleId, 3);
    expect(runs).toHaveLength(3);
    // Ordered DESC by fire_time
    const fireTimes = runs.map((r) => r.fire_time);
    expect(fireTimes).toEqual([...fireTimes].sort((a, b) => b - a));
  });

  it('getLastRun returns the most recent fire_time', () => {
    const { scheduleId } = makeSchedule('getLastRun');
    reportRunModel.create({ schedule_id: scheduleId, fire_time: 1 });
    reportRunModel.create({ schedule_id: scheduleId, fire_time: 99 });
    reportRunModel.create({ schedule_id: scheduleId, fire_time: 50 });
    expect(reportRunModel.getLastRun(scheduleId)?.fire_time).toBe(99);
  });

  it('getLastRun returns undefined when no runs exist', () => {
    const { scheduleId } = makeSchedule('getLastRun empty');
    expect(reportRunModel.getLastRun(scheduleId)).toBeUndefined();
  });
});
