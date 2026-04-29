-- 022_master_notes.sql
--
-- Master notes: a single free-form, autosaved markdown blob per
-- (organization, optional project). The UI binds a textarea to this row
-- and PUTs on every debounced edit. The backend mirrors the content to a
-- master-notes.md file under the vault so an external editor (VS Code,
-- OneDrive sync) can read or edit it; the periodic ingest job reads
-- file_mtime and re-extracts when an external edit is detected.

CREATE TABLE IF NOT EXISTS master_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  content_sha256 TEXT NOT NULL DEFAULT '',
  file_path TEXT,
  file_mtime DATETIME,
  -- last_ingested_sha256 is what the LLM-extraction job last saw. When the
  -- live content_sha256 differs, the next "process" tick has work to do.
  last_ingested_sha256 TEXT,
  last_ingested_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Exactly one row per org-level master note (project_id IS NULL).
-- Partial unique index because SQLite treats NULL as distinct.
CREATE UNIQUE INDEX IF NOT EXISTS uq_master_notes_org
  ON master_notes(organization_id)
  WHERE project_id IS NULL;

-- Exactly one row per (org, project) pair.
CREATE UNIQUE INDEX IF NOT EXISTS uq_master_notes_org_project
  ON master_notes(organization_id, project_id)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_master_notes_project
  ON master_notes(project_id) WHERE project_id IS NOT NULL;
