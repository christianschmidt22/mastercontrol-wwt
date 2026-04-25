# MasterControl — Product Requirements Document

**Status**: Draft v0.4
**Last Updated**: 2026-04-25

## Overview
Personal CRM for an account executive at WWT. Centralizes customers, OEM
partners, their contacts, projects, notes, and tasks; exposes per-org
Claude-powered AI agents seeded with that org's data so the user can ask
questions, draft, and research without context-switching. Replaces the
user's current note workflow (Cowork). Runs locally at `C:\mastercontrol\`,
accessed via browser at `http://localhost:5173`.

## Users
Single user — the account executive. No auth, no multi-tenancy in any phase.

## Domain Terminology
- **Organization**: Generic term for any tracked entity. Type is one of
  `customer` or `oem`. There is **no** `agent` organization type — the word
  "agent" in this app refers exclusively to AI agents.
- **Customer**: An end-client org (hospital, manufacturer, retailer).
- **OEM**: Original equipment manufacturer / vendor partner (Cisco, NetApp,
  Dell, …).
- **Contact**: A person at a customer or OEM.
- **Project**: An engagement tied to one or more orgs.
- **Note**: Timestamped freeform entry tied to an org. May be human-authored
  or agent-authored (an "agent insight").
- **Task**: A follow-up item, optionally tied to an org and/or contact.
- **Agent**: An AI agent (currently a Claude conversation with a system
  prompt + tools). Per-section archetypes: customer agent, OEM agent.
- **Section**: One of `customer` or `oem` — used to pick which agent
  archetype runs on a given page.

## Information Architecture

### Sidebar Navigation (left rail)
Order, top to bottom:

1. **Home** — daily landing
2. **Tasks** — global task/follow-up list across orgs
3. **Reports** — scheduled and ad-hoc report runs (Phase 2)
4. **Customers** — section header; each customer (Fairview, CHR, …) is its
   own top-level entry directly below the header (flat list, not nested
   behind one "Customers" item)
5. **OEM** — single entry; the page itself tabs across each OEM
6. **Agents** — management surface for the AI agents themselves: edit
   per-section system prompt templates, toggle tools, view conversation
   history, browse agent-authored insights
7. **Settings**

### Customer Page (per-customer)
Tiled dashboard. Tiles default to a collapsed/preview state with detail
revealed by click — reference is occasional, density should be low at rest.

- **Profile tile** — name, address, company size, industry, website. Long-form
  metadata hidden behind expand toggles.
- **Contacts tile** — list of contacts at this customer (name, title, email,
  phone, role). Inline add/remove.
- **Projects tile** — high-level project tracking. Each row links to project
  documentation (OneDrive, wiki) and the in-app notes pane.
- **Documents tile** — pinned links to commonly referenced docs.
- **Notes / Chat tile** — chronological notes feed + a chat composer at the
  bottom. The chat is the per-customer agent. Messages and AI responses
  persist as notes (so the conversation is part of the record).

### OEM Page
Single sidebar entry. Page contains a tab strip across OEMs (Cisco, NetApp,
Dell, …). Each tab is its own dashboard:

- **Account & channel team tile** — contacts split by `role` (`account` vs
  `channel`).
- **Project documentation tile** — surfaces contents of the OneDrive folder
  dedicated to that OEM's project documentation. Read-only listing with
  click-through links. *(Phase 2)*
- **Quick links tile** — pinned URLs / paths to commonly referenced docs.
- **Chat tile** — per-OEM agent seeded with the OEM's metadata, contacts,
  and document inventory.

### Tasks Page
- List of tasks across all orgs.
- Filter by org, due-date, status (`open | done | snoozed`).
- Inline add: free-text + due date + optional org link.
- Tasks can be created manually or extracted by Claude from a note.

### Reports Page (Phase 2)
- List of report definitions: name, schedule (cron expression), last run,
  next run, status, link to most-recent output.
