# MasterControl — Architecture

**Status**: Living document. Source of truth for cross-cutting design.
**Companion docs**: [`PRD.md`](PRD.md) for product spec,
[`CHANGELOG.md`](CHANGELOG.md) for shipped work,
[`adr/`](adr/) for individual technical decisions.

## High-level shape

```
┌─────────────────────────────────────┐
│  Browser (localhost:5173)           │
│  Vite dev server / Vite static prod │
│                                     │
│  React 18 + TS + Tailwind           │
│  ├─ Router v6                       │
│  ├─ TanStack Query v5 (server)      │
│  └─ Zustand (UI state only)         │
└────────────────┬────────────────────┘
                 │ /api/* → proxied
                 ▼
┌─────────────────────────────────────┐
│  Backend (localhost:3001)           │
│  Express + TS, ESM, tsx watch       │
│                                     │
│  routes → schemas → models → db     │
│  services/claude.service.ts ──┐     │
│  lib/crud-router, lib/sse     │     │
└────────────────┬──────────────┼─────┘
                 │              │
                 ▼              ▼
        better-sqlite3   Anthropic SDK
        (mastercontrol.db)  (claude-sonnet-4-6)
                                │
                          web_search tool
                          (Anthropic-managed)
```

Single process per tier. No Docker, no microservices. Phase 2 adds
in-process `node-cron` scheduling and a `runMissedJobs()` catch-up call
on every startup so jobs fired during laptop suspend are not dropped.

## Process boundaries
- **One backend process** owns all SQLite access. Better-sqlite3 is
  synchronous and process-local; do not point a second process at the
  same db file while the backend is running.
- **One frontend dev server** in development. In Phase 2 production-ish
  use, the Vite-built static bundle is served by Express on the same
  port — but Phase 1 dev has them split (5173 + 3001).
- The frontend never talks to Anthropic directly. The API key lives in
  the `settings` table, read by the backend when constructing the
  Anthropic client.

## Layer responsibilities

| Layer | Owns | Forbidden |
|---|---|---|
| `routes/*` | HTTP shape, zod validation, response codes | Direct SQL, direct Anthropic calls |
| `schemas/*` | zod request/response shapes + inferred TS types | Side effects |
| `models/*` | Prepared SQL statements, row hydration | HTTP concerns, business logic, Anthropic calls |
| `services/*` | Business logic, orchestration, Anthropic calls | Direct SQL (call models), Express types |
| `lib/*` | Cross-cutting helpers (crud-router, sse, error formatter) | Domain knowledge |
| `db/*` | Connection, schema bootstrap, migrations | Domain logic |

If you find yourself wanting a model to call a service, a route to query
the db directly, or a service to write to `res`, stop and route through
the right layer instead.

## Data flow — chat message (Phase 1)

```
ChatComposer (frontend)
  ▼ POST /api/agents/:org_id/chat
agents.route → validate body via chat.schema
  ▼
claude.service.streamChat()
  ├─ load agent_configs by section + org_id (with fallback)
  ├─ build system prompt (org context hydrated, cache_control:ephemeral)
  ├─ load thread history from agent_messages
  ├─ persist user message → agent_messages
  ├─ open Anthropic stream with tools: [web_search, record_insight]
  ├─ stream tokens → res as SSE `data: {delta}` events
  │     • on tool_use(record_insight): allowlist check → noteModel.createInsight (role='agent_insight', confirmed=0) + audit row
  │     • on tool_use(web_search): SDK handles, results stream back; audit row written
  ├─ on completion: persist assistant message → agent_messages ONLY (R-005: no mirror to notes)
  └─ send `data: {type:'done'}`, then `data: [DONE]`, end response
  ▼
Client reader appends deltas to a transient assistant bubble until [DONE].
Notes feed reads from notes_unified VIEW (UNION ALL of notes + agent_messages assistant rows).
TanStack Query invalidation refreshes the notes list.
```

## Prompt cache (R-016)

`claude.service.ts` splits the system prompt into two blocks to maximise
Anthropic prompt-cache hit rates on multi-turn conversations.

### Block A — stable (cached)

Contains: tool-safety rules + section playbook + org name/type/metadata +
contacts + projects + documents inventory.

Sent with `cache_control: { type: 'ephemeral' }`. Anthropic caches this
block across turns so subsequent messages in the same thread pay only the
volatile-block token cost for input processing.

Rebuilt when: org data changes (see `bumpOrgVersion` below) or after 1 hour.

### Block B — volatile (not cached)

Contains: the last 20 confirmed notes + agent insights for the current org.

Not given `cache_control`. This block changes on every turn (new notes,
new insights) so caching it would serve stale context and waste the cache
slot.

### Per-thread cache map

