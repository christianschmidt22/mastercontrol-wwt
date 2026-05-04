# Microsoft Graph Smoke Test

Use `scripts/m365-graph-smoke-test.mjs` to validate delegated Microsoft Graph
access against mailbox and calendar operations.

## Persistent Local Login

Run this once from the repo root:

```powershell
node scripts/m365-graph-browser-login.mjs
```

The script opens Microsoft sign-in in Edge using auth-code + PKCE with a
temporary localhost callback. It requests these delegated scopes by default:

```text
User.Read Mail.Read Mail.ReadWrite Mail.Send Calendars.ReadWrite offline_access
```

MSAL stores the refresh-capable token cache at `.secrets/m365-msal-cache.dpapi`,
encrypted with Windows DPAPI for the current Windows user. `.secrets/` is
ignored by Git.

The access token itself will still be short-lived. MSAL uses the cached refresh
token to silently obtain new access tokens until Microsoft/WWT policy requires
interactive sign-in again.

By default, the trial login uses Microsoft's public Graph PowerShell client
because it supports device-code auth. To use a dedicated Entra app registration
instead, set:

```powershell
$env:M365_CLIENT_ID = "<public client app id>"
$env:M365_TENANT_ID = "<tenant id or organizations>"
```

If browser login is blocked by Conditional Access, device-code login is still
available for comparison:

```powershell
node scripts/m365-graph-device-login.mjs
```

## Smoke Test

After login, run:

```powershell
node scripts/m365-graph-smoke-test.mjs --date 2026-05-04
```

For a one-off test token instead of the MSAL cache:

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
can be sensitive. The script never writes raw access or refresh tokens to
reports.

Message body content is not stored by default. To include a truncated plain-text
excerpt in the JSON report, pass `--include-message-body` or set:

```powershell
$env:M365_RECORD_BODY = "1"
```
