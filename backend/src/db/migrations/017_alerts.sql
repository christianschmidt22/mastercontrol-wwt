-- 017_alerts: system alert log for background job failures and warnings.
--
-- severity: 'error' | 'warn' | 'info'
-- source:   short identifier for the job/subsystem that fired (e.g. 'calendarSync')
-- read_at:  NULL until the user dismisses the alert in the UI

CREATE TABLE IF NOT EXISTS system_alerts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  severity   TEXT NOT NULL DEFAULT 'error' CHECK(severity IN ('error', 'warn', 'info')),
  source     TEXT NOT NULL,
  message    TEXT NOT NULL,
  detail     TEXT,
  read_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_system_alerts_read ON system_alerts (read_at);
CREATE INDEX IF NOT EXISTS idx_system_alerts_created ON system_alerts (created_at DESC);
