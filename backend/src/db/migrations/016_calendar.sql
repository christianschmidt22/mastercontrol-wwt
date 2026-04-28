-- 016_calendar: local cache of M365 calendar events synced from ICS subscription.
--
-- uid is the VEVENT UID from the ICS feed. Recurring event instances use a
-- composite key: "<base_uid>:<ISO_date>" so each occurrence is a distinct row.
-- is_all_day: 1 when DTSTART is a DATE (no time component) per RFC 5545.

CREATE TABLE IF NOT EXISTS calendar_events (
  uid             TEXT    PRIMARY KEY,
  title           TEXT    NOT NULL DEFAULT '',
  start_at        TEXT    NOT NULL,
  end_at          TEXT    NOT NULL,
  location        TEXT,
  organizer       TEXT,
  attendee_count  INTEGER NOT NULL DEFAULT 0,
  is_all_day      INTEGER NOT NULL DEFAULT 0,
  synced_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_start ON calendar_events (start_at);

-- Persist sync bookmarks in the existing settings table.
INSERT OR IGNORE INTO settings (key, value) VALUES ('calendar_last_sync', '');
