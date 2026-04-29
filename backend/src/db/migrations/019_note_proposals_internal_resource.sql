-- 019_note_proposals_internal_resource
--
-- SQLite cannot alter a CHECK constraint in place. Rebuild note_proposals so
-- the live approval queue accepts internal_resource proposals extracted from
-- notes.

CREATE TABLE note_proposals_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  source_note_id  INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  type            TEXT NOT NULL CHECK(type IN (
                    'customer_ask',
                    'task_follow_up',
                    'project_update',
                    'risk_blocker',
                    'oem_mention',
                    'customer_insight',
                    'internal_resource'
                  )),
  title           TEXT NOT NULL,
  summary         TEXT NOT NULL,
  evidence_quote  TEXT NOT NULL,
  proposed_payload TEXT NOT NULL DEFAULT '{}',
  confidence      REAL NOT NULL DEFAULT 0.5,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK(status IN ('pending', 'approved', 'denied', 'discussing')),
  discussion      TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO note_proposals_new (
  id,
  source_note_id,
  organization_id,
  project_id,
  type,
  title,
  summary,
  evidence_quote,
  proposed_payload,
  confidence,
  status,
  discussion,
  created_at,
  updated_at
)
SELECT
  id,
  source_note_id,
  organization_id,
  project_id,
  type,
  title,
  summary,
  evidence_quote,
  proposed_payload,
  confidence,
  status,
  discussion,
  created_at,
  updated_at
FROM note_proposals;

DROP TABLE note_proposals;
ALTER TABLE note_proposals_new RENAME TO note_proposals;

CREATE INDEX IF NOT EXISTS idx_note_proposals_status_created
  ON note_proposals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_note_proposals_org_status
  ON note_proposals(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_note_proposals_note
  ON note_proposals(source_note_id);
