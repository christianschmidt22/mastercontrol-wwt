# Changelog

## Phase 2 — In progress on branch `claude/laughing-ishizaka-8f06fa` (2026-04-25)

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

- **Migration framework** (R-014): `_migrations` table + numbered SQL files;
  `runMigrations()` replaces `initSchema()`. Six migrations seeded:
  `001_initial.sql` (Phase 1 schema baseline), `002_indexes.sql` (R-015),
  `003_schema_harden.sql` (R-019: `note_mentions.source/confidence`,
  `contacts.updated_at`, `documents.updated_at`, cross-org task triggers),
  `004_audit.sql` (placeholder), `005_ingest.sql` (R-023 dual-source columns
  + `ingest_sources` + `ingest_errors`), `006_reports.sql` (`reports`,
  `report_schedules`, `report_runs` with `UNIQUE(schedule_id, fire_time)`).
- **Reports module** (Step 5): models, service (`runReport`,
  `seedDailyTaskReview`, `DAILY_TASK_REVIEW_TEMPLATE`), zod schemas, route
  (`/api/reports` + `run-now` + `runs` history). Output written to
  `<cwd>/reports/<report-id>/<run-id>.md` with sha256 + 200-char summary.
- **Scheduler** (Step 6, ADR-0004): `node-cron` + `cron-parser` in-process,
  `runMissedJobs()` catch-up at startup (clamps pre-epoch results to null),
  `startInProcessScheduler()`, `scheduler:tick` CLI for the future Windows
  Task Scheduler hourly safety net.
- **Four new agent tools** (Step 7, R-021): `search_notes`,
  `list_documents`, `read_document` (via `resolveSafePath` + 1 MiB cap +
  `<untrusted_document>` envelope per R-026), `create_task` (service-layer
  cross-org guard backstops the DB trigger). All log to `agent_tool_audit`.
  `tools_enabled` filter in `agent_configs` honored per-section/per-org.
- **Reports frontend page** (Step 9): real implementation replacing the
  Phase 1 placeholder. List view with humanized cron + last/next run +
  status; modal create/edit form with multi-select target orgs and inline
  cron-shape validation; History drawer (Dialog) showing the last 20 runs
  with relative timestamps + duration + output_path. TanStack Query hooks
  (`useReports`, `useReportRuns`, `useIngest`); Field Notes aesthetic
  preserved (vermilion only as transient signals per R-008).
- **Integration + verification fixes**: wired `index.ts` to mount
  `reportsRouter`, call `runMissedJobs()` + `startInProcessScheduler()` +
  `seedDailyTaskReview()` at startup. Fixed root `npm test` to cover both
  workspaces. Added explicit `cleanup()` in `frontend/src/test/setup.ts`
  (RTL auto-cleanup is gated on `globals: true`).

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
