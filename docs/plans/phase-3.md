# MasterControl — Phase 3 Implementation Plan

## Context

Phase 2 closed out 2026-04-29 with the WorkVault wiring explicitly deferred,
the master-notes pipeline + external-edit scanner shipped, the note
proposal pipeline + redo-with-feedback flow polished, and the tile system
rebuilt on react-grid-layout. The CRM is fully usable as a single-user
day-to-day tool.

**Why Phase 3 now**: Phase 1 + Phase 2 covered the data plane and the
scheduled-jobs plane. Phase 3 is the integrations + polish phase — getting
data in (Outlook), getting data out (vault writeback so the user's
markdown ecosystem is bidirectional), and tightening the parts of the app
that work but don't yet feel finished (search, report viewing, model
quality knobs, visual design pass).

**What Phase 3 is _not_**: scope expansion. No multi-user. No mobile.
No external API surface. No DB-at-rest encryption (still `LATER`).

## Decisions locked

| # | Decision |
|---|----------|
| A | **Outlook integration uses Microsoft Graph with delegated auth** — user signs in once via the device-code flow, refresh token stored DPAPI-wrapped in `settings`. No app-only / service principal, no shared-tenant setup. The user is the only principal. |
| B | **Vault writeback uses the existing `master_notes` mirror as the canonical pattern.** Auto-saves write DB-first, file second. The hourly external-edit scanner (already shipped) reconciles drift. New per-org/per-project files live under the existing vault tree (`customers/<slug>/`, `oems/<slug>/`, `customers/<slug>/projects/<slug>/`). |
| C | **FTS5 backs `search_notes`** as a virtual table with content-source pointing at `notes`. Triggers keep the FTS table in sync on insert/update/delete. Migration adds the table and backfills. The `search_notes` tool handler swaps from LIKE to `MATCH`. |
| D | **In-app Markdown viewer is a read-only side panel**, not a full editor. Phase 3 doesn't add an in-app editor — file edits still happen externally (VS Code / Obsidian). The viewer renders sanitized HTML; no JS execution; relative links open in a new tab. |
| E | **Mention-extraction model + confidence threshold are settings**, not hard-coded constants. New keys in `settings`: `mention_extraction_model` (default `claude-haiku-4-5`), `mention_extraction_threshold` (default `0.5`). Both surfaced on the Agents page. |
| F | **Visual design pass treats existing themes as the baseline.** No new theme palettes; the work is making the existing UI feel intentional everywhere — typography rhythm, spacing tokens, motion language. The `frontend-design` and `vercel/web-design-guidelines` skills are the rubric. |
| G | **OEM `onedrive_folder` gets a dedicated input** in the OEM page settings popover (not the raw metadata JSON). Same wiring as the existing `doc_url` field on projects. |

## Architecture overview

```
Phase 3 adds:

backend/src/db/migrations/
  025_outlook_auth.sql     ← settings keys reserved (no schema columns —
                              tokens live as DPAPI-wrapped settings rows)
  026_outlook_messages.sql ← outlook_messages, outlook_threads (cached
                              email metadata; bodies fetched lazily)
  027_notes_fts.sql        ← FTS5 virtual table + sync triggers
  028_extraction_settings.sql ← settings rows seeded with defaults

backend/src/services/
  outlook.service.ts       ← Graph client wrapper, token refresh, sync
  outlookSync.service.ts   ← scheduled mailbox poll → outlook_messages
  vaultWriteback.service.ts ← extracted from masterNote.service: shared
                              "DB-first, vault-mirror second" pattern
  searchFts.service.ts     ← search_notes handler using FTS5

backend/src/models/
  outlookMessage.model.ts
  outlookThread.model.ts

backend/src/routes/
  outlook.route.ts         ← GET /auth-url, POST /auth-code,
                              GET /status, POST /sync-now,
                              GET /messages?org_id=
  search.route.ts          ← (optional) standalone search endpoint
                              parallel to the agent tool

frontend/src/pages/
  OutlookPage.tsx          ← (or settings panel) — connect, sync status,
                              recent messages by org

frontend/src/components/
  shared/MarkdownViewer.tsx ← sanitized renderer for report outputs
                               + master-note preview
  outlook/OutlookSetup.tsx
  outlook/MessageList.tsx
```

