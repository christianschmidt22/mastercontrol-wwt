# Changelog

## [Unreleased]

### Planning (2026-04-25)
- PRD expanded to v0.4 with locked Phase 1 + Phase 2 scope: per-org Claude
  agents (per-section archetypes with per-org overrides), `record_insight`
  tool for cross-org agent memory, AI auto-tagged note mentions, WorkVault
  ingest plan, OneDrive doc listing for OEMs, scheduled reports, Windows
  Service scheduler with missed-run catch-up.
- 11 product decisions locked (see PRD § Decisions Locked).
- Implementation plan written at
  `C:\Users\schmichr\.claude\plans\shiny-beaming-tower.md` and approved.
- `docs/ARCHITECTURE.md` authored from scratch — covers process
  boundaries, layer rules, chat/note dataflow, knowledge-graph mechanism,
  streaming pattern, state-management split, type-sharing strategy, DB
  conventions, scheduler architecture.
- `CLAUDE.md` trimmed to ~110 lines and reorganized as operational guide
  + glossary + pointers, per official Anthropic memory best practices.

### Design (2026-04-25)
- `docs/DESIGN.md` authored — "Field Notes" aesthetic direction. Commits
  to Fraunces (display) + Switzer (body) + JetBrains Mono; warm-paper /
  ink-and-ivory palettes with a sparingly-used vermilion accent;
  hairlines instead of shadows; motion at high-impact moments only with
  mandatory `prefers-reduced-motion` honor. Folds in Anthropic's
  frontend-design skill (bold direction, distinctive type) and the
  Vercel web-interface-guidelines (a11y / focus / forms floor). Plan
  steps 9–12 and CLAUDE.md now point at it.

### Tooling (2026-04-25)
- Root `package.json` workspaces narrowed to `["backend"]` until
  `frontend/` actually exists; root scripts (`dev`, `build`, `typecheck`,
  `lint`, `test`) now `-w backend` only. The dual-workspace listing +
  `concurrently`-driven `dev` is restored in plan step 9 when the
  frontend scaffolds. Removes the broken state where `npm install` would
  warn and `npm run dev` failed looking for a non-existent workspace.
- Plan v0.4: added explicit "Test infrastructure + model tests" step
  (#3) and "Route integration tests" step (#7); updated "done" to
  require `npm run test` green; added Vitest + supertest devDeps to
  the planned backend manifest.

### Schema (2026-04-25)
- `backend/src/db/schema.sql` rewritten to the single-org design that the
  models already assumed: dropped legacy `customers` / `agents` / `oems`
  tables and the polymorphic `entity_type/entity_id` columns. Dropped
  `org_apps` (not requested). Dropped the `agent` org type entirely
  (`type ∈ {customer, oem}` only — "agent" now means AI agent).
- New tables: `documents`, `note_mentions`, `tasks`, `agent_configs`,
  `agent_threads`, `agent_messages`. New columns on `notes` for
  agent-authored content (`role`, `thread_id`, `source_path`,
  `file_mtime`, `ai_response`).

### Initial scaffold (earlier)
- Single `organizations` table with type discriminator + JSON metadata.
- Backend bootstrap: Express + better-sqlite3 + zod + Anthropic SDK.
- Backend models: organization, contact, project, app, note, settings.
- CLAUDE.md, PRD, .gitignore established.

> Note: backend route layer, claude.service.ts, and the entire frontend
> are still pending. The Phase 1 implementation plan is approved but
> paused at user request — iterative planning continues.
