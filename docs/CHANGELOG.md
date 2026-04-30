# Changelog

## Phase 3 — integrations + polish (2026-04-29, updated)

Outlook integration (device-code auth, Graph sync, per-org tile), FTS5 search,
in-app Markdown viewer, mention-extraction settings, OEM OneDrive folder input,
and Phase 2 carry-overs. Vault writeback intentionally deferred to a later phase.

### Migrations
- `025_notes_fts.sql` — FTS5 virtual table `notes_fts` backed by `notes.content`
  with INSERT/UPDATE/DELETE sync triggers; backfills existing rows.
- `026_extraction_settings.sql` — seeds `mention_extraction_model` and
  `mention_extraction_threshold` settings rows with safe defaults.
- `027_outlook_auth.sql` — seeds Outlook settings keys (`outlook_tenant_id`,
  `outlook_client_id`, `outlook_account_email`).
- `028_outlook_messages.sql` — `outlook_messages` and `outlook_message_orgs`
  tables for Graph-synced email metadata.

### Backend services / models
- **FTS5 search** — `handleSearchNotes` in `claude.service.ts` swapped from
  LIKE-scan to FTS5 `MATCH`; supports phrase search, prefix match, ranked results.
- **Mention extraction settings** — `mention.service.ts` reads
  `mention_extraction_model` and `mention_extraction_threshold` from the settings
  table at call time (not module-load), so changes apply without restart.
- **Outlook Graph client** (`outlook.service.ts`) — device-code OAuth flow; access
  token cached in-process; refresh token DPAPI-wrapped via `SECRET_KEYS`.
- **Outlook sync** (`outlookSync.service.ts`) — 15-minute scheduled mailbox poll
  (inbox + sent items) via Microsoft Graph delta query; org mention extraction over
  subject + body preview; `last_outlook_sync_at` watermark in settings.
- **OutlookMessage model** — prepared-statement model for `outlook_messages` /
  `outlook_message_orgs` with `upsert`, `findByOrg`, `getRecentByOrg`.
- **Report content endpoint** — `GET /api/reports/:reportId/runs/:runId/content`
  reads run output file via `resolveSafePath`; returns `{ content: string }`.
- **Outlook routes** — `GET /status`, `POST /auth-start`, `GET /auth-poll`,
  `POST /sync-now`, `GET /messages?org_id=`; `device_code` never sent to browser.
- **`reportRun.create` stuck-row alert** — "INSERT OR IGNORE fired but no existing
  row found" path now raises a system alert before throwing (Phase 2 carry-over).

### Frontend
- **MarkdownViewer** (`components/shared/MarkdownViewer.tsx`) — read-only sanitized
  renderer using `marked` + `DOMPurify`; conservative tag allowlist; all links open
  in new tab; `role="region"` + `aria-label` for a11y.
- **ReportsPage viewer** — history drawer replaces file-path code block with
  `MarkdownViewer`; output path preserved as secondary `<code>` element.
- **MasterNotesTile preview** — Edit/Preview toggle; Preview tab renders master note
  content via `MarkdownViewer` in a fixed-height scroll container.
- **OutlookPage** — connect-mailbox flow (device-code modal), sync status, last-sync
  time, Sync Now button; route `/outlook`.
- **OutlookSetup modal** — displays user code in large mono font, auto-polls
  `auth-poll` every 5 s, closes on success.
- **OutlookMessagesTile** — org-scoped message list tile; same shape as
  `RecentNotesTile`; uses `useOutlookMessages(orgId)`.
- **AgentsPage mention settings** — model dropdown + confidence threshold slider
  (0–1, step 0.05) in the Templates tab; wired to settings via `useSetSetting`.
- **OemPage OneDrive folder** — dedicated labeled input in the OEM settings popover
  persists `metadata.onedrive_folder` via `useUpdateOrganization`.

### ADR
- `docs/adr/0009-outlook-delegated-auth.md` — documents switch from Graph/device-code
  (blocked by corporate IT — no Azure app registration permitted) to Windows COM
  automation via PowerShell; reads from local Outlook desktop cache, no auth required.

### Outlook integration revised: Graph → COM automation
Original Graph/OAuth approach was blocked (IT denied Azure app registration).
Replaced with PowerShell COM automation:
- `backend/src/scripts/outlook-fetch.ps1` — spawned by Node; reads Inbox + Sent
  Items from the running Outlook desktop app via `Marshal.GetActiveObject`; outputs
  JSON to stdout; gracefully returns empty result if Outlook is not running.
- `outlook.service.ts` rewritten — no OAuth, no tokens, no Azure; `fetchOutlookMessages()`
  spawns the PS1 script, `getOutlookStatus()` probes COM availability.
- `outlookSync.service.ts` updated — calls `fetchOutlookMessages()` instead of Graph;
  upsert pipeline and org-mention matching unchanged.
- Auth routes (`auth-start`, `auth-poll`) removed; `OutlookSetup` modal removed.
- `OutlookPage` simplified — green/amber status dot, Sync Now button, no connect flow.
- `outlook_refresh_token` removed from `SECRET_KEYS`.

### Tests added
- `searchFts.test.ts` — 7 tests: keyword match, phrase search, empty-query guard,
  UPDATE/DELETE trigger sync, org-scoped filtering.
- `mentionSettings.test.ts` — 5 tests: model + threshold read from settings at
  call time, not hardcoded.
- `reportsContent.route.test.ts` — 7 tests: happy path, 404 variants, 403 path
  escape, 400 invalid params.
- `outlookMessage.model.test.ts` — 11 model tests.
- `outlook.route.test.ts` — 9 route tests (service mocked).

### Verification
- `npm run typecheck` — clean (both workspaces)
- `npm run lint` — clean (both workspaces)
- `npm run test -w backend` — 617 tests, 50 files, all green

---

## Phase 2 — closeout (2026-04-29)

Synthesizes the work that landed since the `phase2-checkpoint-6` polish round
into the closing surface of Phase 2. WorkVault ingest wiring is intentionally
deferred; everything else in the Phase 2 plan is on `main`.

### Migrations
- `015_note_manager.sql` — `note_proposals` approval queue plus capture-path
  metadata for durable markdown notes.
- `016_calendar.sql` — `calendar_events` with `uid` PK (recurring instances
  use `uid:YYYY-MM-DD` composite keys).
- `017_alerts.sql` — `system_alerts` (severity, source, message, detail,
  read_at) for surfacing background-job failures.
- `018_project_tasks_and_resources.sql` — nullable `tasks.project_id` FK and
  the new `project_resources` table.
- `019_note_proposals_internal_resource.sql` — rebuilds the proposal CHECK
  to admit `internal_resource` approvals on live databases.
- `020_note_proposals_contact.sql` — proposal contact linkage for
  contact-targeted approvals.
- `021_notes_customer_ask_role.sql` — extends the `notes.role` set with
  `customer_ask`.
- `022_master_notes.sql` — `master_notes` (one durable per-org note) plus
  the metadata needed to round-trip with the entity's vault folder.
- `023_backlog_items.sql` — backlog table for parked-but-not-task items.
- `024_alert_resolution.sql` — adds resolved state + actor columns so the
  bell only counts unread unresolved alerts.

### Backend services
- `ingest.service.ts` — walk → hash → reconcile loop with the five-case
  matrix and the `<untrusted_document>`-wrapped mention extractor; per-error
  retry endpoint hooks back into `retrySingleError()`.
- `workvault.service.ts` — server-derived filename, safe-path containment,
  collision refusal (R-025).
