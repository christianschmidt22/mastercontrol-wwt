-- 013_contact_account_assignments.sql
--
-- Adds a join table for tracking which customer accounts an OEM contact is
-- assigned to. Many-to-many: one contact can cover several accounts, one
-- account can have contacts from several OEM partners.
--
-- Used by the OEM AccountChannelTile to show account coverage per contact,
-- and by the agent system prompt to surface "who at this OEM covers this
-- customer" context.
--
-- Cascade-deletes when either side is removed.

CREATE TABLE IF NOT EXISTS contact_account_assignments (
  contact_id      INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_assignments_contact
  ON contact_account_assignments(contact_id);

CREATE INDEX IF NOT EXISTS idx_assignments_org
  ON contact_account_assignments(organization_id);
