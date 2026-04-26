# MasterControl

Personal CRM for a single account executive at WWT. Tracks customers and OEM
partners, their contacts, projects, and notes; exposes an embedded Claude agent
per org so you can ask questions, draft follow-ups, and do research without
leaving the record. Runs entirely on your local machine — no cloud sync, no
auth, no SaaS dependency — at `http://localhost:5173`.

**Status**: Phase 1 verified ✓ on Node 24.15 (278/278 tests green, 2026-04-25,
commit `e3b73e6`). Phase 2 in progress on this branch — migration framework,
reports module, scheduler, four new agent tools (`search_notes`,
`list_documents`, `read_document`, `create_task`), and the Reports page.

---

## Quick start

**Prerequisites**

- Node 18.18 or later
- An Anthropic API key (for the per-org Claude agents)
- Windows recommended — Phase 2 ingest assumes OneDrive paths on Windows.
  The DPAPI secret-wrapping for the API key uses `@primno/dpapi`; on
  non-Windows the library is a no-op (plaintext fallback).

**Steps**

```bash
# 1. Install both workspaces from the repo root
npm install

# 2. Start backend (:3001) + frontend (:5173)
npm run dev

# 3. Open the browser
#    http://localhost:5173

# 4. Open Settings (sidebar bottom) → paste your Anthropic API key → Save.
#    The key is stored DPAPI-encrypted in the local SQLite DB; the GET
#    response only returns the last 4 characters masked.
```

---

## Repo layout

```
mastercontrol/
├── README.md
├── CLAUDE.md               # guide for AI agents working in this repo
├── package.json            # root workspace manifest (backend + frontend)
├── docs/
│   ├── PRD.md              # product requirements — what it does and why
│   ├── ARCHITECTURE.md     # cross-cutting design — how it fits together
│   ├── DESIGN.md           # visual/UX direction — Field Notes aesthetic
│   ├── REVIEW.md           # Phase 1 review log + 29-item action list
│   ├── CHANGELOG.md        # what shipped when
│   └── adr/                # architecture decision records
├── backend/
│   └── src/
│       ├── db/             # schema.sql + SQLite singleton
│       ├── models/         # prepared SQL statements — all SQL lives here
│       ├── routes/         # Express handlers
│       ├── schemas/        # zod request/response shapes
│       ├── services/       # claude.service.ts (all Anthropic calls here)
│       ├── middleware/     # error handler, validators
│       └── lib/            # sse helper, safePath
├── frontend/
│   └── src/
│       ├── api/            # TanStack Query hooks + streamChat
│       ├── components/     # layout/, tiles/, chat/, overlays/
│       ├── pages/          # route-level pages
│       ├── store/          # Zustand — UI state only
│       └── types/          # TS interfaces hand-mirrored from backend zod
├── mockups/                # static HTML visual references
│   ├── customer-fairview-v2.html
│   ├── forms.html
│   ├── overlays.html
│   └── empty-state.html
└── database/               # SQLite db files — gitignored, never cloud-synced
```

---

## Docs index

| Doc | Purpose |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | Product spec: user stories, IA, data model, phasing |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Layer rules, data flows, streaming, caching, DB conventions |
| [`docs/DESIGN.md`](docs/DESIGN.md) | "Field Notes" aesthetic, palettes, typography, motion, a11y |
| [`docs/REVIEW.md`](docs/REVIEW.md) | Phase 1 multi-agent review; 29 action items with acceptance criteria |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | Dated record of what shipped in each commit batch |
| [`CLAUDE.md`](CLAUDE.md) | Operational guide for AI agents: layer rules, glossary, commands |
| [`mockups/`](mockups/) | Static HTML visual references for the UI |

---

## Working with this codebase via Claude

[`CLAUDE.md`](CLAUDE.md) is the canonical guide. It covers the layer rules
(SQL only in models, Anthropic calls only in `claude.service.ts`, zod
validation on every route), the domain glossary, AI integration rules, and
the security boundaries.

Phase 1 was built using a worktree-isolation pattern: each parallel agent ran
in its own `git worktree` under `.claude/worktrees/`, branching off
`main`, then the outputs were merged back. The pattern kept agents from
stomping each other's files while enabling 5-way parallelism per round.

---

## Phase boundaries

**Phase 1 — Foundation** (this branch)
Everything in `backend/` and `frontend/` under the current scope: CRUD
routes for orgs, contacts, projects, documents, notes, tasks; per-org Claude
agents with `web_search` + `record_insight` tools; streaming chat; tile
dashboard with drag-reorder + keyboard parity; light + dark themes.

**Phase 2 — Knowledge graph + ingestion** (sketched in PRD)
WorkVault note ingestion, OneDrive directory listing, cross-org auto-mention
extraction, scheduled reports (Daily Task Review), Windows Service with
missed-run catch-up. Requires the migration framework (R-014) to land before
any schema changes touch user data.

**Phase 3 — Polish** (sketched in PRD)
Email/Outlook integration, notes export back to WorkVault, design pass.

---

## Dev commands

```bash
npm install           # both workspaces
npm run dev           # backend :3001 + frontend :5173
npm run typecheck     # both workspaces
npm run lint          # both workspaces
npm run test          # Vitest — backend model + route tests
```

---

## License / contributing

Single-user personal tool, not accepting outside contributions. Source is
here for transparency and to make it portable to another machine.
