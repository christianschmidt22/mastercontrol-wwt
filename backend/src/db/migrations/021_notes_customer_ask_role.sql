-- 021_notes_customer_ask_role.sql
--
-- Add a `customer_ask` role to notes so approved customer_ask proposals can
-- be persisted as queryable internal records WITHOUT cluttering the Recent
-- Notes feed. The role is hidden from feed queries but still searchable by
-- the agent's search_notes tool, matching the user's "remember this for
-- later AI questions, but don't show on dashboards" intent.
--
-- SQLite can't drop a CHECK constraint in place, so we rebuild the table.

PRAGMA foreign_keys = OFF;

-- The notes_unified view references the notes table; dropping notes
-- invalidates it. We recreate the view at the bottom of this migration.
DROP VIEW IF EXISTS notes_unified;

CREATE TABLE notes_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  ai_response TEXT,
  source_path TEXT,
  file_mtime DATETIME,
  role TEXT NOT NULL DEFAULT 'user'
    CHECK(role IN ('user', 'assistant', 'agent_insight', 'imported', 'customer_ask')),
  thread_id INTEGER,
  provenance TEXT,
  confirmed INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  file_id TEXT,
  content_sha256 TEXT,
  last_seen_at DATETIME,
  deleted_at DATETIME,
  conflict_of_note_id INTEGER REFERENCES notes(id) ON DELETE SET NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  capture_source TEXT
);

INSERT INTO notes_new
  SELECT id, organization_id, content, ai_response, source_path, file_mtime,
         role, thread_id, provenance, confirmed, created_at, file_id,
         content_sha256, last_seen_at, deleted_at, conflict_of_note_id,
         project_id, capture_source
    FROM notes;

DROP TABLE notes;
ALTER TABLE notes_new RENAME TO notes;

-- Re-create indexes that lived on the old notes table.
CREATE INDEX IF NOT EXISTS idx_notes_created
  ON notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_org_created
  ON notes(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_project_created
  ON notes(project_id, created_at DESC) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notes_thread_created
  ON notes(thread_id, created_at) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notes_unconfirmed
  ON notes(organization_id, created_at DESC) WHERE confirmed = 0;
CREATE INDEX IF NOT EXISTS idx_notes_file_id
  ON notes(file_id) WHERE file_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notes_deleted
  ON notes(deleted_at) WHERE deleted_at IS NOT NULL;

-- Re-create the notes_unified view (matches schema.sql definition).
CREATE VIEW IF NOT EXISTS notes_unified AS
  SELECT
    id,
    organization_id,
    content,
    role,
    thread_id,
    confirmed,
    provenance,
    created_at,
    'note' AS source_table
  FROM notes
  UNION ALL
  SELECT
    (m.id + 1000000000) AS id,
    t.organization_id,
    m.content,
    'assistant' AS role,
    m.thread_id,
    1 AS confirmed,
    NULL AS provenance,
    m.created_at,
    'agent_message' AS source_table
  FROM agent_messages m
  JOIN agent_threads t ON t.id = m.thread_id
  WHERE m.role = 'assistant';

PRAGMA foreign_keys = ON;