```ts
// In-process singleton in claude.service.ts:
const threadCache = new Map<threadId, {
  stable: string;   // the rendered stable block text
  version: number;  // orgVersions value at build time
  builtAt: number;  // Date.now() at build time
}>();
// TTL: 1 hour (3_600_000 ms)
```

The map is keyed on `threadId` rather than `orgId` so that two concurrent
threads on the same org each hold their own cached stable block. This keeps
the cache coherent under concurrent usage without locking.

### `bumpOrgVersion(orgId)` invalidation hook

Model writes that change org-level data (contacts, projects, documents,
org metadata) call `bumpOrgVersion(orgId)` after committing. This
increments an in-process `Map<orgId, number>` counter. On the next
`streamChat` call for any thread of that org, `cached.version !== currentVersion`
evaluates true and the stable block is rebuilt.

```
noteModel.createInsight()  ─┐
contactModel.create/update  ├─ call bumpOrgVersion(orgId)
projectModel.create/update  │
organizationModel.update   ─┘
    │
    ▼
threadCache entries for that org are treated as stale on next streamChat
```

**Expected cache-hit rate**: >60 % on repeat turns of the same thread with
stable org data (vs. <20 % when the entire prompt is sent uncached each turn).

## Data flow — note save (Phase 2)

```
User types in NotesChatTile composer → "Save note"
  ▼ POST /api/notes  { organization_id, content }
notes.route → noteModel.create
  ▼ (in same transaction)
extractMentions service:
  ├─ Anthropic call with light prompt: "list other org names mentioned"
  ├─ resolve to organization_id via name match (case-insensitive)
  └─ insert into note_mentions(note_id, mentioned_org_id)
  ▼
Phase 2: also write the note to disk under the scoped MasterControl vault
`_notes` folder, record `source_path` and `file_mtime` in the row.
```

## Knowledge graph — how cross-org context surfaces

Three mechanisms:

1. **Agent insights**: The `record_insight` tool writes a note (with
   `role='agent_insight'`) on the *target* org. So a Fairview chat that
   surfaces a Cisco fact creates a Cisco note. That note shows up the
   next time the Cisco agent loads context.

2. **Note mentions** *(Phase 2)*: Every saved note is scanned for
   references to other orgs and the links populate `note_mentions`. The
   OEM page shows a "mentioned in" feed pulling from this table; the
   customer page does the same.

3. **Per-section agents with org override**: `agent_configs` keyed by
   `(section, organization_id NULL)`. A row with `org_id IS NULL` is the
   archetype; a row with `org_id` set overrides for that org. The model
   layer's lookup chain is `(section, org_id) → (section, NULL)`.

Together these mean: knowledge accrues per-org, agents have per-section
flavor, and the user reads any cross-references from the org's own page
without needing to remember where a fact came from.

## Streaming — why fetch+ReadableStream, not EventSource

The chat endpoint is `POST` with a JSON body (org_id, thread_id, content).
EventSource only does GET, no body. Building it as POST lets us send
arbitrary thread state without query-string serialization or a separate
"start session" round trip.

Client pattern (Phase 1, `frontend/src/api/streamChat.ts`):

