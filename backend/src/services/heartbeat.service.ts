import { db } from '../db/database.js';
import { settingsModel } from '../models/settings.model.js';
import { logAlert } from '../models/systemAlert.model.js';
import { syncOutlook } from './outlookSync.service.js';
import { HeartbeatConfigSchema, type HeartbeatConfigInput } from '../schemas/heartbeat.schema.js';

const HEARTBEAT_CONFIG_KEY = 'heartbeat_config';
const STALE_START_MS = 45 * 60 * 1000;

export type HeartbeatWindow = HeartbeatConfigInput['jobs'][number]['windows'][number];
export type HeartbeatJob = HeartbeatConfigInput['jobs'][number];
export type HeartbeatConfig = HeartbeatConfigInput;

export interface HeartbeatRunResult {
  ran: boolean;
  job_id: string;
  window_ids: string[];
  message: string;
}

export const DEFAULT_HEARTBEAT_CONFIG: HeartbeatConfig = {
  check_interval_minutes: 15,
  timezone: 'America/Chicago',
  jobs: [
    {
      id: 'outlook-com-sync',
      label: 'Outlook COM sync',
      enabled: true,
      deleted: false,
      windows: [
        {
          id: 'morning',
          label: 'Morning',
          not_before: '05:00',
          last_run_date: null,
          last_run_at: null,
          last_started_at: null,
          last_error: null,
        },
        {
          id: 'afternoon',
          label: 'Afternoon',
          not_before: '12:00',
          last_run_date: null,
          last_run_at: null,
          last_started_at: null,
          last_error: null,
        },
      ],
    },
  ],
};

function cloneDefaultConfig(): HeartbeatConfig {
  return JSON.parse(JSON.stringify(DEFAULT_HEARTBEAT_CONFIG)) as HeartbeatConfig;
}

function mergeWithDefaults(input: HeartbeatConfig): HeartbeatConfig {
  const defaults = cloneDefaultConfig();
  const jobs = defaults.jobs.map((defaultJob) => {
    const incomingJob = input.jobs.find((job) => job.id === defaultJob.id);
    if (!incomingJob) return defaultJob;
    return {
      ...defaultJob,
      ...incomingJob,
      windows: defaultJob.windows.map((defaultWindow) => {
        const incomingWindow = incomingJob.windows.find((window) => window.id === defaultWindow.id);
        return incomingWindow ? { ...defaultWindow, ...incomingWindow } : defaultWindow;
      }),
    };
  });
  return {
    ...defaults,
    ...input,
    jobs,
    timezone: 'America/Chicago',
  };
}

export function getHeartbeatConfig(): HeartbeatConfig {
  const raw = settingsModel.get(HEARTBEAT_CONFIG_KEY);
  if (!raw) return cloneDefaultConfig();
  try {
    const parsed = HeartbeatConfigSchema.parse(JSON.parse(raw));
    return mergeWithDefaults(parsed);
  } catch {
    return cloneDefaultConfig();
  }
}

export function saveHeartbeatConfig(input: HeartbeatConfigInput): HeartbeatConfig {
  const parsed = HeartbeatConfigSchema.parse(input);
  const merged = mergeWithDefaults(parsed);
  settingsModel.set(HEARTBEAT_CONFIG_KEY, JSON.stringify(merged));
  return merged;
}

function chicagoClock(now: Date): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    minutes: Number(value('hour')) * 60 + Number(value('minute')),
  };
}

function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

function isStartStale(window: HeartbeatWindow, now: Date): boolean {
  if (!window.last_started_at) return true;
  const started = new Date(window.last_started_at).getTime();
  if (Number.isNaN(started)) return true;
  return now.getTime() - started > STALE_START_MS;
}

function dueWindowIds(job: HeartbeatJob, now: Date): string[] {
  if (!job.enabled || job.deleted) return [];
  const clock = chicagoClock(now);
  return job.windows
    .filter((window) => clock.minutes >= timeToMinutes(window.not_before))
    .filter((window) => window.last_run_date !== clock.date)
    .filter((window) => isStartStale(window, now))
    .map((window) => window.id);
}

function mutateJobWindows(
  config: HeartbeatConfig,
  jobId: HeartbeatJob['id'],
  windowIds: string[],
  patch: Partial<HeartbeatWindow>,
): HeartbeatConfig {
  return {
    ...config,
    jobs: config.jobs.map((job) => {
      if (job.id !== jobId) return job;
      return {
        ...job,
        windows: job.windows.map((window) =>
          windowIds.includes(window.id) ? { ...window, ...patch } : window,
        ),
      };
    }),
  };
}

function claimDueWindows(jobId: HeartbeatJob['id'], now: Date): string[] {
  const claim = db.transaction(() => {
    const config = getHeartbeatConfig();
    const job = config.jobs.find((candidate) => candidate.id === jobId);
    if (!job) return [] as string[];
    const dueIds = dueWindowIds(job, now);
    if (dueIds.length === 0) return dueIds;
    const next = mutateJobWindows(config, jobId, dueIds, {
      last_started_at: now.toISOString(),
      last_error: null,
    });
    settingsModel.set(HEARTBEAT_CONFIG_KEY, JSON.stringify(next));
    return dueIds;
  });
  return claim();
}

function finishWindows(
  jobId: HeartbeatJob['id'],
  windowIds: string[],
  now: Date,
  error: string | null,
): void {
  const clock = chicagoClock(now);
  const config = getHeartbeatConfig();
  const patch: Partial<HeartbeatWindow> = {
    last_started_at: null,
    last_error: error,
  };
  if (!error) {
    patch.last_run_date = clock.date;
    patch.last_run_at = now.toISOString();
  }
  const next = mutateJobWindows(config, jobId, windowIds, patch);
  settingsModel.set(HEARTBEAT_CONFIG_KEY, JSON.stringify(next));
}

export async function runHeartbeatOnce(now = new Date()): Promise<HeartbeatRunResult[]> {
  const windowIds = claimDueWindows('outlook-com-sync', now);
  if (windowIds.length === 0) {
    return [{
      ran: false,
      job_id: 'outlook-com-sync',
      window_ids: [],
      message: 'No due heartbeat windows.',
    }];
  }

  try {
    await syncOutlook();
    finishWindows('outlook-com-sync', windowIds, now, null);
    return [{
      ran: true,
      job_id: 'outlook-com-sync',
      window_ids: windowIds,
      message: 'Outlook COM sync completed.',
    }];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    finishWindows('outlook-com-sync', windowIds, now, message);
    logAlert('warn', 'heartbeat', `Heartbeat Outlook COM sync failed: ${message}`);
    return [{
      ran: false,
      job_id: 'outlook-com-sync',
      window_ids: windowIds,
      message,
    }];
  }
}