The Outlook sync runs in the same in-process scheduler. On startup,
`runMissedJobs()` catches up. The poll cadence is configurable (default 15
minutes); a manual "Sync now" button on the OutlookPage dispatches an
immediate run.

```
Sync flow:
  1. Refresh token if within 5 min of expiry.
  2. Delta-query Microsoft Graph for messages newer than the last sync
     watermark (per-folder; defaults to Inbox + Sent Items).
  3. For each message: store metadata (subject, from, to, cc, sent_at,
     internet_message_id) in outlook_messages. Body cached only on demand.
  4. Run mention-extraction over subject + preview to identify which orgs
     the message touches. Store as outlook_message_orgs rows.
  5. Update settings.last_outlook_sync_at.
```

## In scope

- **Outlook integration**: device-code auth, token refresh, mailbox sync,
  per-org message list tile.
- **Vault writeback** for notes-tagged-to-org and customer-ask records:
  same `DB-first, mirror-second` pattern as master notes. WorkVault stays
  read-only legacy material.
- **FTS5 for `search_notes`**: migration + trigger sync + handler swap.
  Backfill from existing `notes` rows.
- **In-app markdown viewer** as a shared component used by:
  ReportsPage history drawer (today shows file path only), MasterNotesTile
  preview tab, and any future viewer surface.
- **Mention extraction settings**: model + threshold knobs on Agents page.
- **OEM `onedrive_folder` UI**: dedicated input vs. raw metadata edit.
- **Visual design pass**: typography rhythm audit, motion language pass,
  consistent inline button heights, focus ring uniformity, hairline rule
  consistency. No layout changes — just tightening what's there.
- **`reportRunModel.create`** "insert ignored but no existing row found"
  path raises an alert (carry-over from Phase 2 cleanup observations).

## Out of scope

- Multi-user / multi-tenant.
- Mobile / PWA.
- DB-at-rest encryption (`LATER`).
- Voice input.
- AI-authored email replies (Outlook stays read-only for Phase 3).
- Calendar invitations (separate from email; calendar sync ships in
  Phase 1.5 already covers ingest of accepted events).
- An in-app markdown _editor_ for the master-note files (read-only viewer
  only; edits stay external in VS Code/Obsidian).

## Implementation steps

### Step 1 — Outlook auth + token store

**Goal**: user can connect their Outlook mailbox via the device-code flow
and refresh tokens persist DPAPI-wrapped.

- Reserve settings keys: `outlook_tenant_id` (optional;
  `common`/`organizations` default), `outlook_client_id` (Azure-app-reg
  client id, user-supplied), `outlook_refresh_token` (DPAPI-wrapped),
  `outlook_account_email` (for display).
- New `backend/src/services/outlook.service.ts`: `getAuthUrl()`,
  `exchangeDeviceCode(code)`, `refreshIfNeeded()`, `graphFetch(path)`.
- Routes `/api/outlook/auth-url` (returns device code + verification URL),
  `/api/outlook/auth-code` (polled by frontend until signed in),
  `/api/outlook/status`.
- Add `outlook_*` to `SECRET_KEYS` so the existing settings DPAPI logic
  wraps `outlook_refresh_token` automatically.
- ADR: `docs/adr/0009-outlook-delegated-auth.md` documenting why
  device-code over PKCE-redirect (no localhost callback complexity).

### Step 2 — Outlook sync pipeline

**Goal**: `outlook_messages` populated from Inbox + Sent Items via
delta-query; per-org message list available.

- Migration 026: `outlook_messages` (id, internet_message_id UNIQUE,
  thread_id, subject, from_email, from_name, to_emails JSON, cc_emails
  JSON, sent_at, has_attachments INTEGER, body_preview TEXT, body_cached
  TEXT NULLABLE) and `outlook_message_orgs` (message_id, org_id, source,
  confidence).
- `outlookSync.service.ts`: scheduled job (default `*/15 * * * *`).
  Reuses the in-process scheduler.
- Mention-extraction over subject + preview using the same prompt as note
  extraction (R-026 untrusted envelope applies).
- Per-org tile data: `GET /api/organizations/:id/outlook-messages?limit=20`.

### Step 3 — Outlook frontend

**Goal**: connect-mailbox flow + per-org messages tile.

- `frontend/src/pages/OutlookPage.tsx` (or section in SettingsPage) —
  device-code instructions, sign-in status, sync history.