```ts
const res = await fetch(`/api/agents/${orgId}/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ thread_id, content }),
  signal,
});
const reader = res.body!.getReader();
const decoder = new TextDecoder();
let buf = '';
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += decoder.decode(value, { stream: true });
  for (const line of buf.split('\n\n')) {
    if (!line.startsWith('data: ')) continue;
    const payload = line.slice(6);
    if (payload === '[DONE]') return onDone();
    onToken(JSON.parse(payload));
  }
}
```

The `signal` argument supports user-cancel via the same composer's stop
button (per Vercel guideline: animations / streams must be interruptible).

## Settings & secrets

The Anthropic API key is stored in the `settings` table under the key
`anthropic_api_key`. The backend reads it lazily — every Anthropic
request reconstructs the client from the current value, so the user can
rotate keys without restarting. The key is never sent to the frontend;
the Settings page submits the new value via `PUT /api/settings` and the
GET response masks it as `***...last4`.

Non-secret path settings are stored in the same table:

| Key | Purpose |
|---|---|
| `mastercontrol_root` | Root for day-to-day customer/OEM/project files. Defaults in code to `C:\Users\schmichr\OneDrive - WWT\Documents\mastercontrol` when unset. |
| `workvault_root` | Source root for WorkVault note ingestion. |
| `onedrive_root` | Root used to resolve OneDrive-relative OEM document folders. |

## MasterControl file space

The file-space helper
([`fileSpace.service.ts`](../backend/src/services/fileSpace.service.ts))
turns org/project records into deterministic OneDrive-backed paths without
adding a second source of truth to the schema. The complete placement
contract is [`VAULT.md`](VAULT.md).

- Customers map to `<mastercontrol_root>\customers\<folder>`.
- OEMs map to `<mastercontrol_root>\oems\<folder>`.
- Existing short folders are preferred when they match the org name or
  acronym (`fairview` for Fairview Health Services, `chr` for C.H. Robinson).
- Otherwise folder names are slugified from the org or project name.
- Creating a project through `/api/projects` fills `doc_url` with the
  project folder path when the caller did not provide a link. Project folders
  live under `projects\<project_slug>` inside the scoped customer/OEM folder.
- Customer/OEM note markdown lives in scoped `_notes` folders; the DB indexes
  those files. Tasks, contacts, agent thread state, and report scheduling
  metadata remain DB canonical.
- Agent memory is not a top-level `_claude` folder. Canonical state is in
  `agent_threads`, `agent_messages`, `notes`, and `agent_tool_audit`; durable
  markdown exports live in scoped `_agent` folders.
- If `mastercontrol_root` is explicitly configured, project creation also
  creates the directory. If the setting is unset, the app computes the
  default path but does not write outside the repo until the user saves the
  root in Settings.

## State management split

| State | Lives in | Why |
|---|---|---|
| Server data (orgs, contacts, notes, tasks, etc.) | TanStack Query | Cache + invalidation + optimistic updates handled for free |
| Streaming chat token buffer | local `useState` in `NotesChatTile` | Ephemeral, throws away on unmount |
| Sidebar collapsed, theme | Zustand `useUiStore` | Cross-component UI state, no server roundtrip |
| Form draft state | `react-hook-form` (or `useState` for trivial forms) | Per-form, no global concern |
| Active thread id per org | URL query param (`?thread=42`) | Per Vercel guideline: URL reflects state — deep-linkable, back-button works |

Zustand is **only** for ephemeral UI. Anything that maps to a server row
lives in TanStack Query.

## Type sharing strategy

Backend zod schemas in `backend/src/schemas/*.ts` export inferred types
via `z.infer<typeof Schema>`. Frontend hand-mirrors these in
`frontend/src/types/*.ts` (per CLAUDE.md spec). The mirror is a small
amount of friction in exchange for not introducing a shared workspace
package + tsconfig path mapping.

When backend schemas change, the frontend mirror MUST be updated in the
same commit. CI typecheck catches drift if frontend code imports
properties that no longer exist; if frontend doesn't use a field, drift
hides until first use — accept that risk for v1.

## Database conventions

- `created_at`, `updated_at`: `DATETIME DEFAULT CURRENT_TIMESTAMP`. Models
  set `updated_at = datetime('now')` explicitly on update.
- All cross-table FKs are `ON DELETE CASCADE`. Deleting a customer
  removes everything below it: contacts, projects, documents, notes,
  threads, messages, tasks, mentions.
- All metadata columns that need structure (`metadata`, `tool_calls`,
  `tools_enabled`, `target` on reports) are stored as `TEXT` containing
  JSON. Models JSON.parse on read, JSON.stringify on write — never
  expose the raw column to higher layers.
- Indexes are deliberately minimal in Phase 1 (org_id, status, due_date,
  thread+created). Add when query patterns prove they're needed.

## Schema migration policy

Phase 2 replaced the Phase 1 `CREATE IF NOT EXISTS` bootstrap with a
versioned migration runner (R-014). The design is hand-rolled with no
third-party migration library.

**How it works**: [`runMigrations()`](../backend/src/db/database.ts)
runs synchronously at process start (before the HTTP server binds) and
at the top of the `scheduler:tick` CLI.

1. It creates `_migrations(id, name, applied_at)` with `CREATE TABLE IF
   NOT EXISTS` — this single table is the bootstrap anchor and is the
   only place `IF NOT EXISTS` is still used.
2. It reads all `*.sql` files in
   [`backend/src/db/migrations/`](../backend/src/db/migrations/) sorted
   lexicographically (files are named `NNN_description.sql`).
3. For each file it extracts the numeric prefix as the migration `id`.
   If that `id` already exists in `_migrations`, the file is skipped.
   Otherwise the SQL runs in a transaction and a row is inserted into
   `_migrations`.

`backend/src/db/schema.sql` is now a documentation snapshot only; the
authoritative schema is assembled by running the numbered migrations in
order.

**Test path**: tests share the same `runMigrations()` function via a
`:memory:` SQLite setup. There is no separate test-bootstrap path — the
in-memory DB goes through the identical migration sequence the production
DB does, so schema drift between environments is impossible.

## Scheduler architecture (Phase 2)

The user's laptop is suspended whenever it's closed. Scheduled jobs that
fire-and-forget would silently drop. The solution is Task Scheduler only —
no Windows Service, no `node-windows`, no `nssm` (see
[ADR-0004](adr/0004-task-scheduler-not-windows-service.md)). The approach
has three parts:

1. **Catch-up at startup**: [`runMissedJobs()`](../backend/src/services/scheduler.service.ts)
   runs before the HTTP server binds. For each enabled `report_schedules`
   row it computes the most-recent fire-time prior to `now`. If
   `last_run_at` is earlier than that fire-time, the job runs immediately
   and `last_run_at` is updated. Idempotency is enforced by
   `UNIQUE(schedule_id, fire_time)` in `report_runs` — a second call for
   the same fire-time is a silent no-op. Each schedule iteration is
   wrapped in its own try/catch so a failure on one job (e.g., a fresh DB
   with no Anthropic key configured) does not escalate to a top-level boot
   error.

2. **Live in-process scheduler**: `node-cron` registers one tick per
   enabled schedule while the process is awake. Standard cron pattern;
   each tick calls `runReport(scheduleId, fireTime)`.

3. **Windows Task Scheduler safety net**: two entries are registered once
   via a PowerShell script (`docs/ops/scheduler-install.md`):
   - `MasterControl Backend` — trigger: *At logon*. Starts the Express
     backend.
   - `MasterControl Scheduler Tick` — trigger: *Repeat every 1 hour*.
     Runs `npm run --prefix C:\mastercontrol\backend scheduler:tick`,
     which imports the same `runMissedJobs()` function, connects the DB,
     fires any missed jobs, then exits. This is the hourly safety net for
     the case where the backend crashed between logon triggers.

The combination tolerates: laptop suspend during a fire-time (catch-up
runs it on next wake), backend crash (hourly tick catches up), reboot
(logon trigger restarts the backend). No admin elevation is required at
install time.

## Ingest pipeline (Phase 2)

The ingest pipeline ([`backend/src/services/ingest.service.ts`](../backend/src/services/ingest.service.ts))
walks the configured WorkVault root, hashes file content, and reconciles
the results against the `notes` table. The design principle is that the
file is the source of truth; the DB row is an index (see
[ADR-0002](adr/0002-mtime-wins-on-ingest.md)).

### Walk → hash → reconcile loop

For each `.md` / `.txt` file discovered under the WorkVault root:

1. `resolveSafePath` (R-024) verifies the path stays inside the root.
   Escapees are logged to `ingest_errors` and skipped.
2. `fs.statSync` reads `mtime`. YAML frontmatter is parsed for a
   `file_id` UUID; one is generated and written back if absent (the only
   write the scanner ever makes to WorkVault files).
3. `content_sha256` is computed over the file body (frontmatter stripped).

### Reconciliation matrix

For each file, the scanner looks up `notes WHERE file_id = ?`:

| Condition | Action |
|-----------|--------|
| No DB row | **Insert** — `role='imported'`, `confirmed=1`, `last_seen_at=now()`. Trigger mention extraction. |
| Row exists; disk `mtime` > `last_seen_at` | **Update** — content, `content_sha256`, `file_mtime`, `last_seen_at`. Trigger mention extraction. |
| Row exists; `mtime` ≤ `last_seen_at`; `sha256` matches | **Touch** — `last_seen_at` only. No Anthropic call. |
| Row exists; `mtime` ≤ `last_seen_at`; `sha256` differs | **Conflict** — log to `ingest_errors`; insert a new note row with `conflict_of_note_id` pointing to the original. Do not overwrite. |
| Row exists but file absent from disk | **Tombstone** — set `deleted_at=now()`. No hard delete. |

After the full scan, any note whose `last_seen_at` predates `scan_start`
and whose `deleted_at` is null is also tombstoned.

### Mention extraction

Called for every inserted or updated note. Uses a non-streaming Anthropic
call on `claude-haiku-4-5` (cheapest viable model for classification):

- `tools: []` — no tools enabled on untrusted-content passes (R-021).
- Content is wrapped in
  `<untrusted_document src="note:{id}">…</untrusted_document>` (R-026).
- The system prompt provides the current org name list and asks for a JSON
  array of `{name, confidence}` objects.
- Results with `confidence < 0.5` are discarded. Accepted mentions are
  upserted into `note_mentions` with `source='ai_auto'`.

The same `extractMentions()` function is called inline from the note-save
route (`POST /api/notes`) so manually authored notes are also scanned on
write.

## Things explicitly not done (and why)

- **No CSRF or auth middleware.** Single-user localhost. Adding it would
  be ceremony with zero benefit until multi-user is on the table (out
  of scope in every phase).
- **No request log persistence.** stdout is fine for a single-user dev
  app. Add it when something demands it.
- **No DB connection pool.** better-sqlite3 is synchronous and serves a
  single Node process; pooling makes no sense here.
- **No CI / test pipeline.** `npm run test` (Vitest) covers models,
  routes, services, and migration correctness against per-test `:memory:`
  SQLite files. There is no remote CI runner — local test runs are the
  gate.

## Open architectural questions
- See [`PRD.md` § Open Questions](PRD.md#open-questions-residual--non-blocking).
