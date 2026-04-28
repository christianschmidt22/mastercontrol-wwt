-- Notes manager foundation: project context + approval proposal queue.

ALTER TABLE notes ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE notes ADD COLUMN capture_source TEXT;

CREATE INDEX idx_notes_project_created ON notes(project_id, created_at DESC)
  WHERE project_id IS NOT NULL;

CREATE TABLE note_proposals (
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
                    'customer_insight'
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

CREATE INDEX idx_note_proposals_status_created ON note_proposals(status, created_at DESC);
CREATE INDEX idx_note_proposals_org_status ON note_proposals(organization_id, status);
CREATE INDEX idx_note_proposals_note ON note_proposals(source_note_id);
