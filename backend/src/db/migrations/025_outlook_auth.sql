-- 025_outlook_auth
--
-- Reserve settings keys for Microsoft Graph / Outlook integration (Phase 3).
--
-- Token storage strategy:
--   - outlook_refresh_token is DPAPI-wrapped via SECRET_KEYS (see settings.model.ts).
--     It is NOT seeded here; it is written on first successful device-code auth.
--   - outlook_tenant_id defaults to 'common' (works for any M365 tenant).
--   - outlook_client_id must be supplied by the user from their Azure app registration.
--   - outlook_account_email is display-only; set after first successful auth.
--   - last_outlook_sync_at is updated after each sync run.
--
-- No new table columns are needed; all state lives in the settings key/value store.

INSERT OR IGNORE INTO settings(key, value) VALUES
  ('outlook_tenant_id',    'common'),
  ('outlook_client_id',    ''),
  ('outlook_account_email', '');
