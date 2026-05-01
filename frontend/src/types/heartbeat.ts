export interface HeartbeatWindow {
  id: string;
  label: string;
  not_before: string;
  last_run_date?: string | null;
  last_run_at?: string | null;
  last_started_at?: string | null;
  last_error?: string | null;
}

export interface HeartbeatJob {
  id: 'outlook-com-sync';
  label: string;
  enabled: boolean;
  deleted: boolean;
  windows: HeartbeatWindow[];
}

export interface HeartbeatConfig {
  check_interval_minutes: 5 | 10 | 15 | 20 | 30 | 60;
  timezone: 'America/Chicago';
  jobs: HeartbeatJob[];
}