- Each row: edit (schedule, prompt, scope), run-now, view history.
- New report: name, prompt template, target orgs (all / selected), schedule
  expression, output destination.
- Report runs persist their output (markdown by default) and a summary.
- **First report shipped**: *Daily Task Review* — tasks due today, overdue,
  stale (>14d untouched), suggested follow-ups extracted from recent notes.

### Home Page
Today's open tasks, last 5 notes across all orgs, scheduled reports for
today (Phase 2), recent agent insights.

### Settings Page
- Anthropic API key (write-only; mask after save).
- Default model (`claude-sonnet-4-6` default; pickable: Opus 4.7, Sonnet
  4.6, Haiku 4.5).
- WorkVault root path (default
  `C:\Users\schmichr\OneDrive - WWT\Documents\redqueen\WorkVault`).
- OneDrive root path.
- Background scheduler controls (start/stop, view next-fire times).

### Agents Page
- Two cards: customer agent archetype, OEM agent archetype.
- Edit system-prompt template (textarea with `{{variable}}` placeholders).
- Tools toggle (web_search, record_insight, search_notes, list_documents,
  read_document, create_task).
- Per-org override list (which orgs have a custom prompt vs. inheriting the
  archetype).
- Recent thread list with token-usage and tool-call summary.
- Insights queue — every `agent_insight` note across all orgs in one list,
  newest first, with the source thread.

## Notes & AI

### Per-org agents
- Every customer and every OEM has an embedded Claude agent.
- Agents are **per-section archetypes** (`customer`, `oem`) with optional
  per-org overrides — same template hydrates with the right org's context.
- System prompt template is hydrated with: org profile, contacts, projects,
  last N notes, document inventory, a research playbook, and the section's
  domain framing.
- System prompt is sent with `cache_control: ephemeral`.
- Streaming via `POST /api/agents/:org_id/chat`, SSE-style. Client consumes
  via `fetch` + `ReadableStream` (POST body required, so EventSource won't
  work).
- Each (org, session) maintains a thread; every assistant message is
  mirrored as a note row so the notes feed and agent thread stay coherent.

### Agent tools
**Phase 1 (ships with chat from day one):**
- `web_search` — Anthropic-managed web search. Agents have web access.
- `record_insight(target_org_id, topic, content)` — agent persists what it
  learns as a new note (`role='agent_insight'`) on the target org. This is
  how cross-org learning works: a Fairview conversation that surfaces a
  Cisco fact records an insight on the Cisco org.

**Phase 2:**
- `search_notes(query, org_id?)` — full-text search over notes.
- `list_documents(org_id, kind?)` — list a customer's or OEM's documents.
- `read_document(path)` — fetch the contents of a stored / OneDrive doc.
- `create_task(title, due_date, org_id?, contact_id?)` — file a follow-up.

### Cross-org mention extraction (Phase 2)
- On every note save, an AI pass scans the content and **auto-tags** any
  mentions of other orgs into the `note_mentions` join table — no review
  queue, no `@mention` syntax required.
- The OEM page surfaces "notes from elsewhere mentioning this OEM" as a
  feed pulled via `note_mentions`. Customer pages do the same for OEMs and
  other customers.

### Notes ingestion (WorkVault migration, Phase 2)
- Source: `C:\Users\schmichr\OneDrive - WWT\Documents\redqueen\WorkVault`.
- Existing layout is **organized by note type** (not by org). User intends
  to restructure later; ingest cannot rely on folder convention to assign
  org links. Solution: AI extraction at ingest tags each note with its
  primary org plus any mentions, same way live note-save flow works.
- Files remain externally editable on OneDrive. MasterControl writes new
  notes as markdown files to OneDrive paths *and* indexes them in the DB;
  the file is the source of truth, the DB row is an index.
