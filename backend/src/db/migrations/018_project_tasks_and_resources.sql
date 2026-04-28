-- 018_project_tasks_and_resources
--
-- 1. Add project_id to tasks so a task can be scoped to a specific project.
--    Nullable — existing tasks remain org-only.
--
-- 2. project_resources: WWT internal staff (SE, overlay, BDM, etc.) engaged
--    on a project. Extracted from notes via the internal_resource proposal type.

ALTER TABLE tasks ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);

CREATE TABLE IF NOT EXISTS project_resources (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  role            TEXT,
  team            TEXT,
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_project_resources_project ON project_resources(project_id);
