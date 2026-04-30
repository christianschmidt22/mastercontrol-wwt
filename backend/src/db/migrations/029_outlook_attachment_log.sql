-- 029_outlook_attachment_log
--
-- Extends the Outlook schema for the attachment save pipeline:
--   1. Add `sender` column to outlook_messages (consolidated from/to field
--      used by the updated sync service; existing from_email/from_name kept).
--   2. Add `attachments_meta` JSON column to outlook_messages so attachment
--      metadata (name, size, content_type) survives between syncs.
--   3. Extend documents.source CHECK to accept 'outlook_attachment'.
--   4. Create outlook_attachment_log for idempotent save tracking.

-- ---------------------------------------------------------------------------
-- 1. Add new columns to outlook_messages
-- ---------------------------------------------------------------------------
ALTER TABLE outlook_messages ADD COLUMN sender TEXT;
ALTER TABLE outlook_messages ADD COLUMN attachments_meta TEXT NOT NULL DEFAULT '[]';

-- ---------------------------------------------------------------------------
-- 2. Extend documents.source to accept 'outlook_attachment'
--
-- SQLite does not support ALTER TABLE … MODIFY COLUMN so we use the
-- rename → recreate → copy → drop pattern.
-- ---------------------------------------------------------------------------

ALTER TABLE documents RENAME TO documents_old;

CREATE TABLE documents (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind            TEXT    NOT NULL CHECK(kind IN ('link', 'file')),
  label           TEXT    NOT NULL,
  url_or_path     TEXT    NOT NULL,
  source          TEXT    NOT NULL DEFAULT 'manual'
                    CHECK(source IN ('manual', 'onedrive_scan', 'outlook_attachment')),
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_documents_org ON documents(organization_id);

INSERT INTO documents (id, organization_id, kind, label, url_or_path, source, created_at)
  SELECT id, organization_id, kind, label, url_or_path, source, created_at
  FROM documents_old;

DROP TABLE documents_old;

-- ---------------------------------------------------------------------------
-- 3. Attachment log — idempotency guard
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS outlook_attachment_log (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  internet_message_id TEXT    NOT NULL,
  attachment_name     TEXT    NOT NULL,
  vault_path          TEXT    NOT NULL,
  document_id         INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  saved_at            TEXT    DEFAULT (datetime('now')),
  UNIQUE(internet_message_id, attachment_name)
);

CREATE INDEX IF NOT EXISTS idx_att_log_message
  ON outlook_attachment_log(internet_message_id);
