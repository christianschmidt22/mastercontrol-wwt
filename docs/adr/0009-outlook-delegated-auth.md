# ADR 0009 — Outlook Delegated Auth via Device-Code Flow

**Status:** Accepted  
**Date:** 2026-04-29  
**Scope:** Phase 3 Outlook integration

## Context

MasterControl needs read access to the user's Microsoft 365 mailbox so it can
surface relevant emails alongside org notes. Obtaining this access requires an
OAuth 2.0 delegated-permission flow against Microsoft's identity platform
(Microsoft Entra ID).

The app runs locally at `http://localhost:5173` on Windows. The backend binds
to `127.0.0.1` only (R-001). This means:

- A traditional **authorization-code (PKCE) redirect flow** would require
  registering a localhost redirect URI and binding a local HTTP listener to
  receive the callback. Windows Defender and enterprise security policies
  regularly block ad-hoc port bindings, especially on WWT-managed laptops.
- We do not control Azure AD tenant policy; the app may be multi-tenant
  (different customers' M365 tenants) even though only one user ever runs it.

## Decision

Use the **OAuth 2.0 device-code flow** (RFC 8628) for the initial delegated
authorization.

Key flow:

1. The backend calls the `/oauth2/v2.0/devicecode` endpoint with
   `scope = offline_access Mail.Read`.
2. The backend receives a `device_code` (opaque, kept server-side) and a
   human-readable `user_code` + `verification_uri`.
3. The frontend displays `user_code` in large monospace type with the
   `verification_uri` as a clickable link (via `OutlookSetup.tsx`).
4. The backend polls the token endpoint every ≥ 5 s on the server side until
   the user completes the browser sign-in or the code expires.
5. On success the backend stores the access token in memory and persists the
   refresh token in the `settings` table as a DPAPI-wrapped secret under the
   key `outlook_refresh_token`.
6. The `device_code` is never sent to the browser — only the display
   `user_code` and `verification_uri` reach the client.

The `user_code` is good for `expires_in` seconds (typically 15 minutes),
which is ample for a user to complete sign-in.

## Consequences

### Positive

- **No localhost HTTP server required.** No port binding, no Windows Firewall
  prompts, no redirect-URI registration pointing to `http://127.0.0.1:NNNN`.
- **No PKCE complexity.** The device-code flow is simpler to implement and
  audit than authorization-code + PKCE.
- **Works on corporate / WWT-managed machines.** Device-code flow is supported
  by all M365 tenant configurations that allow public-client apps.
- **Single-user app.** The single refresh token lives in the user-scoped
  DPAPI store — no multi-user token management needed.
- **Refresh token encrypted at rest.** DPAPI (ADR 0008) wraps the token so it
  is opaque to any process that does not run as the same Windows user.
- **Access token never persisted.** The in-process `_accessToken` variable is
  memory-only; it disappears on backend restart. The next GraphFetch call
  silently refreshes from the stored refresh token.

### Negative / Trade-offs

- **User must visit an external URI.** Unlike PKCE, the user opens
  `https://microsoft.com/devicelogin` in a separate browser tab. This is a
  minor UX friction for a one-time setup.
- **Polling overhead.** The backend polls the token endpoint every 5 s during
  auth. This is acceptable because it only runs during the setup modal (brief,
  one-time).
- **No SDK.** We use plain `fetch()` against `graph.microsoft.com`. This means
  we own retry logic and token refresh. The trade-off is no extra dependency
  and transparent control over what is sent over the wire.

## Alternatives Considered

| Alternative | Rejected because |
|---|---|
| PKCE authorization-code redirect | Requires localhost HTTP listener; blocked by Windows Firewall on corporate machines |
| Client-credentials (app-only) | Requires admin consent to access mailboxes; not viable for a personal-use app |
| MSAL.js in browser | Puts token management in the frontend; violates the layer rule that secrets stay server-side |
| Microsoft Graph SDK (Node) | Adds a large dependency graph; device-code + fetch is sufficient and auditable |

## Security Notes

- `outlook_refresh_token` is in `SECRET_KEYS` (settings.model.ts), so it is
  DPAPI-encrypted on write and never returned by any API route.
- The `device_code` is stored in a module-level variable in
  `outlook.route.ts` and cleared on success. It is never sent to the browser.
- Access to Graph is scoped to `Mail.Read` (read-only). Phase 3 does not
  implement any write or send capability (per spec).
- R-021 applies if Graph email body content is ever embedded in system
  prompts: wrap in `<untrusted_document>` and disable `record_insight`.