- `reports.service.ts` — `runReport`, prompt-template expansion,
  `seedDailyTaskReview`, `recordUsageFromMessage` instrumentation, and
  failure-path `logAlert` calls.
- `mention.service.ts` — extracts org mentions on note save with `tools: []`
  and a confidence floor of 0.5 (R-021/R-026).
- `scheduler.service.ts` — `node-cron` in-process plus `runMissedJobs()`
  catch-up at startup, with per-iteration try/catch.
- `calendarSync.service.ts` — DPAPI-encrypted ICS URL, `node-ical` parsing,
  90-day recurring expansion via `expandRecurringEvent`, scheduled at 06:00 /
  12:00 / 17:00 with a fire-and-forget startup sync.
- `masterNote.service.ts` — `scanExternalMasterNoteEdits` reconciles edits
  the user makes to master-note files outside the app; runs hourly via cron
  and on demand through a manual scan endpoint.
- `noteProposal.service.ts` — `runLlmExtraction()` fire-and-forget pipeline,
  `applyApproval()` materializing tasks / notes / resources / mentions.
- `noteCapture.service.ts` — durable markdown capture into scoped vault
  folders, indexed back into `notes`.

### Backend routes
- `reports.route.ts` — full CRUD plus `run-now`, `runs`, and cron-validate.
- `ingest.route.ts` — scan, status, per-error retry.
- `oem-scan.route.ts` — `GET /api/oem/:id/documents/scan` upserts
  `documents` rows with `source='onedrive_scan'`.
- `calendar.route.ts` — `GET /api/calendar/today`, `POST /api/calendar/sync`.
- `alerts.route.ts` — list / count / read / read-all / resolve, all routed
  through the redacting error handler.
- `masterNotes.route.ts` — get/save plus the manual external-edit scan
  trigger.
- `backlogItems.route.ts` — backlog CRUD.
- `projectResources.route.ts` — nested `/api/projects/:projectId/resources`
  CRUD with `mergeParams`.

### Agent tools
- `search_notes`, `list_documents`, `read_document` (via `resolveSafePath`,
  1 MiB cap, `<untrusted_document>` envelope), and `create_task` (with
  service-layer cross-org guard) — all logged to `agent_tool_audit` and
  gated by `agent_configs.tools_enabled` (R-021).
- `report_note_proposals` output-only tool added to `claude.service.ts` for
  forced-tool-use structured extraction with claude-haiku-4-5.
- Subscription-login path maps the same five MasterControl tools into an
  in-process SDK MCP server so `claude_auth_mode=subscription` keeps the
  same write boundaries.

### Frontend
- `ReportsPage.tsx` real implementation — humanized cron, run-now spinner,
  History dialog with the last 20 runs, and failure flag in the run table.
- `AlertsPage.tsx` plus the `AlertBell` Shell header component with
  vermilion unread dot, dismiss-per-item, dismiss-all, and Escape close.
- `TasksPage.tsx` rebuilt around a sortable column table with per-column
  filters, inline complete checkbox, and reopen-on-uncheck.
- `TodayAgendaTile` reads from the local calendar cache and exposes an
  inline Sync button against `POST /api/calendar/sync`.
- `ProjectNextStepsTile` and `ProjectResourcesTile` added to
  `ProjectPage` for project-scoped tasks and WWT internal resources.
- Customer page reorganized into Home + per-project tabs with editable
  project header, and the OEM workspace consolidated into a single sidebar
  entry with in-page tabs.
- `OpenProjectsTile` (renamed from "Priority Projects") shows
  active/qualifying/paused with amber styling for paused, plus the
  "All projects" archive modal.
- Sidebar gained per-org vermilion activity dots backed by
  `useOrgLastTouched`, plus tightened active-route treatment.
- `AgentsPage` Templates tab now hosts `AgentSectionEditor` and
  `AgentOverridesPanel`; Threads / Insights / Delegate tabs preserved.
- `SettingsPage` got Anthropic API key, Core Claude Authentication
  (subscription / auto / api_key), default model, theme, paths, and the
  Ingest Scan panel inline.
- `frontend/src/components/ingest/` (`IngestStatusPanel`,
  `SourcePathConfig`, `IngestErrorList`) wires the per-error retry flow.

### Themes
- Theme selector (Light / Dark / System) wired through Zustand,
  `documentElement`, and the backend `settings` row so the choice persists
  across reloads.

### Notes pipeline
- `extractNoteProposals()` in `claude.service.ts` uses claude-haiku-4-5 with
  forced tool-use output; proposal types include `customer_ask`,
  `task_follow_up`, `project_update`, `risk_blocker`, `oem_mention`,
  `customer_insight`, and `internal_resource`.
- `applyApproval()` materializes durable records on Approve (tasks, notes,
  project resources, agent insights, OEM cross-org notes).
- `POST /api/notes/proposals/:id/status` keeps the proposal in `pending` on
  apply-failure so the queue self-heals.
- Redo-with-feedback path lets the user reject a proposal with a comment
  and rerun extraction without losing the original capture.

### Master notes
- `scanExternalMasterNoteEdits` watches the on-disk master-note file per
  org and reconciles user edits; hourly cron via `scheduler.service.ts`
  plus `POST /api/master-notes/:orgId/scan-external` for manual triggers.
- Master-note tile and OEM-header inline editor read/write through the
  same model layer, no duplicate state.

### Backlog
- `BacklogTile` plus `BacklogEditDialog` for parked items that aren't yet
  tasks; backed by `backlog_items` and `backlogItems.route.ts`.

### Reports
- `ReportsPage` flags failed runs visually and the failure path now raises
  a `system_alerts` row through `logAlert('error', 'reports', ...)` so
  silent failures surface in the bell.
- DB-write failures from the alert pipeline route through the redactor
  per R-013.

### Tile system
- Tiles migrated to `react-grid-layout` with persisted resize/move while in
  Customize mode, replacing the previous `@dnd-kit` sortable approach.
- `Customize Layout` icon control added to dashboard headers; layouts
  persist per dashboard via `useTileLayout`.
- Inline-add affordances landed on contact, link, and task tiles
  (Esc cancels, Enter saves, Save vermilion only when dirty).

### Brand
- Shared `StatusPill` primitive in `frontend/src/components/shared/` now
  drives status chips on `CustomerPage`, `ReportsPage`, and
  `PriorityProjectsTile` so vermilion budget stays consistent (R-008).

## Unreleased

- Tasks page now uses a column table with header sorting and per-column filters;
  checking an open task completes it, while unchecking a done task reopens it.
- Alerts now have a resolved state, a full Alerts page with table
  sorting/filtering/actions, and the bell only lists unread unresolved alerts.
- WorkVault ingest tombstoning now uses the files seen in the current scan
  under the scanned root instead of relying on millisecond timestamp ordering.

- Project next steps now keep completed tasks visible in the tile with a reopen
  action, and reopening a task clears its completion timestamp.

- Claude Code structured extraction no longer forces `maxTurns: 1`; org
  mention, primary-org, and note proposal extraction now use the subscription
  helper's three-turn default so schema-enforced output can complete.
- `019_note_proposals_internal_resource.sql` rebuilds the note proposal CHECK
  constraint so live databases accept `internal_resource` approval items.
- Backend Vitest now runs with one worker by default to avoid intermittent
  Windows fork-worker exits during the full suite.

