/**
 * Test-only schema bootstrap for the Phase 2 reports tables.
 *
 * The Phase 1 `schema.sql` (loaded by `setup.ts → initSchema()`) does not yet
 * include the reports tables — those land in migration `006_reports.sql`,
 * which Stream 1 is adding in parallel. Until that migration is wired into
 * the test bootstrap, every reports-module test that imports a model file
 * would crash at module load (`db.prepare(...)` against a missing table).
 *
 * This file provides those CREATE statements verbatim from the Phase 2 plan
 * § 006_reports.sql. It is imported as a side-effect by every reports-module
 * test file BEFORE the model imports — ESM evaluates imports in source
 * order, so the tables exist by the time the model files prepare their
 * statements.
 *
 * When migration 006 lands and is replayed by the test bootstrap, this file
 * becomes redundant (its DDL is idempotent — `IF NOT EXISTS`). It can be
 * deleted along with the side-effect imports in the test files.
 */

import { db } from '../db/database.js';

db.exec(`
CREATE TABLE IF NOT EXISTS reports (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  prompt_template TEXT    NOT NULL,
  target          TEXT    NOT NULL DEFAULT '["all"]',
  output_format   TEXT    NOT NULL DEFAULT 'markdown'
                          CHECK(output_format IN ('markdown')),
  enabled         INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS report_schedules (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id   INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  cron_expr   TEXT    NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
  next_run_at INTEGER,
  last_run_at INTEGER,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_schedules_report ON report_schedules(report_id);
CREATE INDEX IF NOT EXISTS idx_schedules_next   ON report_schedules(next_run_at)
  WHERE enabled = 1;

CREATE TABLE IF NOT EXISTS report_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id   INTEGER NOT NULL REFERENCES report_schedules(id) ON DELETE CASCADE,
  fire_time     INTEGER NOT NULL,
  started_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  finished_at   DATETIME,
  status        TEXT NOT NULL DEFAULT 'queued'
                CHECK(status IN ('queued', 'running', 'done', 'failed')),
  output_path   TEXT,
  output_sha256 TEXT,
  summary       TEXT,
  error         TEXT,
  UNIQUE(schedule_id, fire_time)
);

CREATE INDEX IF NOT EXISTS idx_runs_schedule ON report_runs(schedule_id, fire_time DESC);
`);
