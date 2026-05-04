# Microsoft Graph Smoke Test

Use `scripts/m365-graph-smoke-test.mjs` to validate a delegated Microsoft
Graph access token against mailbox and calendar operations.

The script reads the token from `GRAPH_ACCESS_TOKEN`; it never writes the token
to code or reports. Run it from the repo root:

```powershell
$env:GRAPH_ACCESS_TOKEN = "<paste access token for this shell only>"
node scripts/m365-graph-smoke-test.mjs --date 2026-05-04
Remove-Item Env:\GRAPH_ACCESS_TOKEN
```

By default it:

- Reads `/me`.
- Reads the latest Inbox message and then fetches that message by ID.
- Sends a smoke-test email to the signed-in user's own address.
- Reads one day of calendar entries.
- Reads details for the first calendar entry returned that day.
- Creates a 15-minute sample calendar event on the following day, marked free
  and with reminders disabled.

Reports are written to `reports/m365-graph/` as JSON plus a short Markdown
summary. That directory is ignored by Git because message and calendar metadata
can be sensitive.

Message body content is not stored by default. To include a truncated plain-text
excerpt in the JSON report, pass `--include-message-body` or set:

```powershell
$env:M365_RECORD_BODY = "1"
```