- Claude Code login for core AI:
  - Core CRM AI calls now support `claude_auth_mode=subscription`, using the
    local Claude Code OAuth session from `claude /login` instead of requiring
    `settings.anthropic_api_key`.
  - The subscription path covers org chat streaming, scheduled reports, org
    mention extraction, primary-org classification, and live note proposal
    extraction. API-key mode remains as a fallback for existing installs and
    tests.
  - Org chat maps MasterControl tools (`record_insight`, `search_notes`,
    `list_documents`, `read_document`, `create_task`) into an in-process SDK MCP
    server so the Claude Code login path keeps the same CRM write boundaries.
  - Settings now has a **Core Claude Authentication** section with Auto,
    Claude Code login, and API key modes. `/api/subagent/auth-status` also
    reports core API-key status and the selected core auth mode.

- Project resources + next steps:
  - `018_project_tasks_and_resources.sql` migration: adds nullable `project_id`
    FK to `tasks`; new `project_resources` table (id, project_id, organization_id,
    name, role, team, notes, created_at, updated_at).
  - `task.model.ts` + `task.schema.ts`: `project_id` field on Task, TaskInput,
    TaskFilters, TaskCreate, TaskUpdate. `GET /api/tasks?project_id=N` filter added.
  - `projectResource.model.ts` + schema + `GET|POST|PUT|DELETE
    /api/projects/:projectId/resources` route (mounted with mergeParams: true).
  - `internal_resource` added to `NoteProposalType`, to the LLM extraction tool
    enum + system prompt, and to `applyApproval()` — creates a `project_resources`
    row when a project is in scope.
  - `task_follow_up` approval now passes `project_id` when one is present so
    project-scoped tasks show up in the new tile rather than only globally.
  - `ProjectNextStepsTile` — shows open tasks for the current project
    (`GET /api/tasks?project_id=N&status=open`), inline add-step form, check-
    button to complete.
  - `ProjectResourcesTile` — lists WWT internal resources engaged on the project
    (SE, BDM, overlay, etc.), inline add form (name/role/team), hover remove
    button.
  - Both tiles added to `ProjectPage` in a two-column grid below the notes tile.

- Calendar sync + system alerts:
  - `calendar_ics_url` stored DPAPI-encrypted in settings (same security model
    as the Anthropic API key). ICS URL is never logged or committed.
  - `016_calendar.sql` migration: `calendar_events` table with uid primary key
    (recurring instances use `uid:YYYY-MM-DD` composite key).
  - `calendarSync.service.ts` fetches ICS via `fetch()`, parses with
    `node-ical`, expands recurring events for a 90-day window using
    `expandRecurringEvent`, upserts into `calendar_events`, and prunes events
    older than 7 days. Scheduled at 06:00, 12:00, 17:00 via node-cron.
    Startup sync fires immediately on boot (fire-and-forget).
  - `GET /api/calendar/today?date=YYYY-MM-DD` reads from local cache (<1 ms).
    `POST /api/calendar/sync` triggers an on-demand refresh.
  - `017_alerts.sql` migration: `system_alerts` table with severity, source,
    message, detail, and read_at columns.
  - `logAlert(severity, source, message, err?)` convenience helper used by all
    background jobs so failures surface in the UI instead of dying silently.
    Calendar sync failure paths call `logAlert('error', 'calendarSync', ...)`.
  - `GET /api/alerts`, `GET /api/alerts/count`, `POST /api/alerts/:id/read`,
    `POST /api/alerts/read-all` routes with 60-second frontend polling.
  - `AlertBell` component in the Shell header: fixed top-right, vermilion dot
    badge when unread alerts exist, panel with dismiss-per-item and dismiss-all.
    Closes on outside click and Escape; focus-visible ring.
  - `TodayAgendaTile` on the Home page: reads today's events from the local
    cache, shows time / title / location / attendee count, inline Sync button
    that triggers `POST /api/calendar/sync` and shows last-sync timestamp.
- Open Projects tile + customer page tab filter:
  - Renamed "Priority Projects" tile to **"Open Projects"** on customer pages.
  - Tile now shows `active`, `qualifying`, and `paused` projects; paused
    projects render in amber text to differentiate without using the vermilion
    accent.
  - Folder button (opens project folder in Windows Explorer via
    `shell:AppsFolder` / direct `doc_url`) is always visible next to the
    status pill rather than hidden until hover.
  - "All projects" button (Archive icon) added next to "+ Add project" in the
    tile header. Opens a fixed-position modal showing all projects grouped into
    Open and Closed, with click-to-navigate to each project's tab.
  - Customer page tabs now only show `active` and `qualifying` projects; paused
    and closed projects are reachable through the "All projects" modal only.
- Notes ingest extraction engine:
  - Real LLM extraction for captured notes using `extractNoteProposals()` in
    `claude.service.ts`. Uses claude-haiku-4-5 with forced tool-use output so
    results are typed JSON. R-021: the `report_note_proposals` tool is
    output-only (not a write tool). R-026: note content wrapped in
    `<untrusted_document>`.
  - `runLlmExtraction()` in `noteProposal.service.ts` fires async (fire-and-
    forget) after every note capture. On success it replaces the initial triage
    placeholder with real typed proposals; on failure (no API key, timeout) the
    triage remains as fallback.
  - Proposal types with structured payloads: `customer_ask`, `task_follow_up`,
    `project_update`, `risk_blocker`, `oem_mention`, `customer_insight`.
  - `applyApproval()` creates durable records on Approve:
    - `task_follow_up` → `tasks` row (with due_date if extracted)
    - `customer_ask` → user note with "Customer Ask:" prefix
    - `project_update` → user note on the project
    - `risk_blocker` → user note + open task flagged `[Risk]`
    - `oem_mention` → user note on the target OEM org (resolved from name during
      extraction; falls back to current org)
    - `customer_insight` → confirmed `agent_insight` note (immediately confirmed
      since the user approved it)
  - `POST /api/notes/proposals/:id/status` with `status: approved` now calls
    `applyApproval` before stamping the status, keeping the proposal in
    `pending` if record creation fails.
  - 11 new service tests in `noteProposal.service.test.ts`; 3 new route tests
    for the approve → creates-record path.
- Notes manager foundation:
  - Added durable markdown note capture through `/api/notes/capture`.
    Captured notes write to scoped customer/OEM `_notes/<year>` folders, or
    project `_notes/<year>` folders when project context is present, and are
    indexed back into `notes`.
  - Added `note_proposals` as the approval queue for extracted records. The
    first pass queues an initial triage proposal for every captured note.
  - Added a Home-page Note Approvals tile with detail modal and
    Approve / Deny / Discuss actions.
  - Project pages now include a note tile that captures notes with customer
    and project context.
- OEM header note polish:
  - Removed the "OEM Partners" eyebrow above the OEM name.
  - Made the top OEM note editable inline, backed by each OEM's
    `metadata.summary`, matching the customer-page summary behavior.
  - Added focused `OemPageHeader` tests for the missing eyebrow and inline
    note save path.
- Customer/OEM workspace polish shipped on
  `codex/customer-oem-tabs-layout`:
  - Customer pages now use a Home tab plus per-project tabs. Project tabs
    have an editable, project-specific note field in the header area and
    editable project name, description, status, and folder fields.
  - Customer sidebar ordering now pins C.H. Robinson first and Fairview
    second, with remaining customers sorted by name.
  - OEM navigation is a single sidebar entry with in-page OEM tabs. The
    header action trio was removed, tabs wrap instead of requiring the
    small scroll control, and tab labels spell out OEM names except Dell
    and Pure, which intentionally remain short.
  - Tile layout customization persists and supports resize while in
    customize mode; customer/OEM dashboard controls now match the current
    product direction.
  - Validation: `npm run typecheck`, `npm run lint`, and `npm run test`
    passed before merge.
