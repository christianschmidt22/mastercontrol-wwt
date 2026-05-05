# ADR 0009 - Outlook Integration via Windows COM Automation

**Status:** Superseded (original device-code plan) -> Accepted (COM approach)
**Date:** 2026-04-29
**Scope:** Phase 3 Outlook integration

## Context

MasterControl needs read access to the user's Microsoft 365 mailbox and
calendar so it can surface relevant emails alongside org notes and build
calendar-backed workflows such as daily reviews, availability checks, and
mileage reports.

The original design (Phase 3 Agent A) used the **OAuth 2.0 device-code flow**
(RFC 8628) against Microsoft Graph to obtain a delegated `Mail.Read` token.
This required an **Azure app registration** approved by the enterprise IT
organization.

**The corporate IT team at WWT does not allow custom Azure app registrations
for user-installed tools.** Without an approved registration, there is no
`client_id`, and the device-code flow cannot be initiated.

## Decision

Use **Windows COM automation** to read directly from the locally running
Outlook desktop application: no Azure registration, no OAuth tokens, no
network auth.

### How it works

1. PowerShell scripts connect to the running Outlook process via COM:
   ```powershell
   $outlook = [System.Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application')
   ```
2. `outlook-fetch.ps1` reads recent messages from Inbox and Sent Items using
   the Outlook object model (`GetDefaultFolder`) and writes JSON to stdout.
3. `outlook-calendar-fetch.ps1` reads the default Calendar folder
   (`GetDefaultFolder(9)`), expands recurring meetings inside the rolling sync
   window, and writes JSON to stdout.
4. The Node.js backend spawns `powershell.exe` with the scripts as child
   processes, collects stdout, and parses the JSON.
5. Parsed messages are upserted into `outlook_messages`; parsed calendar
   events are upserted into `calendar_events`.
6. Org-mention matching runs as before in `outlookSync.service.ts`.

### Connection status

`GET /api/outlook/status` returns `connected: true` when the COM probe succeeds
(i.e., Outlook is running and responds to `GetActiveObject`), and `connected:
false` when Outlook is not running.

## Consequences

### Positive

- **No Azure app registration required.** Zero corporate IT approval needed.
- **No tokens, no secrets.** Nothing to store, rotate, or DPAPI-encrypt for
  auth. (`outlook_refresh_token` removed from `SECRET_KEYS`.)
- **No OAuth complexity.** No device-code UI, no polling loop, no token refresh
  logic.
- **Works on WWT-managed machines.** PowerShell and Outlook COM are standard on
  any Windows device with Office installed.
- **Simpler codebase.** Removes OAuth service/auth-route complexity while
  keeping data local.

### Negative / Trade-offs

- **Outlook must be running.** The COM object is only available when the Outlook
  desktop app is open. Mail sync can launch Classic Outlook when needed.
  Calendar sync assumes the user keeps Classic Outlook open and reports a sync
  failure if COM is unavailable.
- **Windows-only.** COM automation is a Windows-only technology. This is
  acceptable: MasterControl is already a Windows-only app (SQLite path, DPAPI
  for API key encryption, OneDrive vault).
- **No email address in status.** The COM object does not trivially expose the
  current user's SMTP address in the same call used for the status probe.
  `email` in the status response is always `null` under this approach.
- **Outlook must have synced recently.** COM reads the local Outlook cache. If
  Outlook has not synced, the local cache may be stale. This is the same
  situation a user is already in for any Outlook-based workflow.

## Alternatives Considered

| Alternative | Rejected because |
|---|---|
| Device-code OAuth (RFC 8628) | Requires an approved Azure app registration, blocked by WWT IT policy |
| PKCE authorization-code redirect | Same Azure registration requirement; also needs a localhost HTTP listener |
| Client-credentials (app-only) | Requires admin consent to access mailboxes; not viable for personal-use app |
| Microsoft Graph SDK (Node) | Same registration requirement as any Graph-based approach |
| Graph API with personal Microsoft account | WWT M365 tenant does not allow personal accounts; tenant policy restricts to org accounts only |

## Removed Components

- `outlook_refresh_token` from `SECRET_KEYS` in `settings.model.ts`
- `initiateDeviceCodeFlow`, `pollDeviceCodeAuth`, `refreshIfNeeded`,
  `getGraphToken`, `graphFetch` from `outlook.service.ts`
- `POST /api/outlook/auth-start` and `GET /api/outlook/auth-poll` routes
- `OutlookSetup.tsx` modal component
- `useOutlookAuthStart`, `fetchAuthPoll` hooks from `useOutlook.ts`
- `DeviceCodeResponse`, `AuthPollResponse` from `types/outlook.ts`

## Security Notes

- No tokens of any kind are stored for Outlook. The surface area for token theft
  or leakage is zero.
- The PowerShell scripts run as the current user and can only access folders the
  user can already access in Outlook: no privilege escalation.
- R-013 applies: raw PS1 stdout can include message subjects, body previews,
  calendar subjects, locations, and body snippets. It is never logged. Only
  counts, status codes, and safe metadata are logged.
- R-021 applies if email or calendar body content is ever embedded in agent
  system prompts: wrap in `<untrusted_document>` and disable `record_insight`.

## Current Components

- `backend/src/scripts/outlook-fetch.ps1`: spawned by Node; reads Inbox and Sent
  Items from the running Outlook desktop app via `Marshal.GetActiveObject`;
  outputs JSON to stdout.
- `backend/src/scripts/outlook-calendar-fetch.ps1`: spawned by Node; reads the
  default Calendar folder from the running Outlook desktop app; outputs JSON to
  stdout and relies on the user keeping Classic Outlook open.
- `outlook.service.ts`: no OAuth, no tokens, no Azure; checks COM status and
  fetches mail.
- `outlookCalendar.service.ts`: shells out to the calendar COM script and
  returns normalized events for `calendarSync.service.ts`.
- `outlookSync.service.ts`: runs the mail upsert pipeline and org-mention
  matching unchanged.
