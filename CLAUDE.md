# MasterControl — Claude Agent Guide

## Project Purpose
A personal CRM for an account executive at WWT. Tracks customers, agents, OEMs,
their contacts, the apps they run, projects in flight, and AI-assisted notes.
The app wraps the Claude API for in-context LLM assistance per organization.
Local-only single-user — runs in browser at localhost.

## Tech Stack
- **Frontend**: React 18 + TypeScript + Vite | Tailwind CSS | React Router v6
  | TanStack Query v5 (server state) | Zustand (UI state only)
- **Backend**: Node.js + Express + TypeScript, ESM, better-sqlite3, zod
- **AI**: Anthropic SDK (claude-sonnet-4-6) with prompt caching, streaming via
  `fetch()` + `ReadableStream` (NOT EventSource — POST body required)
- **Tooling**: ESLint + Prettier, Vitest, tsx watch

## Folder Structure
```
C:\mastercontrol\
├── CLAUDE.md
├── docs/                       # PRD, architecture, ADRs, CHANGELOG
├── database/                   # SQLite db files (gitignored)
├── frontend/src/
│   ├── components/             # layout/, organizations/, shared/
│   ├── pages/                  # route-level pages
│   ├── hooks/                  # useOrganizations, useNotes, etc.
│   ├── api/                    # TanStack Query hooks + fetch clients
│   ├── store/                  # Zustand UI slices ONLY
│   └── types/                  # shared TS interfaces (mirror backend zod)
└── backend/src/
    ├── routes/                 # Express handlers
    ├── models/                 # SQL via better-sqlite3 prepared statements
    ├── services/               # business logic (claude.service.ts)
    ├── middleware/             # error handler, validators
    ├── lib/                    # crud-router factory, sse helpers
    ├── schemas/                # zod schemas (validation + types)
    └── db/                     # schema.sql + db singleton
```

## Data Model — Single Organizations Table
- `organizations(id, type, name, metadata JSON, ...)` where `type` is
  `'customer' | 'agent' | 'oem'`. Type-specific fields (industry, region,
  partner_level, etc.) live in `metadata`.
- `contacts`, `projects`, `org_apps`, `notes` all FK to `organizations(id)`
  with `ON DELETE CASCADE`. No polymorphic FKs.
- The UI presents three sidebar sections by filtering on `type`.

## Domain Terminology
- **Organization**: Generic term for any tracked org (customer/agent/OEM).
- **Customer**: An end-client org (hospital, manufacturer, retailer).
- **Agent**: A reseller/agent partner.
- **OEM**: Original equipment manufacturer partner.
- **Contact**: A person at any organization.
- **Project**: An active engagement tied to an organization.
- **Note**: Timestamped freeform entry tied to an organization, may include AI response.

## Git Workflow
- Branch from `main`: `feature/<topic>`, `fix/<topic>`, `docs/<topic>`
- Small focused commits: `type(scope): short description`
- Never commit: `.env`, `database/*.db*`, `node_modules/`, build output
- PR descriptions explain the WHY, not just the what

## Development Commands
```bash
npm install                 # installs all workspaces
npm run dev                 # backend :3001 + frontend :5173
npm run typecheck           # both workspaces
npm run lint                # both workspaces
```

## Code Standards
- TypeScript strict, no `any`, no `ts-ignore` without comment explaining why
- All SQL lives in `backend/src/models/` via prepared statements — nowhere else
- All Anthropic SDK calls live in `backend/src/services/claude.service.ts`
- Every Express route validates body/params with a zod schema
- Components: one per file, named exports, under ~150 lines
- Server state: use TanStack Query hooks in `frontend/src/api/`, never put it in Zustand

## AI / Claude Integration Rules
- System prompt is cached (`cache_control: { type: 'ephemeral' }`) and includes
  the full org context (name, type, metadata, contacts, projects, recent notes)
- Streaming endpoint: `POST /api/notes/chat` returns `text/event-stream`,
  client uses `fetch()` + `response.body.getReader()` to consume
- Save the completed AI response to the note row after stream ends
- Never expose the API key to the frontend — backend reads it from `settings` table

## Security — Off Limits Without Discussion
- No multi-user auth in Phase 1
- Anthropic API key never leaves the backend
- DB file lives at `C:\mastercontrol\database\` — outside any cloud sync

## Documentation
- Update `docs/PRD.md` when product requirements change
- Add ADRs in `docs/adr/` for significant tech choices
- Update this file first when stack/structure changes

## What "Done" Means
Feature is done when: works in browser, types check clean, lint passes,
brief entry added to `docs/CHANGELOG.md`.
