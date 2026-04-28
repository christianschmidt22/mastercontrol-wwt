-- This file is a documentation snapshot only. The authoritative schema is
-- assembled by running the numbered migrations in backend/src/db/migrations/.
--
-- MasterControl schema (source of truth) — Phase 1, v0.4
-- Single `organizations` table with type discriminator + JSON metadata.
-- Run on startup; CREATE IF NOT EXISTS so repeated boots are safe.
--
-- This file ships P0 corrections from docs/REVIEW.md:
--   R-002: notes.provenance (JSON) + notes.confirmed columns; agent_insight
--          rows insert with confirmed=0 awaiting user accept/reject.
--   R-004: agent_configs UNIQUE(section, organization_id) replaced with two
--          partial unique indexes — SQLite treats NULLs as distinct in unique
--          constraints, which would otherwise allow duplicate archetype rows.
--   R-005: notes_unified VIEW exposes assistant turns from agent_messages
--          to the notes feed without duplicating storage.

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('customer', 'oem')),
  name TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_orgs_type ON organizations(type);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT,
  email TEXT,
  phone TEXT,
  role TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_contacts_org ON contacts(organization_id);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  description TEXT,
  doc_url TEXT,
  notes_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(organization_id);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('link', 'file')),
  label TEXT NOT NULL,
  url_or_path TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual', 'onedrive_scan')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_documents_org ON documents(organization_id);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  ai_response TEXT,
  source_path TEXT,
  file_mtime DATETIME,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  capture_source TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'assistant', 'agent_insight', 'imported')),
  thread_id INTEGER,
  -- R-002: provenance + confirmation gate for agent-authored content.
  -- provenance is JSON like {"tool":"record_insight","source_thread_id":7,
  -- "source_org_id":3,"web_citations":[...]}; populated only for role='agent_insight'.
  -- confirmed=0 means the user has not yet accepted the insight; an org's
  -- buildSystemPrompt only includes others' unconfirmed insights when the
  -- target org matches (i.e. own-org review surface).
  provenance TEXT,
  confirmed INTEGER NOT NULL DEFAULT 1 CHECK(confirmed IN (0, 1)),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notes_org_created ON notes(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_unconfirmed ON notes(organization_id, created_at DESC)
  WHERE confirmed = 0;
CREATE INDEX IF NOT EXISTS idx_notes_project_created ON notes(project_id, created_at DESC)
  WHERE project_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS note_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK(type IN (
    'customer_ask',
    'task_follow_up',
    'project_update',
    'risk_blocker',
    'oem_mention',
    'customer_insight'
  )),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  evidence_quote TEXT NOT NULL,
  proposed_payload TEXT NOT NULL DEFAULT '{}',
  confidence REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'approved', 'denied', 'discussing')),
  discussion TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_note_proposals_status_created
  ON note_proposals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_note_proposals_org_status
  ON note_proposals(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_note_proposals_note
  ON note_proposals(source_note_id);

CREATE TABLE IF NOT EXISTS note_mentions (
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  mentioned_org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, mentioned_org_id)
);
CREATE INDEX IF NOT EXISTS idx_mentions_org ON note_mentions(mentioned_org_id);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_date DATETIME,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'done', 'snoozed')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON tasks(status, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_org ON tasks(organization_id);

CREATE TABLE IF NOT EXISTS agent_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section TEXT NOT NULL CHECK(section IN ('customer', 'oem')),
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  system_prompt_template TEXT NOT NULL,
  tools_enabled TEXT NOT NULL DEFAULT '[]',
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  -- R-004: NO table-level UNIQUE(section, organization_id) — SQLite treats
  -- NULLs as distinct, so two `(section='customer', org_id=NULL)` archetype
  -- rows would both succeed. Uniqueness is enforced via partial indexes below.
);
-- R-004: exactly one archetype per section (org_id IS NULL).
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_configs_archetype
  ON agent_configs(section) WHERE organization_id IS NULL;
-- R-004: exactly one override per (section, org).
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_configs_override
  ON agent_configs(section, organization_id) WHERE organization_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS agent_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_threads_org ON agent_threads(organization_id);

CREATE TABLE IF NOT EXISTS agent_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL REFERENCES agent_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  tool_calls TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON agent_messages(thread_id, created_at);

-- R-022: agent_tool_audit — every tool call (web_search, record_insight, and
-- future Phase 2 tools) writes a row here so the user can review what the
-- agent did. `input_json` is the tool input object; `output_json` is either
-- the tool result or the rejection reason. `status` is one of:
--   'ok'       — tool executed successfully
--   'rejected' — server-side allowlist or safety check blocked the call
--   'error'    — tool execution threw / returned an error
-- Rows cascade-delete when their thread is deleted.
CREATE TABLE IF NOT EXISTS agent_tool_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL REFERENCES agent_threads(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  input_json TEXT,
  output_json TEXT,
  status TEXT NOT NULL CHECK(status IN ('ok','rejected','error')),
  occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_thread ON agent_tool_audit(thread_id, occurred_at);

-- R-005: notes_unified VIEW. The org's notes feed reads from this view so that
-- assistant chat messages appear in the timeline without being duplicated as
-- rows in `notes`. `agent_messages` is the canonical store for assistant
-- turns; `notes` rows are written only by user input, agent_insight tool
-- calls, and Phase 2 imports. Deleting an agent_thread CASCADEs to
-- agent_messages, which removes the assistant rows from this view.
--
-- The id-offset (+1_000_000_000) namespaces synthetic ids so the frontend can
-- treat the view as a flat list without colliding with real notes ids when
-- showing detail/edit affordances. Real notes get their own id; assistant-
-- mirrored rows get an id well above any expected SQLite autoincrement.
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
