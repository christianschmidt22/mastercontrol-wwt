# MasterControl — Claude Agent Guide

Personal CRM for a single account executive at WWT. Local-only, browser at
`http://localhost:5173`, SQLite, embedded per-org Claude agents.

Authoritative spec: [`docs/PRD.md`](docs/PRD.md). Cross-cutting design:
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Vault/file placement:
[`docs/VAULT.md`](docs/VAULT.md). Visual / UX direction:
[`docs/DESIGN.md`](docs/DESIGN.md). Schema source of truth:
[`backend/src/db/schema.sql`](backend/src/db/schema.sql).

## Tech Stack
- **Frontend**: React 18 + TS + Vite, Tailwind, React Router v6, TanStack
  Query v5 (server state), Zustand (UI state only).
- **Backend**: Node + Express + TS, ESM, better-sqlite3, zod.
- **AI**: Anthropic SDK, default `claude-sonnet-4-6`, prompt caching,
  streaming via `fetch()` + `ReadableStream` (NOT EventSource — POST body
  required).

## Folder Structure
```
mastercontrol/
├── CLAUDE.md
├── docs/                       # PRD, ARCHITECTURE, ADRs, CHANGELOG
├── database/                   # SQLite db (gitignored)
├── frontend/src/{components,pages,api,store,types}
└── backend/src/{routes,models,services,middleware,lib,schemas,db}
```

## Domain Glossary
- **Organization** — `type ∈ {customer, oem}`. Type-specific fields live
  in `metadata` JSON. **No `agent` org type** — "agent" in this app means
  AI agent only.
- **Customer** — end-client (hospital, manufacturer, retailer).
- **OEM** — vendor partner (Cisco, NetApp, Dell, …).
- **Contact** — person at an org. `role` distinguishes account vs. channel
  team for OEMs.
- **Project** — engagement tied to an org.
- **Note** — entry tied to an org. `role ∈ {user, assistant, agent_insight,
  imported}`. Assistant + insight notes are AI-authored.
- **Task** — follow-up, optional org/contact link.
- **Agent** — Claude conversation with system prompt + tools. Per-section
  archetypes (`customer`, `oem`) with optional per-org overrides via
  `agent_configs(section, organization_id NULLABLE)`.
- **Thread** — persisted (org, session) conversation.
- **Insight** — a note authored by an agent via `record_insight` tool.
  Cross-org learning persists this way.
- **Vault** — OneDrive-backed user file tree under
  `settings.mastercontrol_root`; see [`docs/VAULT.md`](docs/VAULT.md).

