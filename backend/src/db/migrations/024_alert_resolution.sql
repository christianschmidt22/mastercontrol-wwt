-- 024_alert_resolution
--
-- Alerts can now be acknowledged (read_at) separately from being resolved.
-- The bell shows unread + unresolved alerts; the alerts page can show and
-- filter the full operational history.

ALTER TABLE system_alerts ADD COLUMN resolved_at TEXT;

CREATE INDEX IF NOT EXISTS idx_system_alerts_unresolved
  ON system_alerts(resolved_at, read_at, created_at DESC);