- Documented the MasterControl vault contract in `docs/VAULT.md` and linked it
  from `CLAUDE.md`, `docs/PRD.md`, and `docs/ARCHITECTURE.md`. The contract
  locks the entity-first OneDrive layout, clarifies `_agent` vs. DB-backed
  agent memory, maps legacy WorkVault folders, and calls out the remaining
  report-output migration from repo-level `reports/` to
  `<mastercontrol_root>\reports`.

## Phase 2 — Merged ✓ (2026-04-26)

Phase 2 ships in two five-stream parallel-agent batches off the verified
Phase 1 baseline, merged onto `main` as commit `3650106` together with the
ESLint v9 setup contributed by a parallel OpenAI Codex CLI session, and
then continues with the polish rounds tracked in the checkpoints below.
11 of 12 plan steps (`docs/plans/phase-2.md`) shipped; only Step 12
(manual browser walkthrough) remains.

### Checkpoint `phase2-checkpoint-6` — 2026-04-27 morning

**A focused product polish round.** With Fairview + C.H. Robinson seeded
and the per-org chat / cross-org insights surface live, this round
chased the rough edges that kept the dashboard from feeling finished:
the customer + OEM dashboards needed inline-add flows, the home page
agent-insights widget was throwing on empty arrays, the OEM page was an
empty-state, the Tasks page lacked filters and inline complete, the
sidebar didn't communicate which org had fresh activity, and the agents
+ settings pages needed real configuration UIs.

Six SDK delegations on the user's Max subscription ran in parallel for
the bulk of this round; Tasks F + L + K + H + I shipped end-to-end (J
hit max_iterations after the backend half landed and the frontend
widgets were deferred). Three subsequent commits cleaned up regressions
the agents introduced (AuthModeSection dropped from SettingsPage,
Threads/Insights/Delegate tabs dropped from AgentsPage) and wired the
final backend half (POST + DELETE `/api/agents/configs`) so the
override Add/Delete UI works end-to-end.

Backend **535** tests · frontend **429** tests · both workspaces
typecheck + lint clean. Five-org seed visible on first boot:
Fairview Health Services + C.H. Robinson (customer), Cisco + NetApp
+ Nutanix (oem) with cross-org `note_mentions` populating both the
customer-side cross-org insights panel and the OEM-side mentioned-by
panel.

- **OEM seed migration** (`0b4d486`): `012_seed_oem_partners.sql` —
  3 OEMs · 7 contacts · 12 notes · 3 threads · 2 cross-refs. 4 of the
  notes are `agent_insight` rows (3 confirmed, 1 unconfirmed) so the
  inline accept/dismiss flow has data to drive.
- **Tasks page polish** (`1ae1708`): inline-add at top (vermilion
  Save when open), inline complete checkbox per row with optimistic
  slide-out animation respecting `prefers-reduced-motion`, four
  filter pills (All / Today / This week / Overdue) with
  `role=radiogroup` + arrow-key nav + filter-specific empty states.
  Suite 5 → 18.
- **Backend `/notes/recent` + `/organizations/recent`** (`74d98eb`):
  two aggregator endpoints for the home page enrichment widgets.
  Joined query against `notes`, `organizations`, and `agent_threads`
  for the last-touched-per-org map. Frontend widgets pending —
  endpoints + types are ready for the next round.
- **OEM tile inline-add** (`8ab77ac`): mirrors the customer-tile
  polish across `AccountChannelTile` (contacts) and
  `OemQuickLinksTile` (links). Esc cancels, Enter saves, optimistic
  insert, Save vermilion only when dirty. `OemDocsTile` empty-state
  copy bumped to "OEM document scan lands in Phase 2 — check back
  after WorkVault ingest." +10 tests.
- **Sidebar polish** (`daf4ead`): per-org vermilion activity dot
  when latest note or agent thread message landed in the last 48
  hours, sourced from a new `useOrgLastTouched(type)` hook hitting
  `/api/organizations/last-touched?type=...`. Refetches every 60s.
  Active-route treatment tightened: 2px var(--accent) left border
  + var(--bg-2) background + `aria-current='page'`. Empty
  customer-list hint copy. +27 sidebar tests + 6 backend route tests.
- **AgentsPage Phase 1** (`453a584` then restored to its full shape
  by `910ec13`): the original 4-tab structure (Templates / Threads /
  Insights queue / Delegate) is preserved, with the Templates panel
  now hosting the new `AgentSectionEditor` (Customer/OEM sub-strip
  + variable reference panel + tools toggles + model picker + dirty-
  gated Save) and `AgentOverridesPanel` (per-org override list +
  inline expanding editor + Add/Delete flow). The redundant
  `TemplatesTab.tsx` is removed; H's components fully replace it.
  +25 page tests.
- **SettingsPage Phase 1** (`c540784` then restored by `f7e1e97`):
  five sections — Anthropic API key (masked / Edit / Save), the full
  `AuthModeSection` for Delegation Authentication (subscription-
  login status + API-key fallback in one component), default model,
  theme (Light/Dark/System wired through Zustand + document.document-
  Element + backend), and read-only paths. +8 page tests;
  `AuthModeSection` is stubbed in the page test (its full behaviour
  lives in `AuthModeSection.test.tsx`).
- **Backend agent config CRUD** (`fc22e84`): `POST /api/agents/configs`
  to create a per-org override (defaults inherited from the section
  archetype when fields are omitted) and `DELETE /api/agents/configs/:id`
  for override removal. The model layer's WHERE filter protects
  archetype rows (organization_id IS NULL) from deletion — they're
  the fallback default every org relies on. +6 route tests.

### Checkpoint `phase2-checkpoint-3` — 2026-04-26 night

**Subscription-login delegation lands.** The user's recurring concern was
the metered API price; this round wires up the **second auth path** the
Claude Agent SDK supports: OAuth credentials from `claude /login`. Usage
counts against the Claude.ai Pro/Max/Team allotment instead of pay-per-
token. Both paths are now available behind a UI toggle on the Delegate
tab; subscription is the default.

Backend 495 tests · frontend 282 tests · lint + typecheck clean both.

- **Agent SDK integration** (`53fbf5d` + this commit): added
  `@anthropic-ai/claude-agent-sdk@0.2.119` to backend deps (installed
  with `--legacy-peer-deps` for the zod 3 vs 4 peer-dep mismatch — the
  SDK ships its own zod runtime). New service
  `backend/src/services/subagentSdk.service.ts` with
  `delegateViaSubscription()`, returning the same `AgenticResult` shape
  as `delegateAgentic()` so the frontend can swap mutations
  transparently. Pre-flight check for `~/.claude/.credentials.json`
  short-circuits the subprocess spawn with a clean
  "Run `claude /login` first" message instead of surfacing the SDK's
  generic "process exited with code 1". New route
  `POST /api/subagent/delegate-sdk` plus `GET /api/subagent/auth-status`
  for the frontend's live status badge. Tool-name translation map
  (`read_file → Read`, `bash → Bash`, etc.) lives in the service so the
  same Console form drives both paths. +15 backend tests.
- **Delegate Console mode toggle + Settings revamp** (`5871148` cherry-
  picked from worktree): two-button Authentication toggle at the top of
  the Delegate form; choice persists via localStorage (default
  `subscription`). New `AuthModeSection.tsx` component shows
  side-by-side cards for both modes with a live status pill — green on
  authenticated, grey when `claude /login` is needed. The cards
  gracefully degrade when the auth-status endpoint isn't responding
  (treated as "unknown — try delegating to verify"). +22 frontend tests.
