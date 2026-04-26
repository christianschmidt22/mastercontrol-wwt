-- Dual source-of-truth columns on notes (R-023)
ALTER TABLE notes ADD COLUMN file_id TEXT;
ALTER TABLE notes ADD COLUMN content_sha256 TEXT;
ALTER TABLE notes ADD COLUMN last_seen_at DATETIME;
ALTER TABLE notes ADD COLUMN deleted_at DATETIME;
ALTER TABLE notes ADD COLUMN conflict_of_note_id INTEGER
  REFERENCES notes(id);

CREATE INDEX idx_notes_file_id ON notes(file_id)
  WHERE file_id IS NOT NULL;

CREATE INDEX idx_notes_deleted ON notes(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- Ingest source registry
CREATE TABLE ingest_sources (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  root_path TEXT    NOT NULL,
  kind      TEXT    NOT NULL CHECK(kind IN ('workvault', 'onedrive', 'oem_docs')),
  last_scan_at DATETIME,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Per-file ingest errors
CREATE TABLE ingest_errors (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id  INTEGER NOT NULL REFERENCES ingest_sources(id) ON DELETE CASCADE,
  path       TEXT    NOT NULL,
  error      TEXT    NOT NULL,
  occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ingest_errors_source ON ingest_errors(source_id, occurred_at DESC);