Full data model: [`schema.sql`](backend/src/db/schema.sql) and
[`PRD.md` § Data Model](docs/PRD.md#data-model). Information architecture
(sidebar, pages, tiles): [`PRD.md` § Information Architecture](docs/PRD.md#information-architecture).

## Layer Rules (no exceptions)
- All SQL lives in `backend/src/models/` via prepared statements.
- All Anthropic SDK calls live in `backend/src/services/claude.service.ts`.
- Every Express route validates body/params with a zod schema from
  `backend/src/schemas/`.
- Server state on the frontend lives in TanStack Query hooks under
  `frontend/src/api/`. Zustand is only for ephemeral UI (sidebar
  collapsed, theme).
- Components: one per file, named exports, under ~150 lines.

## AI Integration Rules
- Core AI auth is selected by `settings.claude_auth_mode`: `subscription`
  uses the local Claude Code OAuth session from `claude /login`; `auto`
  uses `anthropic_api_key` when present and otherwise uses Claude Code;
  `api_key` forces the metered SDK key path.
- System prompt is hydrated from `agent_configs` and sent split into two
  blocks (R-016): a **stable** block with `cache_control: ephemeral`
  (playbook + org name + type + metadata + contacts + projects) and a
  **volatile** trailing block (last N notes + recent insights) that is
  not cached so note saves don't bust the cache.
- Streaming endpoint: `POST /api/agents/:org_id/chat`,
  `text/event-stream`. Client uses `fetch()` + `response.body.getReader()`.
- After stream end, persist the assistant message to `agent_messages`
  only. The notes feed reads from the `notes_unified` VIEW (R-005) — no
  duplicate row in `notes`.
- Phase 1 tools: `web_search` (Anthropic native, capped per
  `agent_configs.tools_enabled`), `record_insight` (writes a note row
  with `role='agent_insight'`, `confirmed=0`). The `record_insight`
  tool input is `target_org_name: string`, resolved server-side
  against an allowlist = `{currentOrgId} ∪ orgs whose names appear in
  the latest user message ∪ orgs in the current org's `note_mentions`}`.
  Reject anything outside the allowlist. Unconfirmed insights only
  flow into their target org's own context; other agents ignore them.
- When system-prompt logic embeds web_search results or any future
  ingested content, wrap each chunk in
  `<untrusted_document src="…">…</untrusted_document>` and never
  enable write tools (`record_insight`) in the same call (R-021,
  R-026).
- Fallback Anthropic API keys are DPAPI-wrapped in `settings.value` for
  any key in `SECRET_KEYS`. Routes only ever return `getMasked(...)`.
  The plaintext getter is callable only from service-layer code. Claude
  Code OAuth tokens remain in `~/.claude/.credentials.json` and are never
  returned by routes.

## Code Standards
- TypeScript strict. No `any`. No `ts-ignore` without a comment explaining
  why.
- All frontend work follows [`docs/DESIGN.md`](docs/DESIGN.md) — "Field
  Notes" aesthetic, Fraunces + Switzer typography, warm-paper / ink-and-
  ivory palettes, vermilion accent used sparingly, hairlines not shadows.
- Audit every UI change against the
  [Vercel Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)
  — a11y labels, focus-visible, prefers-reduced-motion, form labels,
  truncation, semantic HTML.

## Git Workflow
- Branch from `main`: `feature/<topic>`, `fix/<topic>`, `docs/<topic>`.
- Commit format: `type(scope): short description`.
- Never commit `.env`, `database/*.db*`, `node_modules/`, build output, or
  any WorkVault or MasterControl vault content.
- PRs explain the WHY.

## Dev Commands
```bash
npm install                 # both workspaces
npm run dev                 # backend :3001 + frontend :5173
npm run typecheck           # both workspaces
npm run lint                # both workspaces
```

## Security — Off Limits Without Discussion
- No multi-user auth in any phase.
- Express and Vite bind `127.0.0.1` only. Never `0.0.0.0` (R-001).
- DB file lives at `C:\mastercontrol\database\` — outside any cloud sync.
- Backend CORS uses an explicit allowlist; no env override (R-013).
- Errors are logged through the redacting error handler in
  `backend/src/middleware/errorHandler.ts` — never `console.error(req.body)`
  or `console.error(err)` raw, especially around settings or Anthropic
  SDK calls (R-013).
- The user's note repo at
  `C:\Users\schmichr\OneDrive - WWT\Documents\redqueen\WorkVault` is
  read-only until Phase 2 ingestion lands. Don't touch it without
  explicit go-ahead.
- The OneDrive MasterControl vault is user data, not repo source. Do not
  commit it. When creating durable markdown/files for the user, follow
  [`docs/VAULT.md`](docs/VAULT.md) and index useful artifacts with
  `documents` rows.

## Doc Maintenance
- [`docs/PRD.md`](docs/PRD.md) — product changes.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — cross-cutting design.
- [`docs/DESIGN.md`](docs/DESIGN.md) — visual / UX direction; update when
  changing the aesthetic, palette, type, or motion language.
- [`docs/VAULT.md`](docs/VAULT.md) — placement contract for markdown,
  reports, research outputs, legacy WorkVault material, and agent exports.
- [`docs/HANDOFF.md`](docs/HANDOFF.md) — current branch handoff, validation
  status, and next TODOs for another agent.
- `docs/adr/<n>-<topic>.md` — significant tech choices.
- This file — stack, layer rules, glossary, dev commands.

## "Done" Means
Works in browser. `npm run typecheck` clean. `npm run lint` clean.
`npm run test` green — every model + route work item ships with tests in
the same commit (Vitest against a per-test temp SQLite file). Brief
entry added to [`docs/CHANGELOG.md`](docs/CHANGELOG.md).