- **`docs/DELEGATION.md` rewrite**: now leads with the subscription
  flow as the recommended path and demotes the API-key path to
  fallback. Includes `claude /login` walkthrough, `curl` examples for
  both endpoints, and security notes covering OAuth credential read
  semantics (server reads `~/.claude/.credentials.json` directly; never
  proxies or stores them).

End-to-end smoke verified: both endpoints reach the SDK, auth-status
returns the right state, the missing-credentials path returns the clean
actionable message instead of subprocess exit codes.

### Checkpoint `phase2-checkpoint-2` — 2026-04-26 evening

User-facing milestone: **personal-subscription delegation works end-to-end.**
Set the key in Settings → Personal Claude Subscription, then use the new
Agents → Delegate tab (or `POST /api/subagent/delegate-agentic` directly)
to delegate coding tasks with file tools. See `docs/DELEGATION.md` for
the full login + delegation flow.

Backend 480 tests · frontend 260 tests · both lint + typecheck clean.

- **Agentic delegation loop** (`5692c15`): `subagent.service.ts` gets
  `delegateAgentic()` — multi-turn tool-use loop bounded at 50 iterations
  hard, default 25. Five tools shipped in `subagentTools.service.ts`:
  `read_file`, `list_files`, `write_file`, `edit_file`, and (opt-in)
  `bash`. Each file tool routes through a new `assertSafeRelPath` helper
  rather than reusing `lib/safePath.ts` (the existing helper is locked
  to a `.md/.txt/.pdf` extension allowlist for the per-org chat's
  `read_document` tool). New route `POST /api/subagent/delegate-agentic`.
  +39 backend tests (10 service + 30 tools-unit + 9 route-integration).
  Also captures the chat-usage instrumentation that was held in working
  tree from a parallel self-edit:
  - `recordUsageFromMessage()` helper in `claude.service.ts`
  - per-org chat (`messages.stream` final message), `generateReport`
    (scheduled report runs), and `extractOrgMentions` (ingest mention
    extraction) all now record to `anthropic_usage_events` so the tile
    shows real cross-source usage instead of just delegate-only.
- **Delegate Console UI** (`6d9520f`): new 4th tab in AgentsPage
  ("Delegate"). Form with task textarea, working-dir field, tool
  checkbox group (bash off by default), model select, advanced
  disclosure (max_iterations / max_tokens / system). Live cost meter
  pulling `useUsage('session'|'today')`. Transcript view renders the
  three entry kinds with collapsible tool-use input and truncatable
  tool results. +21 frontend tests (23 component + 11 hook minus the
  9 from the legacy `useSubagent.test.tsx` we replaced).
- **Round 9 audit punch list** (`850e839`): 7 fixes shipped, 2
  deferred. CommandPalette input now respects `:focus-visible`;
  TasksPage ChipGroup outline fixed; backdrop rgba values use the
  palette tokens; SettingsPage redundant `textWrap` declarations
  removed (global `h1, h2, h3 { text-wrap: balance }` rule covers
  them). Sidebar OEM icon fix, HomePage h1 textWrap, ReportsPage h2
  section header. Findings doc at `docs/REVIEW-ROUND9.md` is
  annotated with `(FIXED in <commit>)` / `(DEFERRED — <reason>)`.
- **DPAPI module-shape fix** (this commit): `@primno/dpapi` v1.1.x
  exposes `protectData`/`unprotectData` under a `Dpapi` object (also
  the default export), not as bare named exports. The previous
  destructure quietly produced `undefined` references and
  `decryptSync` blew up with "dpapi.unprotectData is not a function"
  the first time a route tried to read an encrypted setting. The
  loader now normalizes both the new `Dpapi`-object shape, the
  default-export shape, and the legacy bare-named-exports shape.
  Discovered during the smoke-test pass; without this the personal
  key couldn't actually be read at runtime.
- **`docs/DELEGATION.md`** (this commit): operator guide for the
  login + delegation flow. Covers Settings UI, `curl` examples for
  both endpoints, security notes, and known gaps for next round
  (streaming, per-call cost cap, per-error retry on the activity
  feed).

### Checkpoint `phase2-checkpoint-1` — 2026-04-26 PM

Clean state after a multi-agent integration push. Backend 394 tests · frontend
216 tests · both workspaces typecheck + lint clean. Three meaningful additions
since the morning batch that shipped the cron editor + command palette + tile
empty states:

- **AgentsPage test coverage** (`4b10693`): 42 new RTL tests across the four
  tab components (`TabStrip` 13, `TemplatesTab` 10, `InsightsTab` 11,
  `ThreadsTab` 8). The four components themselves were already in `5e4a952`;
  this round filled the coverage gap. Frontend tests 174 → 216. Two backend
  gaps surfaced for follow-up: `GET /api/agents/threads` requires `?org_id=`
  but `ThreadsTab.tsx` calls it without (runtime 400 in real use), and there's
  no aggregator endpoint for cross-org unconfirmed insights (the component
  fans out per-org queries — fine for ≤20 orgs but worth tracking).

- **`validate.ts` collision defused** (`f8c22b2`): the three
  `validate{Body,Query,Params}` middlewares all wrote to the same
  `req.validated` field. No shipped route chains two validators today, but
  the next one to do so would have silently clobbered the first result.
  Added dedicated `validatedBody` / `validatedQuery` / `validatedParams`
  fields; legacy `validated` still populated last-writer-wins so existing
  routes keep working unchanged. Cherry-picked from the parallel
  `claude/great-tesla-6c5416` branch (the only piece of that branch worth
  bringing forward; the rest was a parallel implementation of features
  this branch already covered better — see commit log for the comparison).

- **WorkVault Ingest UI + per-error retry** (`ac63997`): backend adds
  `POST /api/ingest/errors/:id/retry` (validates with `IngestErrorIdParamSchema`,
  calls `retrySingleError()` in `ingest.service.ts` which re-scans the
  specific file and deletes the error row on success, or marks it resolved if
  the file no longer exists). Frontend adds `frontend/src/types/ingest.ts`
  (hand-mirrored types), updates `useIngest.ts` with `useRetryIngestError`
  (optimistic error-row removal + revert-on-error), and three new components
  in `frontend/src/components/ingest/`: `IngestStatusPanel` (last scan time,
  error count, "Scan Now" CTA), `SourcePathConfig` (source list with
  middle-truncated paths and hover title), `IngestErrorList` (error rows with
  per-row Retry button, `role="status"` + `aria-live="polite"`). Ingest
  section wired into `SettingsPage.tsx` between Scheduler and Agent Overrides.
  Backend: 390 → 394 tests. Frontend: 154 → 174 tests. Both workspaces
  typecheck + lint clean.

Five-stream parallel-agent batch off the verified Phase 1 baseline. Backend
332 + frontend 43 = 375/375 tests green; both workspaces typecheck clean.

Verification on Windows + Node 24.15.0 from the consolidated `main`:

- `npm install` — 514 packages clean.
- `npm run typecheck` — both workspaces clean.
- `npm run lint` — both workspaces clean (`max-warnings 0`).
- `npm run test` — **385 backend + 43 frontend = 428/428 green.** Backend
  suite runs in ~9 s with the `:memory:` + savepoint pattern (R-018).
- `npm run dev` — backend `http://127.0.0.1:3001`, frontend `http://127.0.0.1:5173`.
  Live probes: `/api/health` ok, `/api/reports` returns the seeded Daily
  Task Review, `/api/ingest/status` returns an empty source state,
  `/api/oem/:id/documents/scan` returns clean 404 for missing orgs.

### Batch 1 — `acf1b99` `feat(phase2): batch 1` + `094068c` `fix(phase2): smoke-test catches`