- **Conflict resolution**: file `mtime` wins. On open / focus, MasterControl
  re-reads files whose disk `mtime` is newer than the DB's last-known
  `mtime`. Single-user → simultaneous-edit conflicts are rare; this is the
  simplest correct rule.

## Reports (Phase 2)

### Scheduling
- Cron-style expression per report (e.g. `0 8 * * MON`).
- Runs recorded with start/end timestamps, status, output path, prompt/data
  inputs hashed.
- Outputs default to markdown at
  `C:\mastercontrol\reports\<report-id>\<run-id>.md` and indexed in DB.

### Scheduler design (Windows + suspend-prone laptop)
**Constraint:** laptop suspends when closed; in-process timers won't fire,
and the OS may not wake on schedule.

**Architecture:**
1. Backend runs as a **Windows Service** (installed via `node-windows` or
   `nssm`). Starts on user login, runs in background while OS is awake.
2. On every backend startup, scheduler calls `runMissedJobs()`:
   - For each schedule, compute the most recent fire-time before `now`;
     if `last_run` is earlier than that, fire it now. Idempotent per
     `run_id`.
3. While running, in-process `node-cron` fires jobs at their normal cron
   times.
4. A small Windows Task Scheduler entry (set up once via PowerShell) starts
   the service at logon and watchdog-restarts it if it dies.

**Guarantees:**
- Close laptop → wake → service starts → catch-up runs missed jobs.
- Job's fire-time passes while closed → next wake catches it up.
- No dependence on the OS waking the machine.

## Data Model

```
settings(key PK, value, updated_at)

organizations(id PK, type ∈ {customer, oem}, name, metadata JSON,
              created_at, updated_at)

contacts(id PK, organization_id FK CASCADE, name, title, email, phone,
         role, created_at)

projects(id PK, organization_id FK CASCADE, name, status, description,
         doc_url, notes_url, created_at, updated_at)

documents(id PK, organization_id FK CASCADE, kind ∈ {link, file}, label,
          url_or_path, source ∈ {manual, onedrive_scan}, created_at)

notes(id PK, organization_id FK CASCADE, content, ai_response NULL,
      source_path NULL, file_mtime NULL,
      role ∈ {user, assistant, agent_insight, imported},
      thread_id NULL, created_at)

note_mentions(note_id FK CASCADE, mentioned_org_id FK CASCADE,
              PRIMARY KEY(note_id, mentioned_org_id))

tasks(id PK, organization_id FK NULL CASCADE, contact_id FK NULL CASCADE,
      title, due_date NULL, status ∈ {open, done, snoozed},
      created_at, completed_at NULL)

agent_configs(id PK, section ∈ {customer, oem},
              organization_id FK NULL CASCADE,
              system_prompt_template, tools_enabled JSON,
              model, created_at, updated_at,
              UNIQUE(section, organization_id))

agent_threads(id PK, organization_id FK CASCADE, title NULL,
              started_at, last_message_at)

agent_messages(id PK, thread_id FK CASCADE,
               role ∈ {user, assistant, tool}, content,
               tool_calls JSON NULL, created_at)

-- Phase 2 only:
reports(id PK, name, prompt_template, target JSON, output_format,
        created_at, updated_at)
report_schedules(id PK, report_id FK, cron_expr, enabled,
                 next_run_at, last_run_at)
report_runs(id PK, schedule_id FK, started_at, finished_at, status,
            output_path, summary, error)
ingest_sources(id PK, root_path, kind ∈ {workvault, onedrive, oem_docs},
               last_scan_at)
```

`agent_configs` row with `organization_id IS NULL` is the section default;
non-null is a per-org override. The model's `get(section, org_id)`
performs the fallback chain.

## Out of Scope (Phase 1)
- Multi-user / authentication
- Mobile
- Email / Outlook integration *(potential Phase 3)*
- Editing OneDrive files in-app (read-only listing only)
- Voice input

## Phasing

