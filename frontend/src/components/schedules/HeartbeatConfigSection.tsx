import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import {
  useHeartbeatConfig,
  useUpdateHeartbeatConfig,
} from '../../api/useHeartbeat';
import type { HeartbeatConfig, HeartbeatJob } from '../../types';

const HEARTBEAT_INTERVAL_OPTIONS: HeartbeatConfig['check_interval_minutes'][] = [
  5,
  10,
  15,
  20,
  30,
  60,
];

function statusLabel(job: HeartbeatJob): string {
  if (job.deleted) return 'Deleted';
  return job.enabled ? 'Active' : 'Suspended';
}

function cloneConfig(config: HeartbeatConfig): HeartbeatConfig {
  return JSON.parse(JSON.stringify(config)) as HeartbeatConfig;
}

function formatLastRun(value?: string | null): string {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function HeartbeatConfigSection() {
  const configQuery = useHeartbeatConfig();
  const updateConfig = useUpdateHeartbeatConfig();
  const [draft, setDraft] = useState<HeartbeatConfig | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (configQuery.data) setDraft(cloneConfig(configQuery.data));
  }, [configQuery.data]);

  const jobs = draft?.jobs ?? [];
  const hasChanges = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(configQuery.data ?? null),
    [draft, configQuery.data],
  );

  function patchJob(id: HeartbeatJob['id'], patch: Partial<HeartbeatJob>) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        jobs: current.jobs.map((job) =>
          job.id === id ? { ...job, ...patch } : job,
        ),
      };
    });
  }

  function patchWindow(jobId: HeartbeatJob['id'], windowId: string, time: string) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        jobs: current.jobs.map((job) => {
          if (job.id !== jobId) return job;
          return {
            ...job,
            windows: job.windows.map((window) =>
              window.id === windowId ? { ...window, not_before: time } : window,
            ),
          };
        }),
      };
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    updateConfig.mutate(draft, {
      onSuccess: () => setMessage('Heartbeat configuration saved.'),
      onError: (err) => setMessage(err.message),
    });
  }

  return (
    <section
      aria-labelledby="heartbeat-config-title"
      style={{
        maxWidth: '70ch',
        border: '1px solid var(--rule)',
        borderRadius: 8,
        background: 'var(--surface)',
        padding: 16,
        marginBottom: 16,
      }}
    >
      <form onSubmit={submit}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h2
              id="heartbeat-config-title"
              style={{
                fontFamily: 'var(--display)',
                fontSize: 22,
                fontWeight: 500,
                margin: 0,
                color: 'var(--ink-1)',
              }}
            >
              Heartbeat
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>
              Operational jobs checked in Central time.
            </p>
          </div>
          {configQuery.isLoading && <Loader2 size={16} aria-label="Loading heartbeat" />}
        </div>

        {draft && (
          <>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 14,
                fontSize: 13,
                color: 'var(--ink-2)',
              }}
            >
              Check every
              <select
                value={draft.check_interval_minutes}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    check_interval_minutes: Number(
                      event.target.value,
                    ) as HeartbeatConfig['check_interval_minutes'],
                  })
                }
                style={{
                  width: 86,
                  border: '1px solid var(--rule)',
                  borderRadius: 4,
                  padding: '5px 7px',
                  background: 'var(--bg)',
                  color: 'var(--ink-1)',
                }}
              >
                {HEARTBEAT_INTERVAL_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes}
                  </option>
                ))}
              </select>
              minutes
            </label>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 14 }}>
              <thead>
                <tr style={{ color: 'var(--ink-3)', fontSize: 11, textTransform: 'uppercase' }}>
                  <th style={{ textAlign: 'left', padding: '7px 0' }}>Job</th>
                  <th style={{ textAlign: 'left', padding: '7px 0' }}>Windows</th>
                  <th style={{ textAlign: 'left', padding: '7px 0' }}>Last run</th>
                  <th style={{ textAlign: 'right', padding: '7px 0' }}>Controls</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} style={{ borderTop: '1px solid var(--rule)' }}>
                    <td style={{ padding: '10px 10px 10px 0', fontSize: 13 }}>
                      <div style={{ color: 'var(--ink-1)', fontWeight: 600 }}>{job.label}</div>
                      <div style={{ color: 'var(--ink-3)', fontSize: 12 }}>{statusLabel(job)}</div>
                    </td>
                    <td style={{ padding: '10px 10px 10px 0' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {job.windows.map((window) => (
                          <label key={window.id} style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                            {window.label}{' '}
                            <input
                              type="time"
                              value={window.not_before}
                              disabled={job.deleted}
                              onChange={(event) => patchWindow(job.id, window.id, event.target.value)}
                              style={{
                                border: '1px solid var(--rule)',
                                borderRadius: 4,
                                padding: '4px 6px',
                                background: 'var(--bg)',
                                color: 'var(--ink-1)',
                              }}
                            />
                          </label>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '10px 10px 10px 0', fontSize: 12, color: 'var(--ink-2)' }}>
                      {job.windows.map((window) => (
                        <div key={window.id}>{window.label}: {formatLastRun(window.last_run_at)}</div>
                      ))}
                    </td>
                    <td style={{ padding: '10px 0', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button type="button" onClick={() => patchJob(job.id, { enabled: !job.enabled, deleted: false })}>
                        {job.enabled && !job.deleted ? 'Suspend' : 'Resume'}
                      </button>{' '}
                      <button type="button" onClick={() => patchJob(job.id, { deleted: !job.deleted, enabled: job.deleted })}>
                        {job.deleted ? 'Restore' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
          <span role={message ? 'status' : undefined} style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            {message}
          </span>
          <button type="submit" disabled={!draft || !hasChanges || updateConfig.isPending}>
            {updateConfig.isPending ? 'Saving...' : 'Save heartbeat'}
          </button>
        </div>
      </form>
    </section>
  );
}