Five Opus 4.7 agents in parallel.

- **Migration framework** (R-014): `_migrations` table + numbered SQL
  files; `runMigrations()` replaces `initSchema()`. Six migrations seeded:
  `001_initial.sql` (Phase 1 schema baseline, `IF NOT EXISTS` stripped),
  `002_indexes.sql` (R-015), `003_schema_harden.sql` (R-019:
  `note_mentions.source/confidence`, `contacts.updated_at`,
  `documents.updated_at`, cross-org task triggers), `004_audit.sql`
  (placeholder), `005_ingest.sql` (R-023 dual-source columns +
  `ingest_sources` + `ingest_errors`), `006_reports.sql` (`reports`,
  `report_schedules`, `report_runs` with `UNIQUE(schedule_id, fire_time)`).
- **Reports module** (Step 5): models (`reportRunModel.create` uses
  `INSERT OR IGNORE` so concurrent ticks for the same fire-time silently
  collapse), service (`runReport`, `seedDailyTaskReview`,
  `DAILY_TASK_REVIEW_TEMPLATE`), zod schemas, route (`/api/reports` +
  `run-now` + `runs` history). Output written to
  `<cwd>/reports/<report-id>/<run-id>.md` with sha256 + 200-char summary.
- **Scheduler** (Step 6, ADR-0004): `node-cron` + `cron-parser` in-process,
  `runMissedJobs()` catch-up at startup (clamps pre-epoch results to null),
  `startInProcessScheduler()`, `scheduler:tick` CLI for the Windows Task
  Scheduler hourly safety net. Per-iteration `try/catch` in
  `runMissedJobs()` contains failures so a fresh-DB / no-API-key boot
  doesn't escalate to a top-level startup warning.
- **Four new agent tools** (Step 7, R-021): `search_notes`,
  `list_documents`, `read_document` (via `resolveSafePath` + 1 MiB cap +
  `<untrusted_document>` envelope per R-026), `create_task` (service-layer
  cross-org guard backstops the DB trigger). All log to
  `agent_tool_audit`. `tools_enabled` filter in `agent_configs` honored
  per-section/per-org.
- **Reports frontend page** (Step 9): real implementation replacing the
  Phase 1 placeholder. List view with humanized cron + last/next run +
  status; modal create/edit form with multi-select target orgs and
  inline cron-shape validation; History drawer (Dialog) showing the last
  20 runs with relative timestamps + duration + output_path. TanStack
  Query hooks (`useReports`, `useReportRuns`, `useIngest`); Field Notes
  aesthetic preserved (vermilion only as transient signals per R-008).
- **Integration + verification fixes** (`094068c`): wired `index.ts` to
  mount `reportsRouter`, call `runMissedJobs()` +
  `startInProcessScheduler()` + `seedDailyTaskReview()` at startup. Fixed
  root `npm test` to cover both workspaces. Added explicit `cleanup()`
  in `frontend/src/test/setup.ts` (RTL auto-cleanup is gated on
  `globals: true`). Five real bugs caught during the install + verify
  loop: `req.params.id` typing, `vi.mock` factory hoist, cron-parser
  pre-epoch clamp, `mockReturnValueOnce` colliding with
  `buildSystemPrompt`, RTL cleanup registration.

### Batch 2 — `7782e11` `feat(phase2): batch 2`

Five Sonnet 4.6 agents in parallel.

- **Ingest pipeline** (Step 3): `scanWorkvault(opts)` walk → hash →
  reconcile loop. Five reconciliation cases tested: insert, update
  (mtime advanced), touch (sha256 unchanged), conflict (sha256 differs
  at unchanged mtime → `ingest_errors` row + sibling note with
  `conflict_of_note_id`), tombstone (file removed → `deleted_at` set).
  Frontmatter parser stamps a `file_id: <uuid>` into files that lack
  one — the one mutation the scanner is allowed to perform on
  WorkVault files. All file-system reads go through `resolveSafePath`.
- **Mention extraction** (Step 3c, R-021/R-026): Haiku 4.5 with
  `tools: []` and `<untrusted_document src="…">…</untrusted_document>`
  wrapping. Confidence ≥ 0.5 filter. Wired as a fire-and-forget hook
  on `POST /api/notes` for `role='user'` and `role='imported'`.
- **WorkVault writer** (Step 4, R-025): `writeNote(note)` with
  server-derived filename, safe-path containment, and collision refusal
  if the computed path is already owned by a different note. Tested
  with real tmp dirs + in-memory DB. Not yet wired into a route — will
  light up when the user is ready for live WorkVault round-tripping.
- **OEM docs scan endpoint** (Step 8): `GET /api/oem/:id/documents/scan`
  walks the OEM's configured OneDrive folder (shallow), classifies
  files+dirs, upserts new files into `documents` with
  `source='onedrive_scan'`. Manual rows are never overwritten via
  `INSERT … WHERE NOT EXISTS`.
- **Architecture and ops docs** (Steps 10 + 11): `docs/ARCHITECTURE.md`
  refreshed (§ Schema migration policy, § Scheduler architecture, new §
  Ingest pipeline, plus incidental staleness fixes). New
  `docs/ops/scheduler-install.md` — Windows Task Scheduler install
  one-pager with two `Register-ScheduledTask` blocks (Backend at logon
  + Scheduler Tick hourly), verification, uninstall, and four
  troubleshooting bullets.

Three real bugs caught during integration: frontmatter regex left a
leading `\n` on bodies separated from FM by a blank line (which
`stampFileId` writes); `ingest_errors ORDER BY occurred_at DESC` was
unstable for same-second inserts (added `id DESC` tiebreaker);
`oem-scan` happy-path test mocked `organizationModel.get` but the
`documents` FK to `organizations` is a real DB constraint, so the
upsert silently failed under the route's best-effort try/catch.

### Codex parallel session — `2359ee4` `chore(lint): add ESLint v9 flat config + lint cleanup`

A parallel OpenAI Codex CLI session contributed an ESLint v9 flat-config
setup (`backend/eslint.config.js`, `frontend/eslint.config.js`,
`typescript-eslint` + `eslint-plugin-react-hooks` deps, root
`npm run lint` script) plus a Phase 1 lint-fix sweep. Committed on main
ahead of the Phase 2 merge. The `AGENTS.md` they generated was factually
wrong (referenced a `Codex.service.ts` that doesn't exist, a fictional
`Codex-sonnet-4-6` model, the dropped `agent` org type) and was replaced
with a small redirect stub pointing to `CLAUDE.md`. `.claude/worktrees/`
added to `.gitignore`.

### Merge — `3650106` `merge: integrate Phase 2 (batches 1+2) with Codex lint cleanup`

Worktree branch `claude/laughing-ishizaka-8f06fa` merged into `main`.
Conflicts: `claude.service.ts`, `note.model.ts`, both `package.json`s
auto-merged cleanly at the line level; `package-lock.json` regenerated
via `npm install` to reflect the union of new deps (`node-cron`,
`cron-parser` from batch 1 + `typescript-eslint`,
`eslint-plugin-react-hooks` from Codex). Lint follow-through against
the new ESLint config: 38 issues across the new Phase 2 code resolved
via auto-fix + manual fixes. Notable: restored the
`as unknown as Anthropic.Tool` cast in `buildWebSearchTool` that Codex's
auto-cleanup removed prematurely — the SDK's `Anthropic.Tool` requires
`input_schema`, which the native `web_search_20250305` tool shape
doesn't provide.

## Phase 1 — Feature complete + audited + tested (2026-04-25)

