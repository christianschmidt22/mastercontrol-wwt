-- 020_note_proposals_contact.sql
--
-- Add `contact_id` to note_proposals so the extraction pipeline can record
-- which person a proposal is tied to (when extraction can resolve a name to
-- a known contact). Nullable: many proposals are about a project or org
-- without naming a specific person.

ALTER TABLE note_proposals
  ADD COLUMN contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_note_proposals_contact
  ON note_proposals(contact_id);
