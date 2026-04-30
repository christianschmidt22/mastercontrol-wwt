-- 030_calendar_event_hides
--
-- Per-day "hide for today" dismissals on calendar events. Hides are
-- date-scoped so they automatically expire as the day rolls over.

CREATE TABLE IF NOT EXISTS calendar_event_hides (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  uid       TEXT NOT NULL,
  hide_date TEXT NOT NULL,  -- YYYY-MM-DD local date
  hidden_at TEXT DEFAULT (datetime('now')),
  UNIQUE(uid, hide_date)
);

CREATE INDEX IF NOT EXISTS idx_event_hides_date
  ON calendar_event_hides(hide_date);
