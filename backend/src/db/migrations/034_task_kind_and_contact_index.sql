-- 034_task_kind_and_contact_index
--
-- Split normal follow-up tasks from remembered customer questions while
-- keeping both in the same task lifecycle table.

ALTER TABLE tasks ADD COLUMN kind TEXT NOT NULL DEFAULT 'task';

CREATE INDEX IF NOT EXISTS idx_tasks_kind_status_due
  ON tasks(kind, status, due_date);

CREATE INDEX IF NOT EXISTS idx_tasks_contact
  ON tasks(contact_id);
