# ADR 0009 — Outlook Integration via Windows COM Automation

**Status:** Superseded (original device-code plan) → Accepted (COM approach)  
**Date:** 2026-04-29  
**Scope:** Phase 3 Outlook integration

## Context

MasterControl needs read access to the user's Microsoft 365 mailbox so it can
surface relevant emails alongside org notes.

The original design (Phase 3 Agent A) used the **OAuth 2.0 device-code flow**
(RFC 8628) against Microsoft Graph to obtain a delegated `Mail.Read` token.
This required an **Azure app registration** approved by the enterprise IT
organization.

**The corporate IT team at WWT does not allow custom Azure app registrations
for user-installed tools.** Without an approved registration, there is no
`client_id`, and the device-code flow cannot be initiated.

## Decision

Use **Windows COM automation** to read directly from the locally running
Outlook desktop application — no Azure registration, no OAuth tokens, no
network auth.

### How it works

1. A PowerShell script (`backend/src/scripts/outlook-fetch.ps1`) connects to
   the running Outlook process via COM:
   ```powershell
   $outlook = [System.Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application')
   ```
2. The script reads the 50 most recent messages from Inbox and Sent Items
   using the Outlook object model (`GetDefaultFolder`), then writes a JSON
   array to stdout.
3. The Node.js backend spawns `powershell.exe` with the script as a child
   process, collects stdout, and parses the JSON.
4. The parsed messages are upserted into `outlook_messages` via the existing
   `outlookMessage.model.ts` — **no changes to the data model**.
5. Org-mention matching runs as before in `outlookSync.service.ts`.

### Connection status

`GET /api/outlook/status` now returns `connected: true` when the COM probe
succeeds (i.e., Outlook is running and responds to `GetActiveObject`), and
`connected: false` when Outlook is not running.

## Consequences

### Positive

- **No Azure app registration required.** Zero corporate IT approval needed.
- **No tokens, no secrets.** Nothing to store, rotate, or DPAPI-encrypt for
  auth. (`outlook_refresh_token` removed from `SECRET_KEYS`.)
- **No OAuth complexity.** No device-code UI, no polling loop, no token
  refresh logic.
- **Works on WWT-managed machines.** PowerShell and Outlook COM are standard
  on any Windows device with Office installed.
- **Simpler codebase.** Removes ~300 lines of OAuth service + auth routes +
  OutlookSetup modal.

### Negative / Trade-offs

- **Outlook must be running.** The COM object is only available when the
  Outlook desktop app is open. If Outlook is closed, sync returns an empty
  result (no error, just a no-op).
- **Windows-only.** COM automation is a Windows-only technology. This is
  acceptable — MasterControl is already a Windows-only app (SQLite path,
  DPAPI for API key encryption, OneDrive vault).
- **No email address in status.** The COM object does not trivially expose
  the current user's SMTP address in the same call used for the status probe.
  `email` in the status response is always `null` under this approach.
- **Outlook must have synced recently.** COM reads the local Outlook cache.
  If Outlook has not synced (e.g., offline for days), the local cache may be
  stale. This is the same situation a user is already in for any Outlook-based
  workflow.

## Alternatives Considered

| Alternative | Rejected because |
|---|---|
| Device-code OAuth (RFC 8628) | Requires an approved Azure app registration — blocked by WWT IT policy |
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

- No tokens of any kind are stored for Outlook. The surface area for token
  theft or leakage is zero.
- The PowerShell script runs as the current user and can only access folders
  that user can already access in Outlook — no privilege escalation.
- R-013 applies: the raw PS1 stdout (which may contain email subjects and
  body previews) is never logged. Only counts and status codes are logged.
- R-021 applies if email body content is ever embedded in agent system
  prompts: wrap in `<untrusted_document>` and disable `record_insight`.
