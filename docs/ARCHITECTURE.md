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

Single process per tier. No Docker, no microservices. Phase 2 adds a
Windows Service wrapper around the backend so it survives laptop suspend
and runs `runMissedJobs()` on every startup.

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
  │     • on tool_use(record_insight): noteModel.create with role='agent_insight'
  │     • on tool_use(web_search): SDK handles, results stream back
  ├─ on completion: persist assistant message → agent_messages + mirror to notes
  └─ send `data: [DONE]`, end response
  ▼
Client reader appends deltas to a transient assistant bubble until [DONE].
TanStack Query invalidation refreshes the notes list.
```

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
Phase 2: also write the note to disk under the configured WorkVault root,
record file_mtime in the row.
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

Phase 1 uses `CREATE IF NOT EXISTS` only — there is no migration
system. For incompatible changes (Phase 1 → Phase 2 will need at least
one), the policy is:

1. Stop the backend.
2. Delete `database/mastercontrol.db*` (the user has authorized this for
   the Phase 1 cutover; future incompatible changes need a fresh
   approval each time).
3. Restart — `initSchema()` recreates fresh.

This is acceptable because we are pre-data; Phase 1 ships with no
production data. Phase 2 introduces a real migration framework
(`better-sqlite3-migrations` or hand-rolled `_migrations` table) before
the WorkVault ingest lands, since user notes must not be wipeable.

## Scheduler architecture (Phase 2)

The user's laptop is suspended whenever it's closed. Scheduled jobs that
fire-and-forget would silently drop. The fix has three parts:

1. **Catch-up at startup**: the backend's scheduler module computes,
   for each enabled schedule, the most recent fire-time prior to `now`.
   If `last_run_at` is earlier than that fire-time, the job runs
   immediately and `last_run_at` updates. Idempotency is keyed on
   `(schedule_id, fire_time)` so two startups in a row don't double-fire.

2. **Live in-process scheduler**: `node-cron` ticks for each enabled
   schedule while the process is awake. Standard pattern.

3. **Service supervision**: the backend runs as a Windows Service
   (`node-windows` or `nssm`). A Windows Task Scheduler entry created
   once at install time pings `/health` every 5 minutes during a logged-in
   session and starts the service if it's not running. This is the
   watchdog — it does not wake the machine; it only ensures the backend
   is alive when the OS is.

The combination tolerates: laptop closed during a fire-time (catch-up
runs it on next wake), service crash (watchdog restarts), reboot
(install option starts at logon).

## Things explicitly not done (and why)

- **No CSRF or auth middleware.** Single-user localhost. Adding it would
  be ceremony with zero benefit until multi-user is on the table (out
  of scope in every phase).
- **No request log persistence.** stdout is fine for a single-user dev
  app. Add it when something demands it.
- **No DB connection pool.** better-sqlite3 is synchronous and serves a
  single Node process; pooling makes no sense here.
- **No CI / test pipeline yet.** Phase 1 verifies via `npm run typecheck`
  + `npm run lint` + manual exercise. Vitest is installed for when a
  testable unit emerges (likely the cron next-fire-time math first).

## Open architectural questions
- See [`PRD.md` § Open Questions](PRD.md#open-questions-residual--non-blocking).
