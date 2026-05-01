import { describe, it, expect, beforeEach, vi } from 'vitest';
import { settingsModel } from '../models/settings.model.js';

const syncOutlookMock = vi.fn();

vi.mock('./outlookSync.service.js', () => ({
  syncOutlook: () => syncOutlookMock(),
}));

const {
  getHeartbeatConfig,
  runHeartbeatOnce,
  saveHeartbeatConfig,
} = await import('./heartbeat.service.js');

beforeEach(() => {
  settingsModel.remove('heartbeat_config');
  syncOutlookMock.mockReset();
  syncOutlookMock.mockResolvedValue({
    messages_upserted: 0,
    org_links: 0,
    attachment_jobs: 0,
  });
});

describe('heartbeat.service', () => {
  it('defaults Outlook COM sync to 15-minute checks and morning/afternoon Central windows', () => {
    const config = getHeartbeatConfig();
    expect(config.check_interval_minutes).toBe(15);
    expect(config.timezone).toBe('America/Chicago');
    expect(config.jobs[0]).toMatchObject({
      id: 'outlook-com-sync',
      enabled: true,
      deleted: false,
    });
    expect(config.jobs[0].windows.map((window) => window.not_before)).toEqual([
      '05:00',
      '12:00',
    ]);
  });

  it('does not run before the first configured window', async () => {
    const result = await runHeartbeatOnce(new Date('2026-05-01T09:59:00Z'));

    expect(syncOutlookMock).not.toHaveBeenCalled();
    expect(result[0]).toMatchObject({ ran: false });
  });

  it('runs once after the morning window and records the day', async () => {
    const result = await runHeartbeatOnce(new Date('2026-05-01T10:01:00Z'));

    expect(syncOutlookMock).toHaveBeenCalledTimes(1);
    expect(result[0]).toMatchObject({
      ran: true,
      window_ids: ['morning'],
    });
    expect(getHeartbeatConfig().jobs[0].windows[0].last_run_date).toBe('2026-05-01');
  });

  it('coalesces missed morning and afternoon windows into one sync', async () => {
    const result = await runHeartbeatOnce(new Date('2026-05-01T17:05:00Z'));

    expect(syncOutlookMock).toHaveBeenCalledTimes(1);
    expect(result[0].window_ids).toEqual(['morning', 'afternoon']);
    const windows = getHeartbeatConfig().jobs[0].windows;
    expect(windows.map((window) => window.last_run_date)).toEqual([
      '2026-05-01',
      '2026-05-01',
    ]);

    await runHeartbeatOnce(new Date('2026-05-01T17:20:00Z'));
    expect(syncOutlookMock).toHaveBeenCalledTimes(1);
  });

  it('does not run suspended or deleted jobs', async () => {
    const config = getHeartbeatConfig();
    saveHeartbeatConfig({
      ...config,
      jobs: config.jobs.map((job) => ({ ...job, enabled: false })),
    });

    await runHeartbeatOnce(new Date('2026-05-01T17:05:00Z'));
    expect(syncOutlookMock).not.toHaveBeenCalled();
  });
});
