CREATE INDEX idx_notes_thread_created
  ON notes(thread_id, created_at)
  WHERE thread_id IS NOT NULL;

CREATE INDEX idx_notes_created
  ON notes(created_at DESC);

CREATE INDEX idx_threads_org_last
  ON agent_threads(organization_id, last_message_at DESC);

CREATE INDEX idx_tasks_org_status
  ON tasks(organization_id, status);
