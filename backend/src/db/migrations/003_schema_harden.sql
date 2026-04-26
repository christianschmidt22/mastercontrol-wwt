-- note_mentions: source provenance + AI confidence
ALTER TABLE note_mentions ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE note_mentions ADD COLUMN confidence REAL;
-- SQLite can't add a CHECK constraint to an existing column via ALTER TABLE.
-- Enforce the constraint in the model layer (zod + explicit check on insert).
-- Future: once the migration baseline is rebuilt, the column can be
-- defined with CHECK inline.

-- notes.role: extend accepted values (system, summary for Phase 2 use)
-- SQLite can't alter CHECK constraints. Drop + recreate is the standard
-- path; we instead enforce the extended set in the model layer and accept
-- that old DB rows with 'user'/'assistant'/'agent_insight'/'imported' are
-- already valid. New roles are only ever written by Phase 2 code paths.

-- contacts: add updated_at
ALTER TABLE contacts ADD COLUMN updated_at DATETIME;

-- documents: add updated_at
ALTER TABLE documents ADD COLUMN updated_at DATETIME;

-- tasks: BEFORE INSERT/UPDATE trigger for cross-org consistency
-- Rejects a task that links a contact from a different org.
CREATE TRIGGER IF NOT EXISTS trg_tasks_contact_org_insert
  BEFORE INSERT ON tasks
  WHEN NEW.contact_id IS NOT NULL AND NEW.organization_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'contact org mismatch')
  WHERE (SELECT organization_id FROM contacts WHERE id = NEW.contact_id)
        != NEW.organization_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_tasks_contact_org_update
  BEFORE UPDATE ON tasks
  WHEN NEW.contact_id IS NOT NULL AND NEW.organization_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'contact org mismatch')
  WHERE (SELECT organization_id FROM contacts WHERE id = NEW.contact_id)
        != NEW.organization_id;
END;
