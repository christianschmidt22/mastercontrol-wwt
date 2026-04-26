CREATE TABLE reports (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  prompt_template TEXT    NOT NULL,
  -- target: JSON array of org ids, or ["all"] for every org.
  -- e.g. [1, 3, 7] or ["all"]
  target          TEXT    NOT NULL DEFAULT '["all"]',
  -- output_format: 'markdown' only for now
  output_format   TEXT    NOT NULL DEFAULT 'markdown'
                          CHECK(output_format IN ('markdown')),
  enabled         INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE report_schedules (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id   INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  cron_expr   TEXT    NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
  -- next_run_at and last_run_at are UNIX epoch seconds stored as INTEGER
  -- so they survive serialization through JSON without floating-point noise.
  next_run_at INTEGER,
  last_run_at INTEGER,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_schedules_report ON report_schedules(report_id);
CREATE INDEX idx_schedules_next   ON report_schedules(next_run_at)
  WHERE enabled = 1;

CREATE TABLE report_runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id  INTEGER NOT NULL REFERENCES report_schedules(id)
                 ON DELETE CASCADE,
  -- fire_time: the nominal cron fire-time (UNIX epoch seconds).
  -- UNIQUE with schedule_id prevents double-firing on catch-up.
  fire_time    INTEGER NOT NULL,
  started_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  finished_at  DATETIME,
  -- status: queued → running → done | failed
  status       TEXT NOT NULL DEFAULT 'queued'
               CHECK(status IN ('queued', 'running', 'done', 'failed')),
  output_path  TEXT,
  -- content_sha256 of the output file for change detection
  output_sha256 TEXT,
  summary      TEXT,
  error        TEXT,
  UNIQUE(schedule_id, fire_time)
);

CREATE INDEX idx_runs_schedule ON report_runs(schedule_id, fire_time DESC);