- New tile `OutlookMessagesTile` with the same shape as RecentNotesTile.
  Slot it into customer + OEM default layouts.
- API hooks `useOutlookStatus`, `useOutlookMessages(orgId)`,
  `useOutlookSyncNow`.
- Auto-poll status every 30s while the device-code modal is open; stop on
  success or close.

### Step 4 — Vault writeback for org notes

**Goal**: every note authored in MasterControl mirrors to a
`<vault>/<orgs|oems>/<slug>/_notes/<yyyy-mm>/<note-id>.md` file. WorkVault
stays read-only.

- Extract the mirror logic from `masterNote.service.ts` into a generic
  `vaultWriteback.service.ts` with `writeNoteMirror(note)` and
  `writeMasterNoteMirror(masterNote)`.
- Hook into `noteCapture.service.ts` so every newly captured note
  produces a mirror file.
- Customer-ask notes (role `customer_ask`) go to a separate
  `_customer_asks/` subfolder so they're easy to grep externally.
- Conflict policy: same as existing master-notes scanner — file mtime
  newer than DB ⇒ re-import via the same path; sha matches ⇒ noop.
- Backfill: a `npm run vault:backfill` CLI that walks every undeleted
  `notes` row and writes its file. Idempotent; safe to re-run.

### Step 5 — FTS5 search

**Goal**: `search_notes` agent tool + any future search surface uses
FTS5 instead of LIKE-scan.

- Migration 027: `CREATE VIRTUAL TABLE notes_fts USING fts5(content,
  content='notes', content_rowid='id')` + `CREATE TRIGGER` for
  insert/update/delete sync.
- Backfill: `INSERT INTO notes_fts(notes_fts, rowid, content) SELECT
  'rebuild', id, content FROM notes`.
- Update `handleSearchNotes` in `claude.service.ts` to query
  `SELECT n.* FROM notes_fts f JOIN notes n ON n.id = f.rowid WHERE
  notes_fts MATCH ? ORDER BY rank LIMIT 10`.
- Tests: existing `search_notes` test coverage extends with FTS5
  semantics (phrase search, prefix match).

### Step 6 — Markdown viewer

**Goal**: report outputs render in-app instead of being a file path the
user opens externally. Same component reused for master-note preview.

- New `frontend/src/components/shared/MarkdownViewer.tsx`. Use
  `marked` + `dompurify` (already in node_modules? — check before adding
  deps).
- Sanitize: drop `<script>`, inline event handlers, `javascript:` URLs.
  Allow relative `<a href>` (open in new tab); block protocols other
  than `http`, `https`, `mailto`, and `file:` (file: links open via the
  existing `useOpenPath` shell handler).
- ReportsPage history drawer: replace the file-path `<code>` block with
  a `<MarkdownViewer source={...}>` block. Backend endpoint
  `GET /api/reports/runs/:id/content` returns the file content (read via
  `resolveSafePath` to keep the existing safety contract).
- MasterNotesTile gains a Preview / Edit toggle.

### Step 7 — Mention extraction settings

**Goal**: model + threshold are configurable at runtime.

- Migration 028: seeded `settings` rows for
  `mention_extraction_model` and `mention_extraction_threshold`.
- `mention.service.ts`: read both at call time (not module-load) so the
  user can change them without restarting.
- Agents page section: model dropdown (same options as the chat models)
  + threshold slider 0.0–1.0 with stepper.

### Step 8 — OEM `onedrive_folder` UI

**Goal**: replace the raw metadata JSON edit with a dedicated input.

- OEM page settings popover (existing pattern — see project
  ProjectConfigPanel) gains a `<label>OneDrive folder</label>` + path
  input.
- Existing `useUpdateOrg` writes to `metadata.onedrive_folder` directly;
  the input just edits that nested key. No backend change.
- Validate: path must exist (server-side check via the existing safe-path
  helper) before save commits.

### Step 9 — Visual design pass

**Goal**: tighten what we have. No layout changes; consistency only.

- Run the `vercel/web-design-guidelines` audit against the live UI; file
  findings as a checklist in `docs/FRONTEND-AUDIT.md` round 2.
- Apply only the items rated high-confidence:
  - Inline button heights all 30px (some are 28, some 32 today).
  - Focus-visible rings consistent — single shared ring style.
  - Hairline `var(--rule)` everywhere; no stray 1px solid colors.
  - prefers-reduced-motion guards on every transition.
  - Form labels paired with inputs everywhere; aria-describedby for
    error messages.