All commits on branch `claude/great-tesla-6c5416` off `main`. Verification
(npm install + typecheck + test) was completed on Node 24.15.0 — see the
**Phase 1 — Verified ✓** entry near the bottom of this file (commit
`e3b73e6`, 278/278 tests green). The narrative below tracks the build
order; the verification entry tracks the bugs caught in the install + run
loop.

---

### Initial scaffold — `1ef677e`

`chore(init): scaffold at C:\mastercontrol with single-org schema`

- Single `organizations` table with `type` discriminator + `metadata JSON`.
- Backend bootstrap: Express + better-sqlite3 + zod + Anthropic SDK.
- Backend models: organization, contact, project, app, note, settings.
- `CLAUDE.md`, `docs/PRD.md`, `.gitignore` established.

---

### Planning artifacts + schema foundation — `1966794`

`chore(phase1): lock planning artifacts and schema foundation`

- `backend/src/db/schema.sql` rewritten to the single-org v0.4 data model:
  dropped legacy `customers` / `agents` / `oems` tables and the polymorphic
  `entity_type/entity_id` columns; dropped `org_apps`; dropped the `agent`
  org type (`type ∈ {customer, oem}` only).
- New tables: `documents`, `note_mentions`, `tasks`, `agent_configs`,
  `agent_threads`, `agent_messages`. New columns on `notes` for
  agent-authored content (`role`, `thread_id`, `source_path`, `file_mtime`).
- `docs/PRD.md` expanded to v0.4: per-org Claude agents, `record_insight`
  cross-org tool, WorkVault ingest plan, OneDrive doc listing, scheduled
  reports, Windows Service scheduler, 11 product decisions locked.
- Implementation plan written at
  `C:\Users\schmichr\.claude\plans\shiny-beaming-tower.md`.
- `docs/ARCHITECTURE.md` authored from scratch.
- `CLAUDE.md` reorganized as operational guide + glossary.

---

### Integrated review — `97aa654`

`docs(review): integrated multi-agent review of Phase 1 plan`

- `docs/REVIEW.md` authored: four independent reviews (Security, UI,
  Performance, Schema) synthesized into 29 action items (R-001 through
  R-029) across phases P0, P1, P1.5, P2.
- Top P0 blockers: loopback bind (R-001), `record_insight` allowlist +
  provenance + unconfirmed (R-002), DPAPI API-key encryption (R-003),
  `agent_configs` UNIQUE-on-NULL fix (R-004), drop `agent_messages`/`notes`
  mirror + add VIEW (R-005).

---

### P0 review punch-list + Q-1/2/4/5 decisions — `c5ca0e6` + `ec4d507`

`fix(p0): land review punch-list R-001/002/004/005/013 + R-003 prep`
`docs(p1): lock Q-1/Q-2/Q-4/Q-5 product decisions`

- **R-001** Backend binds `127.0.0.1` only.
- **R-002** `notes.provenance JSON` + `notes.confirmed INT DEFAULT 1`; partial
  index `idx_notes_unconfirmed`; `agent_insight` rows insert `confirmed=0`.
- **R-003** `settings.model.ts` rewritten with `SECRET_KEYS`, `get` (plaintext
  backend-only), `getMasked` (`***last4`), encrypt/decrypt stubs ready for
  DPAPI swap.
- **R-004** `agent_configs` UNIQUE constraint replaced with two partial unique
  indexes (SQLite NULL-distinct behaviour fix).
- **R-005** `notes_unified` VIEW added; mirror from `agent_messages` to `notes`
  dropped from plan.
- **R-013** Redacting error handler strips API key fields from logged objects.
- **Q-1** Vermilion budget locked: one zone at rest + enumerated transient
  signals. `docs/DESIGN.md` § Color rewritten; contrast token table added.
- **Q-2** Tile reorder locked: drag with keyboard parity via `@dnd-kit`.
  `docs/DESIGN.md` § Tile dashboard authored.
- **Q-4** Insights queue UX locked: inline accept/dismiss + Agents-page bulk
  tab. `docs/PRD.md` § Agents Page updated.
- **Q-5** `record_insight` allowlist scope locked: `{currentOrgId} ∪ orgs in
  latest message ∪ orgs in current org's note_mentions`.

---

### Round 1 — backend batch + frontend scaffold — `dec6507` + `ca413a4` + `1a84c9c`

`feat(backend): land Phase 1 backend in one batch (5 parallel agents)`
`feat(frontend): scaffold Vite + React + Tailwind + Router + TanStack Query workspace per DESIGN.md Field Notes direction`
`docs(mockup): bring v2 customer page into Q-1 / R-011 compliance`

**Backend** (`dec6507`):
- All 9 zod schemas in `backend/src/schemas/`.
- Backend models rewritten/created: organization, contact, project, document,
  note (with `createInsight`, `confirm`, `reject`), task, agentConfig
  (with fallback chain), agentThread, agentMessage, agentToolAudit.
- `claude.service.ts`: split prompt cache (R-016 stable/volatile blocks),
  `bumpOrgVersion`, allowlist resolution (R-002), tool audit logging (R-022).
- `lib/sse.ts`, `lib/safePath.ts` (R-024 stub).
- Vitest `:memory:` + savepoint rollback infra (R-018); organization + settings
  model tests.
- `agent_tool_audit` table appended to schema.

**Frontend scaffold** (`ca413a4`):
- Vite + React 18 + TypeScript + Tailwind + Router v6 + TanStack Query v5 +
  Zustand workspace.
- Loopback bind on Vite dev server (R-001 frontend).
- Self-hosted font `@font-face` declarations (R-017).
- Both palettes wired as CSS variables; dark default.
- Skip-link, reduced-motion override (R-011).
- `frontend/src/types/` hand-mirrored from backend zod schemas.
- Placeholder pages + routing shell.

**Mockup compliance** (`1a84c9c`):
- `mockups/customer-fairview-v2.html` updated per Q-1 vermilion budget and
  R-011/R-012 accessibility and tile layout corrections.

---

### Round 2 — routes, DPAPI, API hooks, tile dashboard — `620042b` + `f57bed6`

`feat(backend): Phase 1 routes, DPAPI, integration tests (round 2)`
`feat(frontend): Phase 1 API hooks + tile dashboard + Customer/OEM pages`

**Backend** (`620042b`):
- All Express routes: organizations (with nested helpers), contacts, projects,
  documents, notes (with `/confirm` + `/reject`), tasks, agents (configs,
  threads, messages, chat SSE, audit), settings.
- `lib/validate.ts` zod middleware.
- Full DPAPI integration via `@primno/dpapi`; non-Windows no-op fallback
  (R-003 complete).
- Supertest integration tests for every route group.
- CORS allowlist + Origin-check middleware (R-013 complete).

**Frontend** (`f57bed6`):
- TanStack Query hooks per resource: `useOrganizations`, `useContacts`,
  `useProjects`, `useDocuments`, `useNotes`, `useTasks`, `useAgentConfigs`,
  `useAgentThreads`, `useSettings`.
- `streamChat.ts`: `fetch` + `getReader()` + `TextDecoder` SSE consumer.
- `Tile`, `TileGrid` with `@dnd-kit/sortable`, `TileEditChrome` (drag-grip +
  resize + keyboard "Move tile" per R-009), `useTileLayout`.
- Customer page tiles: Chat, Priority Projects, Tasks, Recent Notes, Contacts,
  Reference, Documents.
- OEM page: tab strip + Account & Channel team, Quick Links, Chat tiles.
- Inline accept/dismiss bar on unconfirmed `agent_insight` notes (Q-4).

---

