-- 026_outlook_messages
--
-- Stores synced Outlook messages and their org associations.
--
-- outlook_messages: one row per unique email (keyed on internet_message_id).
--   Inbox + sent items are both stored. Body is not fetched eagerly — only
--   bodyPreview (up to ~255 chars from Graph) is stored in body_preview.
--   Full body can be fetched on demand via Graph in a future phase.
--
-- outlook_message_orgs: many-to-many link between messages and orgs.
--   Source is 'mention_extraction' for the simple name-matching heuristic
--   used in Phase 3. Confidence is 0.0–1.0.

CREATE TABLE IF NOT EXISTS outlook_messages (
  id                  INTEGER PRIMARY KEY,
  internet_message_id TEXT    UNIQUE NOT NULL,
  thread_id           TEXT,
  subject             TEXT,
  from_email          TEXT,
  from_name           TEXT,
  to_emails           TEXT,             -- JSON array of email strings
  cc_emails           TEXT,             -- JSON array of email strings
  sent_at             TEXT,
  has_attachments     INTEGER DEFAULT 0,
  body_preview        TEXT,
  body_cached         TEXT,
  synced_at           TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_outlook_messages_sent_at
  ON outlook_messages(sent_at DESC);

CREATE TABLE IF NOT EXISTS outlook_message_orgs (
  id         INTEGER PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES outlook_messages(id) ON DELETE CASCADE,
  org_id     INTEGER NOT NULL REFERENCES organizations(id)    ON DELETE CASCADE,
  source     TEXT    DEFAULT 'mention_extraction',
  confidence REAL,
  UNIQUE(message_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_outlook_message_orgs_org
  ON outlook_message_orgs(org_id, message_id);