**Phase 1 — Foundation** *(current implementation plan, paused at user
request after schema rewrite)*
- Schema rewrite ✓ done.
- Backend CRUD routes for orgs, contacts, projects, documents, notes,
  tasks. Settings route. Agent config + chat routes.
- `claude.service.ts` with streaming, prompt caching, `web_search` and
  `record_insight` tools.
- Frontend scaffold (Vite + React + TS + Tailwind + Router + TanStack
  Query + Zustand).
- Sidebar shell, all pages, all tiles, light + dark themes.
- Type-checks clean, lint passes.

**Phase 2 — Knowledge graph + ingestion**
- WorkVault note ingestion (markdown + frontmatter, AI-tagged primary
  org + mentions, mtime-wins sync).
- OneDrive directory listing for OEM Project Documentation tile.
- Cross-org mention auto-extraction on every note save.
- Reports CRUD + Daily Task Review report.
- Scheduler: in-process `node-cron` + `runMissedJobs()` startup catch-up
  + Windows Service install + Task Scheduler watchdog.
- Tools: `search_notes`, `list_documents`, `read_document`, `create_task`.

**Phase 3 — Polish**
- Email / Outlook integration.
- Notes export back to WorkVault for OneDrive backup.
- Visual design pass per the loaded design skills.

## Decisions Locked (planning session, 2026-04-25)

| # | Decision | Resolution |
|---|----------|------------|
| 1 | Sidebar "Agents" entry meaning | (b) AI-agent management page — prompts, tools, history. Drop `agent` org type. |
| 2 | WorkVault layout for ingest | Currently organized by note type, not by org. User will restructure. AI extraction tags primary org + mentions. |
| 3 | WorkVault writes after ingest | Files stay externally editable on OneDrive. MasterControl writes new notes there too. mtime wins on conflict. |
| 4 | Windows Service install | Yes. One-time admin install. Service starts on logon. |
| 5 | Project ↔ OEM links | Use `note_mentions` (knowledge graph) rather than a `project_orgs` join table. Cross-OEM info propagates via auto-tagged mentions. |
| 6 | Agent voice | Per-section archetypes (`customer`, `oem`) with per-org overrides via `agent_configs(section, org_id)`. |
| 7 | External research scope | Web access enabled — `web_search` ships in Phase 1. |
| 8 | Cross-org mention discovery | AI extracts on note save and auto-tags (no human review queue). |
| 9 | Agent learning persistence | Agent calls `record_insight` tool → new `notes` row with `role='agent_insight'` on the target org. |
| 10 | External-edit conflict resolution | File `mtime` wins. Re-read from disk if newer than DB-known mtime. |
| 11 | First scheduled report | *Daily Task Review* — drives Phase 2 reports schema + prompt design. |

## Open Questions (residual — non-blocking)

1. **Customer scaling in the sidebar** — flat list works at 5 customers;
   what's the rule at 30? Cap with overflow? Pin / unpin? Group into a
   collapsible sub-section?
2. **Project tile schema beyond name/status/description** — keep it minimal
   (doc_url, notes_url) or add value, close-date, OEMs-involved?
3. **OEM document root paths on OneDrive** — per-OEM folder location.
   Needed before Phase 2 directory walker can be built. Likely
   `OneDrive\WWT\OEMs\<oem-name>\` — confirm the convention.
4. **Theme default on first load** — light, dark, or `prefers-color-scheme`?
   Default plan: respect system setting.
5. **Empty Customers list UX** — when no customers exist yet, the Customers
   area shows a `+ Add customer` CTA inline. Confirm.
6. **Agents page editor UX** — textarea with `{{variable}}` placeholder
   reference card alongside, vs. a structured form. Default plan: textarea
   for v1.
7. **Type sharing between backend zod and frontend** — hand-mirror in
   `frontend/src/types/` (per CLAUDE.md spec) or expose backend types via a
   shared workspace. Default plan: hand-mirror — simpler tsconfig.
