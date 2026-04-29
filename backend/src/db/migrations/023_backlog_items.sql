-- 023_backlog_items.sql
--
-- MasterControl-meta backlog: features / changes the user wants to make to
-- this app itself. Same shape as `tasks` but a separate table so it does
-- not pollute the customer/OEM task queries — these aren't tied to any
-- account, project, or contact.

CREATE TABLE IF NOT EXISTS backlog_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  notes TEXT,
  due_date DATETIME,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'done', 'snoozed')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_backlog_items_status_due
  ON backlog_items(status, due_date);
