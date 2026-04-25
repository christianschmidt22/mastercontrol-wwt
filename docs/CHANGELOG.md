# Changelog

## Phase 1 — Feature complete (2026-04-25)

All commits on branch `claude/great-tesla-6c5416` off `main`.

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

## Phase 1 — Verified (TODO)

- [ ] `npm install` — both workspaces install clean
- [ ] `npm run typecheck` — both workspaces clean
- [ ] `npm run lint` — both workspaces clean
- [ ] `npm run test` — Vitest suite green
- [ ] `npm run dev` — backend :3001 + frontend :5173 both start
- [ ] Browser smoke: add customer → open page → all tiles render → chat
      streams → Settings API key save → Tasks add → OEM tab switch → theme
      toggle
