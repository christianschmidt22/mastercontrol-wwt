-- 032_m365_mcp_settings
--
-- Settings keys for the Anthropic-managed Microsoft 365 MCP connector.
-- The token is DPAPI-wrapped via SECRET_KEYS (see settings.model.ts).
-- The URL is the public MCP endpoint URL the user copies from their Anthropic
-- account; not sensitive on its own, stored plaintext.

INSERT OR IGNORE INTO settings(key, value) VALUES
  ('m365_mcp_url',     ''),
  ('m365_mcp_enabled', '0'),
  ('m365_mcp_name',    'm365');
-- m365_mcp_token is DPAPI-wrapped; not seeded.