- One pass through each tile; commit per tile so the diff is reviewable.
- No new components from this step — this is style-only.

### Step 10 — Phase 2 carry-overs

- `reportRunModel.create` "insert ignored but no existing row found" path
  raises an alert (flagged in Phase 2 cleanup observations).
- Reports page `StatusPill` color harmonization is reviewed and either
  reverted or accepted-and-documented (flagged in Phase 2 cleanup A).

## Critical files

- `backend/src/services/outlook.service.ts` (new)
- `backend/src/services/outlookSync.service.ts` (new)
- `backend/src/services/vaultWriteback.service.ts` (new — extracted)
- `backend/src/services/masterNote.service.ts` (refactor — moves mirror
  logic out)
- `backend/src/services/claude.service.ts` (update `handleSearchNotes`)
- `backend/src/services/mention.service.ts` (read settings, not constants)
- `backend/src/db/migrations/025–028_*.sql` (new)
- `frontend/src/components/shared/MarkdownViewer.tsx` (new)
- `frontend/src/pages/OutlookPage.tsx` or settings section (new)
- `frontend/src/pages/ReportsPage.tsx` (use MarkdownViewer)
- `frontend/src/pages/AgentsPage.tsx` (extraction settings)
- `frontend/src/pages/OemPage.tsx` (onedrive_folder input)
- `docs/CHANGELOG.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`,
  `docs/adr/0009-outlook-delegated-auth.md`

## Verification checklist

```
[ ] npm run typecheck                           — both workspaces clean
[ ] npm run lint                                — both workspaces clean
[ ] npm run test                                — both workspaces green
[ ] _migrations has 28 rows                     — 025–028 applied
[ ] Outlook auth round-trips                    — connect, refresh,
                                                  status all work
[ ] Outlook sync runs hourly                    — 1 successful run row
                                                  on disk
[ ] outlook_message_orgs populated              — at least one row tagged
                                                  by mention extraction
[ ] Per-org messages tile lists ≥1 message      — for an org with mail
[ ] Vault writeback mirrors new note            — file exists at
                                                  expected path
[ ] Backfill writes pre-existing notes          — `vault:backfill` CLI
                                                  is idempotent
[ ] FTS5 search returns hits                    — `search_notes` tool
                                                  call exercises MATCH
[ ] Markdown viewer renders a report            — no XSS regressions in
                                                  test fixtures
[ ] Extraction settings change at runtime       — changing the model
                                                  doesn't require restart
[ ] OEM onedrive_folder input saves             — and validates the path
[ ] Visual audit findings closed                — all high-confidence
                                                  items addressed
[ ] reportRun-create stuck-row path alerts      — Phase 2 carryover
[ ] CHANGELOG entry added                       — Phase 3 closeout
                                                  section
```

## Open questions

1. **Outlook attachment handling**: do attachments ingest as `documents`
   rows? Default plan: no — Phase 3 stores metadata only. A future phase
   could index PDFs / docx via the existing read-only document tooling.

2. **WorkVault deferred-from-Phase-2 wiring**: Phase 3 doesn't enable it.
   Once vault writeback lands, the user has a clean writeback target;
   pulling the Phase 2 ingest scanner up to point at WorkVault becomes a
   half-day task in a Phase 3.5 or Phase 4. Track separately.

3. **Markdown editor in-app**: explicitly out of scope for Phase 3. If
   users start asking, scope a Phase 3.5 with `monaco-editor` or
   `codemirror` and a save-with-conflict-detection contract.

4. **Outlook delta-query sync watermark**: the simplest cursor is
   `received_at >= last_sync_at`. Microsoft Graph's `delta` endpoint is
   nicer (server-side change tracking) but harder to reset when something
   goes wrong. Default plan: timestamp watermark for Phase 3, switch to
   `delta` if perf/correctness becomes a problem.

5. **FTS5 multi-language tokenizer**: SQLite's default is English-only.
   Notes are English in practice; punt the unicode tokenizer choice
   unless it becomes a problem.

6. **Visual design pass scope creep**: easy for a "tightening" pass to
   become a full redesign. Hard rule: no layout changes, no new
   components, no new color tokens. If a finding requires any of those,
   defer to a later phase.