### Round 3 — Settings, Agents, Tasks, Home, ChatTile — `9177436` + `21d5e81` + `232d7db`

`feat(frontend): Settings, Agents (with insights queue), Tasks, Home`
`feat(frontend): useStreamChat hook + ChatTile wiring + vitest infra`
`fix(backend): contract gaps surfaced by parallel-agent integration tests`

**Settings, Agents, Tasks, Home** (`9177436`):
- `SettingsPage`: API key form (type=password, masked display after save),
  model picker, WorkVault/OneDrive path fields.
- `AgentsPage`: per-section template editor, tools toggle, per-org override
  list, Insights queue tab (cross-org bulk accept/reject).
- `TasksPage`: filter UI (status, due date, org), inline add.
- `HomePage`: today's open tasks, last 5 notes across orgs, recent insights.

**ChatTile + Vitest** (`21d5e81`):
- `useStreamChat` hook wrapping `streamChat.ts` with abort controller.
- `NotesChatTile` fully wired: streaming caret, Stop button, `[DONE]`
  handling, TanStack Query invalidation on message persist.
- Vitest frontend infra.

**Backend contract fixes** (`232d7db`):
- Route/model contract gaps found during parallel integration testing resolved.

---

### Round 3 polish + mockups — `21aaa5a` + `224770f`

`docs(mockup): forms / overlays / empty-state reference mockups`
`refactor(frontend): post-merge refinements from round 3 sonnet agents`

**Mockups** (`21aaa5a`):
- `mockups/forms.html` — button variants, spacing scale, form patterns (R-007).
- `mockups/overlays.html` — Modal, Toast, Popover, Command Palette specs
  (R-007).
- `mockups/empty-state.html` — per-tile empty state catalog + stream-failure
  pattern + loading skeleton (R-010).

**Frontend refinements** (`224770f`):
- Post-merge cleanup across Round 3 agent outputs: prop-type fixes, hook
  dependency arrays, minor layout corrections.

---

### Round 4 — audits, docs polish, Phase 2 plan, test coverage fill — `a4509ef` + `b078447` + `a7816ce` + `2778bed` + `8ebc978`

`docs: README, CHANGELOG rewrite with SHAs, ADRs 0001-0003, PRD updates`
`docs(audit): pre-ship backend code review`
`docs(audit): pre-ship frontend + a11y review`
`docs(plan): Phase 2 plan + Q-3 scheduler ADR (task scheduler only)`
`test: fill coverage gaps — 9 new test files + RTL infra`

- `README.md` (root) authored — cold-start orientation, prereqs, quick-start.
- `docs/CHANGELOG.md` rewritten with commit SHAs traceable to history.
- `docs/PRD.md § Open Questions`: Q-1/2/4/5 marked RESOLVED with date +
  one-liner; Q-3 added as RESOLVED via ADR-0004.
- ADRs 0001 (single-org table), 0002 (mtime-wins ingest), 0003 (no
  crud-router factory), 0004 (Task Scheduler over Windows Service).
- `docs/BACKEND-AUDIT.md`: 6 H/Critical findings (B-01..B-07 incl. blocker
  B-06 schema-import mismatch, B-07 missing model methods).
- `docs/FRONTEND-AUDIT.md`: 4× outline:none a11y blockers, fixture-stub
  gaps, useStreamChat abort race, optimistic-pending duplication.
- `docs/plans/phase-2.md` (~1150 lines): full Phase 2 plan covering the
  migration framework, schema additions, ingest pipeline reconciliation
  matrix, reports module, scheduler, tool hardening, frontend additions.
- 9 new test files closing every coverage gap surfaced; React Testing
  Library + jest-dom + user-event added to frontend devDeps.

### Round 5 — audit-fix batch — `8db441f`

`fix: address every Critical + High finding from BACKEND/FRONTEND audits`

- Backend: B-06 schema imports reconciled, B-07 missing model methods
  added (agentConfigModel listAll/updateById), B-01 double-JSON of
  provenance fixed, B-02 warmDpapi() now called at boot, B-03 notes
  feed reads notes_unified VIEW via new noteModel.listUnified, B-05
  agentThreadModel.create call sites converted to object form.
  OrgType union dropped 'agent'. bumpOrgVersion now fires after
  record_insight.
- Frontend: 4 outline:none overrides removed, fixture stubs replaced
  with real useOrganizations hooks, useStreamChat abort-signal race
  fixed (per-send AbortController capture), optimisticPending cleared
  on onDone.

---

## Phase 1 — Verified ✓ (2026-04-25)

`80f1b74` `chore(deps): bump better-sqlite3 to ^12.9.0 for Node 24 prebuild support`
`2addc30` `fix: typecheck-clean on Node 24 + better-sqlite3 12 (both workspaces)`
`2a6c0cd` `fix: real bugs surfaced by running npm test on Node 24 + better-sqlite3 12`
`f8cdbba` `fix(db): auto-init schema at module-load to dodge ESM import-order race`

Verification on Windows + Node 24.15.0 LTS (winget user-scope install):
- `npm install` — 509 packages installed clean (`better-sqlite3` 12.9 ships
  prebuilds for Node 24.x, no Python/MSVC compile needed).
- `npm run typecheck` — both workspaces clean, 0 errors.
- `npm run test` — **256 backend tests + 22 frontend tests = 278/278 green.**
  Backend suite runs in ~8s with the `:memory:` + savepoint pattern (R-018).
  Frontend suite uses jsdom + React Testing Library + jest-dom/vitest.
- `npm run dev` — backend listens on `http://127.0.0.1:3001` (R-001),
  Vite dev server on `http://127.0.0.1:5173`. Both bind loopback only.

Real bugs caught and fixed during verification (in `2a6c0cd`):
- ESM import-order race: model files' top-level `db.prepare('SELECT ...')`
  ran before `initSchema()` because static imports are hoisted. Fix
  landed twice — once for the test setup, once for production startup
  via auto-init in `database.ts` (`f8cdbba`).
- Node 24 + supertest changed `req.on('close')` semantics — fired when
  the request body was consumed (NOT on actual client disconnect),
  causing SSE writes to no-op mid-stream. Switched to
  `res.on('close')` gated by `!res.writableEnded` — the right signal
  for "client aborted before we ended."
- `sse.end()` bailed without calling `res.end()` when `closed` was
  already true, so the response body never finished and supertest
  hung forever. Fix: `end()` always finalizes (idempotent on
  `writableEnded`).
- `claude.service.streamChat` gated assistant-message persistence on
  a `streamCompleted` flag that the `Promise.race` against disconnect
  could short-circuit. Fix: persist if any content was actually
  produced — the user already saw the partial.
- `OrganizationUpdateSchema` accepted unknown fields silently; an
  invalid `type: 'foo'` payload reached the model and tripped the
  NOT NULL constraint as a 500 instead of a 400. Fix: `.strict()`.
- `useStreamChat` cleared `optimisticPending` entirely on `onDone`;
  in tests the assistant message vanished until persisted refetch
  caught up (which the mock never did). Fix: append the assembled
  assistant message to optimistic state on done, dedupe via
  `useEffect` when persisted catches up.

Phase 1 is **shippable**.

- [ ] `npm install` — both workspaces install clean
- [ ] `npm run typecheck` — both workspaces clean
- [ ] `npm run lint` — both workspaces clean
- [ ] `npm run test` — Vitest suite green
- [ ] `npm run dev` — backend :3001 + frontend :5173 both start
- [ ] Browser smoke: add customer → open page → all tiles render → chat
      streams → Settings API key save → Tasks add → OEM tab switch → theme
      toggle
