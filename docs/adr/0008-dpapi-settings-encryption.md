# ADR-0008: DPAPI-wrapped settings for the Anthropic API key

**Status**: Accepted
**Date**: 2026-04-25
**Implements**: R-003

**2026-04-28 update**: Core AI can now use Claude Code OAuth credentials from
`claude /login` via `settings.claude_auth_mode=subscription`. This ADR still
governs the fallback API-key path and other secret settings stored in SQLite.

---

## Context

The Anthropic API key must be stored somewhere the backend can read it at
runtime. Phase 1 stored it as plaintext in the `settings` table in the
SQLite database. The REVIEW.md R-003 flagged two risks:

1. **Database file readable by other processes**: The SQLite file at
   `C:\mastercontrol\database\mastercontrol.db` is a regular file on an
   NTFS volume. Any process running as the same user can open and read it.
   A `strings` dump of the file would reveal the API key.

2. **Logged by accident**: Express route handlers that log request bodies
   or error objects could inadvertently log the `value` field of a settings
   row if the error handler didn't strip it. Plaintext storage means a
   single logging mistake exposes the key.

Three options were evaluated:

### Option A — Plaintext (Phase 1 status quo)

Store the key as-is in `settings.value`. Simple; no dependencies.

*Cons*: `strings mastercontrol.db | grep sk-ant` reveals the key. Any
process running as the current user can read it.

### Option B — AES with a hardcoded or derived key

Encrypt the value with AES-256-GCM. The encryption key could be derived
from a static app secret or from the machine's hardware identity.

*Cons*: A hardcoded key in the source code is not materially better than
plaintext — anyone with the source has the key. A hardware-derived key
requires platform-specific code and is effectively DPAPI re-invented.

### Option C — Windows DPAPI via `@primno/dpapi` (chosen)

DPAPI (Data Protection API) is a Windows OS service that encrypts data
using a key derived from the current user's login credentials. The
encrypted blob is only decryptable by the same user on the same machine.
No key material is stored in the application code or the database.

`@primno/dpapi` is a Node.js binding to the DPAPI `ProtectData` /
`UnprotectData` functions.

*Pros*:
- The encrypted blob stored in `settings.value` cannot be decrypted by
  another user or by moving the database file to another machine.
- No application-managed key material.
- A strings dump of the database reveals only the base64-encoded DPAPI
  blob, not the plaintext key.

*Cons*:
- Windows-only. The backend must fall back to no-op encryption on
  non-Windows platforms (developer machines running macOS/Linux).
- `@primno/dpapi` is a native module and must be compiled or have a
  prebuild for the target Node version.

---

## Decision

**DPAPI via `@primno/dpapi` with a non-Windows no-op fallback.**

Implementation in `backend/src/models/settings.model.ts`:

- `SECRET_KEYS` includes `anthropic_api_key`, `personal_anthropic_api_key`,
  and other secret settings whose values are encrypted at rest.
- On write (`set(key, value)`): if `key ∈ SECRET_KEYS`, call
  `dpapi.protect(Buffer.from(value))` and store
  `'enc:' + base64(ciphertext)`. On non-Windows, store the value without
  the prefix (no-op fallback).
- On read: two getters:
  - `get(key)` — decrypts and returns the plaintext. **Only callable from
    service-layer code.** By convention, routes never call `get` for secret
    keys.
  - `getMasked(key)` — decrypts, takes the last 4 characters, returns
    `'***' + last4`. This is what the Settings route and any other HTTP
    surface uses.
- Service-layer code calls `get('anthropic_api_key')` directly only when the
  app is using the fallback API-key auth mode. The Claude Code login path reads
  OAuth credentials from `~/.claude/.credentials.json` through the Claude Agent
  SDK and does not copy those tokens into SQLite.

The chokepoint pattern — only the service layer calls `get`, everything
else calls `getMasked` — means a future audit of "where does the plaintext
key flow?" is a single-function grep for `settingsModel.get`.

---

## Consequences

### Positive
- `strings mastercontrol.db | grep sk-ant` returns nothing.
- The redacting error handler (`middleware/errorHandler.ts`) strips the
  `value` field from logged objects, but even if it failed, the stored
  blob would not be the plaintext key.
- The chokepoint pattern makes the key's usage surface auditable.
- The non-Windows fallback means CI and developer machines on macOS/Linux
  continue to work without DPAPI installed.

### Negative / trade-offs
- On the non-Windows path, the key is stored as plaintext. This is
  intentional (dev-only machines) and documented.
- DPAPI blobs are bound to the current user profile and machine. If the
  user needs to migrate the database to a new machine, they must
  re-enter the API key; the old encrypted blob cannot be decrypted.
  This is acceptable for a personal local app.
- If `@primno/dpapi` does not have a prebuild for a future Node version,
  it must be recompiled. The non-Windows fallback prevents a compile
  failure from blocking development.

---

## References
- `backend/src/models/settings.model.ts`
- `docs/REVIEW.md` R-003
- `CLAUDE.md` § Anthropic API key DPAPI note
