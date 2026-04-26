# Changelog

## Phase 2 — Merged ✓ (2026-04-26)

Phase 2 ships in two five-stream parallel-agent batches off the verified
Phase 1 baseline, merged onto `main` as commit `3650106` together with the
ESLint v9 setup contributed by a parallel OpenAI Codex CLI session. 11 of
12 plan steps (`docs/plans/phase-2.md`) shipped; only Step 12 (manual
browser walkthrough) remains.

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
