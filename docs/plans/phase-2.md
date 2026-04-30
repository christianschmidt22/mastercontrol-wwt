# MasterControl — Phase 2 Implementation Plan

## Context

Phase 1 ships a fully functional single-user CRM: CRUD for orgs, contacts,
projects, documents, notes, tasks; streaming per-org Claude agents with
`web_search` and `record_insight`; the full frontend with Field Notes
aesthetics. The SQLite schema, service layer, and frontend scaffold are
battle-tested. Phase 1 is feature-complete.

**Why Phase 2 now**: the user's active note corpus lives in
`C:\Users\schmichr\OneDrive - WWT\Documents\redqueen\WorkVault` — hundreds
of markdown files that the CRM can't yet see. The value of the per-org
agents grows proportionally with indexed knowledge. Scheduled reports
(starting with the Daily Task Review) close the "morning brief" loop the
user envisioned. This phase materializes both of those outcomes.

**What changed since the Phase 1 plan was written**: Q-3 (scheduler
architecture) is now **resolved** — Task Scheduler only, no Windows
Service. See `docs/adr/0004-task-scheduler-not-windows-service.md` and the
decision section below.

## Decisions locked

| # | Decision |
|---|----------|
| A | **Migration framework first** — hand-rolled `_migrations` table + numbered SQL files. Converts Phase 1 `schema.sql` to `001_initial.sql` as the baseline. No third-party migration lib. |
| B | **Scheduler: Task Scheduler only** (Q-3, ADR-0004). In-process `node-cron` + `runMissedJobs()` catch-up on startup. A Windows Task Scheduler entry runs the backend at logon; a separate hourly entry runs `scheduler:tick` as a safety net. No Windows Service. |
| C | **Ingest reconciliation: mtime wins.** File is the source of truth. DB row is an index. Missing file → tombstone. SHA mismatch with same mtime → log as conflict, leave both. |
| D | **`read_document` goes through `resolveSafePath`** (the Phase 1 R-024 stub). Extension allowlist: `.md`, `.txt`, `.pdf`. Size cap: 1 MiB. Every call logged to `agent_tool_audit`. |
| E | **Untrusted content in agent context is wrapped** in `<untrusted_document src="…">…</untrusted_document>` tags. Mention-extraction and ingest-context calls set `tools: []`. |
| F | **Daily Task Review** is the first shipped report. Prompt template, default schedule `0 7 * * *`, output to `C:\mastercontrol\reports\`. |
| G | **`report_runs` idempotency** keyed on `UNIQUE(schedule_id, fire_time)`. Second tick for same fire_time is a no-op. |
| H | **OEM project docs tile** populated by a new `/api/oem/:id/documents/scan` endpoint that walks the OEM's configured OneDrive folder via `safePath` + `fs.readdirSync`. |
| I | **Cross-org mention extraction** uses a non-streaming Anthropic call with `tools: []` and a small "list org names mentioned" prompt. Confidence score 0–1 stored on the mention row. Auto-tagged rows get `source='ai_auto'`. |

## Architecture overview

```
Phase 2 adds:

backend/src/db/migrations/
  001_initial.sql       ← Phase 1 schema.sql content verbatim
  002_indexes.sql       ← R-015 index additions
  003_schema_harden.sql ← R-019 (mention source/confidence, role enum,
                          task trigger, updated_at on contacts/docs)
  004_agent_audit.sql   ← R-022 agent_tool_audit (already in schema.sql;
                          moved into migration for baseline clarity)
  005_ingest.sql        ← notes dual-source columns (R-023), ingest_sources,
                          ingest_errors
  006_reports.sql       ← reports, report_schedules, report_runs

backend/src/services/
  ingest.service.ts     ← WorkVault walker + reconciliation
  workvault.service.ts  ← safe file write (R-025)
  reports.service.ts    ← runReport(), buildPrompt(), writeOutput()
  mention.service.ts    ← extractMentions() (extracted from note save path)
  scheduler.service.ts  ← runMissedJobs(), startInProcessScheduler()

backend/src/models/
  report.model.ts
  reportSchedule.model.ts
  reportRun.model.ts
  ingestSource.model.ts

backend/src/routes/
  reports.route.ts      ← GET/POST/PUT/DELETE /api/reports
                           POST /api/reports/:id/run-now
                           GET /api/reports/:id/runs
  ingest.route.ts       ← POST /api/ingest/scan (manual trigger)
                           GET /api/ingest/status
  oem-scan.route.ts     ← GET /api/oem/:id/documents/scan

frontend/src/pages/
  ReportsPage.tsx       ← real implementation (list + form)

frontend/src/api/
  useReports.ts
  useReportRuns.ts
  useIngest.ts
```

The scheduler runs inside the same Express process via `node-cron`. On
startup, `runMissedJobs()` fires before the HTTP server begins accepting
requests. The `scheduler:tick` CLI subcommand (for the Windows Task
Scheduler hourly safety net) imports the same `runMissedJobs()` function,
connects the DB, fires missed jobs, then exits cleanly.

```
Process startup order:
  1. runMigrations()          ← apply any pending SQL migration files
  2. runMissedJobs()          ← catch up any schedules that fired while
                                 the machine was suspended
  3. startInProcessScheduler() ← register node-cron jobs for each enabled
                                  report_schedules row
  4. app.listen(3001, '127.0.0.1')
```

## In scope

- Migration framework (R-014): `_migrations` table, numbered SQL files,
  `runMigrations()` replaces `initSchema()`.
- Schema additions (migrations 002–006): indexes (R-015), schema hardening
  (R-019), ingest columns on `notes` (R-023), new tables: `reports`,
  `report_schedules`, `report_runs`, `ingest_sources`, `ingest_errors`.
- WorkVault ingest pipeline: walk → hash → reconcile → mention-extract.
- Reports module: models, service, routes, Daily Task Review template.
- Scheduler: `runMissedJobs()`, `node-cron` in-process, `scheduler:tick`
  CLI, Windows Task Scheduler one-pager.
- Tool additions (R-021): `search_notes`, `list_documents`, `read_document`
  (with `resolveSafePath`), `create_task`. All logged to `agent_tool_audit`.
- OEM documents scan endpoint + tile data.
- Untrusted-document envelope (R-026) for ingested content in agent context.
- ReportsPage frontend (real implementation replacing Phase 1 placeholder).
- Insights queue: source badge (`ai_auto` vs `manual`) visible on mention
  rows; no new review queue — bulk accept/reject surface from Phase 1 is
  unchanged.

## Out of scope

- Email / Outlook integration (Phase 3).
- User-authored `@mention` syntax in the composer (the `note_mentions.source
  = 'manual'` column is reserved; the UI to author manual mentions is later).
- Per-org tile layout overrides (Phase 1.5 deferred item).
- Windows Service install automation — manual Task Scheduler install via the
  ops one-pager is sufficient for a single-user laptop app.
- DB-at-rest encryption (R-027) — `LATER` tier, not Phase 2.
- `documents.url_or_path` split (R-029) — `LATER` tier.

## Implementation steps

### Step 1 — Migration framework (R-014)

**Goal**: replace `CREATE IF NOT EXISTS` bootstrap with a proper versioned
migration runner. This is a prerequisite for every schema change in Phase 2.
No further migrations land until this step is green and committed.

**Files modified**:
- `backend/src/db/database.ts` — replace `initSchema()` call with
  `runMigrations()`. `runMigrations()`:
  1. Creates `_migrations(id INTEGER PRIMARY KEY, name TEXT NOT NULL,
     applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)` if it doesn't exist
     (this one table always uses `CREATE IF NOT EXISTS` — it's the bootstrap
     anchor).
  2. Reads all `backend/src/db/migrations/NNN_*.sql` files sorted
     lexicographically.
  3. For each file, extracts the numeric prefix as the migration `id`. If
     that `id` already exists in `_migrations`, skips. Otherwise, executes
     the SQL in a transaction, then inserts a row into `_migrations`.
  4. Runs synchronously (better-sqlite3 is synchronous; no async needed).
  Keep `database.ts` under 80 lines. The runner is ~30 lines with no
  external dependencies.

**Files created**:
- `backend/src/db/migrations/001_initial.sql` — verbatim content of the
  current `backend/src/db/schema.sql` (Phase 1 + P0 corrections). This
  makes Phase 1's state the migration baseline. Remove `IF NOT EXISTS`
  clauses from CREATE TABLE statements inside the migration (migrations run
  once in a transaction; IF NOT EXISTS is for the bootstrap shim only). Keep
  `IF NOT EXISTS` on the `_migrations` table creation in `database.ts`.
- `backend/src/db/schema.sql` — keep as a snapshot / reference doc but add
  a header comment: `-- This file is a documentation snapshot only. The
  authoritative schema is assembled by running the numbered migrations in
  backend/src/db/migrations/.`

**Test**: run the server twice. Second boot produces no SQL errors, no
duplicate migration rows. Add `migration.test.ts` that applies migrations
against `:memory:`, queries `_migrations`, asserts exactly the expected row
count. Adding a new `002_*.sql` applies once on next test run.

---

### Step 2 — Schema hardening migrations (R-015, R-019, R-023)

Three migration files that implement the review items deferred from Phase 1.
Run after Step 1 is committed. Each file is independent and goes into a
separate numbered SQL file.

#### `002_indexes.sql` (R-015)

```sql
CREATE INDEX idx_notes_thread_created
  ON notes(thread_id, created_at)
  WHERE thread_id IS NOT NULL;

CREATE INDEX idx_notes_created
  ON notes(created_at DESC);

CREATE INDEX idx_threads_org_last
  ON agent_threads(organization_id, last_message_at DESC);

CREATE INDEX idx_tasks_org_status
  ON tasks(organization_id, status);
```

Add `EXPLAIN QUERY PLAN` smoke-tests to the migration test suite confirming
the thread-history read uses the new index.

#### `003_schema_harden.sql` (R-019)

```sql
-- note_mentions: source provenance + AI confidence
ALTER TABLE note_mentions ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE note_mentions ADD COLUMN confidence REAL;
-- SQLite can't add a CHECK constraint to an existing column via ALTER TABLE.
-- Enforce the constraint in the model layer (zod + explicit check on insert).
-- Future: once the migration baseline is rebuilt, the column can be
-- defined with CHECK inline.

-- notes.role: extend accepted values (system, summary for Phase 2 use)
-- SQLite can't alter CHECK constraints. Drop + recreate is the standard
-- path; we instead enforce the extended set in the model layer and accept
-- that old DB rows with 'user'/'assistant'/'agent_insight'/'imported' are
-- already valid. New roles are only ever written by Phase 2 code paths.

-- contacts: add updated_at
ALTER TABLE contacts ADD COLUMN updated_at DATETIME;

-- documents: add updated_at
ALTER TABLE documents ADD COLUMN updated_at DATETIME;

-- tasks: BEFORE INSERT/UPDATE trigger for cross-org consistency
-- Rejects a task that links a contact from a different org.
CREATE TRIGGER IF NOT EXISTS trg_tasks_contact_org_insert
  BEFORE INSERT ON tasks
  WHEN NEW.contact_id IS NOT NULL AND NEW.organization_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'contact org mismatch')
  WHERE (SELECT organization_id FROM contacts WHERE id = NEW.contact_id)
        != NEW.organization_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_tasks_contact_org_update
  BEFORE UPDATE ON tasks
  WHEN NEW.contact_id IS NOT NULL AND NEW.organization_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'contact org mismatch')
  WHERE (SELECT organization_id FROM contacts WHERE id = NEW.contact_id)
        != NEW.organization_id;
END;
```

Model-layer enforcement for `note_mentions.source`:
- `mention.service.ts` inserts with `source IN ('ai_auto', 'manual',
  'agent_insight')` validated by a zod enum before the SQL write.
- `note.model.ts` validates `role` against the extended set
  `['user', 'assistant', 'agent_insight', 'imported', 'system', 'summary']`
  in the insert schema.

#### `004_audit.sql` (R-022 clean-up)

`agent_tool_audit` already exists in the Phase 1 schema (committed during
P0). This migration is a no-op marker — it records that the table was added
as part of Phase 1 P0 work so the migration id sequence is honest. The SQL
body is just a comment:

```sql
-- agent_tool_audit was created inline in 001_initial.sql.
-- This migration exists as a sequence placeholder only.
SELECT 1;
```

#### `005_ingest.sql` (R-023)

```sql
-- Dual source-of-truth columns on notes (R-023)
ALTER TABLE notes ADD COLUMN file_id TEXT;
ALTER TABLE notes ADD COLUMN content_sha256 TEXT;
ALTER TABLE notes ADD COLUMN last_seen_at DATETIME;
ALTER TABLE notes ADD COLUMN deleted_at DATETIME;
ALTER TABLE notes ADD COLUMN conflict_of_note_id INTEGER
  REFERENCES notes(id);

CREATE INDEX idx_notes_file_id ON notes(file_id)
  WHERE file_id IS NOT NULL;

CREATE INDEX idx_notes_deleted ON notes(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- Ingest source registry
CREATE TABLE ingest_sources (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  root_path TEXT    NOT NULL,
  kind      TEXT    NOT NULL CHECK(kind IN ('workvault', 'onedrive', 'oem_docs')),
  last_scan_at DATETIME,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Per-file ingest errors
CREATE TABLE ingest_errors (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id  INTEGER NOT NULL REFERENCES ingest_sources(id) ON DELETE CASCADE,
  path       TEXT    NOT NULL,
  error      TEXT    NOT NULL,
  occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ingest_errors_source ON ingest_errors(source_id, occurred_at DESC);
```

#### `006_reports.sql` (R-028)

```sql
CREATE TABLE reports (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  prompt_template TEXT    NOT NULL,
  -- target: JSON array of org ids, or ["all"] for every org.
  -- e.g. [1, 3, 7] or ["all"]
  target          TEXT    NOT NULL DEFAULT '["all"]',
  -- output_format: 'markdown' only for now
  output_format   TEXT    NOT NULL DEFAULT 'markdown'
                          CHECK(output_format IN ('markdown')),
  enabled         INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE report_schedules (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id   INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  cron_expr   TEXT    NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
  -- next_run_at and last_run_at are UNIX epoch seconds stored as INTEGER
  -- so they survive serialization through JSON without floating-point noise.
  next_run_at INTEGER,
  last_run_at INTEGER,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_schedules_report ON report_schedules(report_id);
CREATE INDEX idx_schedules_next   ON report_schedules(next_run_at)
  WHERE enabled = 1;

CREATE TABLE report_runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id  INTEGER NOT NULL REFERENCES report_schedules(id)
                 ON DELETE CASCADE,
  -- fire_time: the nominal cron fire-time (UNIX epoch seconds).
  -- UNIQUE with schedule_id prevents double-firing on catch-up.
  fire_time    INTEGER NOT NULL,
  started_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  finished_at  DATETIME,
  -- status: queued → running → done | failed
  status       TEXT NOT NULL DEFAULT 'queued'
               CHECK(status IN ('queued', 'running', 'done', 'failed')),
  output_path  TEXT,
  -- content_sha256 of the output file for change detection
  output_sha256 TEXT,
  summary      TEXT,
  error        TEXT,
  UNIQUE(schedule_id, fire_time)
);

CREATE INDEX idx_runs_schedule ON report_runs(schedule_id, fire_time DESC);
```

**Tests for Step 2**: Add `migrations.test.ts` cases that verify:
- `note_mentions` insert with `source='ai_auto'` succeeds; `source='bogus'`
  is rejected by the model layer.
- Task trigger rejects inserting a Cisco contact onto a Fairview task.
- `report_runs` second insert with same `(schedule_id, fire_time)` throws
  SQLITE_CONSTRAINT.
- `notes` with `file_id` round-trips through `ingest.service` correctly.

---

### Step 3 — Ingest pipeline (`ingest.service.ts`)

**Goal**: walk WorkVault, reconcile with DB, auto-extract mentions. This is
the core Phase 2 feature.

**New file**: `backend/src/services/ingest.service.ts`

#### 3a. Walker

```
scanWorkvault(sourceId: number, rootPath: string): Promise<ScanResult>
```

1. Read `settings('workvault_root')` (or accept rootPath argument for
   testing).
2. Use `fs.readdirSync` recursively (Node 18+ supports `{ recursive: true }`)
   to collect all `.md` and `.txt` files.
3. For each file path, call `resolveSafePath(filePath, rootPath)` — reject
   any that escape the root (R-024 already handles this). Log rejections to
   `ingest_errors`.
4. Read the file's `mtime` via `fs.statSync`.
5. Parse YAML frontmatter (first `---` block) to extract `file_id`. If no
   frontmatter or no `file_id` key, generate a new UUID and append it:
   ```
   ---
   file_id: <uuid>
   ---
   ```
   Write back to the file. This is the one write this service ever does to
   WorkVault files (assigning a stable identity to previously untracked
   notes). Subsequent reads use the stored `file_id`.
6. Compute `content_sha256` over the file body (after stripping frontmatter).

#### 3b. Reconciliation matrix

For each file discovered by the walker, look up `notes WHERE file_id = ?`.

| Condition | Action |
|-----------|--------|
| No DB row matching `file_id` | **Insert** new note row: `role='imported'`, `source_path`, `file_mtime`, `file_id`, `content_sha256`, `last_seen_at = now()`, `confirmed = 1`. Trigger mention extraction (§3c). |
| DB row exists; file `mtime` > `last_seen_at` | **Update** content + `content_sha256` + `file_mtime` + `last_seen_at`. Trigger mention extraction. |
| DB row exists; file `mtime` ≤ `last_seen_at`; `sha256` matches | **Touch** `last_seen_at` only (no content update, no Anthropic call). |
| DB row exists; file `mtime` ≤ `last_seen_at`; `sha256` differs | **Conflict**: log to `ingest_errors` (path, error="sha256 mismatch at unchanged mtime"). Create a new note row with `conflict_of_note_id` pointing to the original. Do not overwrite the existing row. |
| DB row exists but file not on disk during this scan | **Tombstone**: set `deleted_at = now()` on the DB row. Do not hard-delete. |

After the full scan, any notes row with `last_seen_at` older than
`scan_start` and `deleted_at IS NULL` is also tombstoned (it was present on
the previous scan but missing now).

#### 3c. Mention extraction

Called for every new or updated note. Runs a non-streaming Anthropic call:

```ts
async function extractMentions(noteId: number, content: string): Promise<void> {
  const orgs = await orgModel.listAll(); // cached per-scan, not per-note
  const names = orgs.map(o => o.name).join(', ');

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',   // cheapest; this is a classification call
    max_tokens: 256,
    tools: [],                    // R-021: no tools on untrusted-content pass
    system: `You are an entity extractor. Given a note, identify which of
these organization names are mentioned: ${names}. Return a JSON array of
objects: [{name: string, confidence: number}]. confidence is 0.0–1.0.
Return [] if none match. Respond with valid JSON only.`,
    messages: [{
      role: 'user',
      content: `<untrusted_document src="note:${noteId}">\n${content}\n</untrusted_document>`,
    }],
  });

  const parsed = JSON.parse(response.content[0].text ?? '[]');
  for (const { name, confidence } of parsed) {
    const org = orgs.find(o => o.name.toLowerCase() === name.toLowerCase());
    if (!org || confidence < 0.5) continue;
    await mentionModel.upsert({
      note_id: noteId,
      mentioned_org_id: org.id,
      source: 'ai_auto',
      confidence,
    });
  }
}
```

Key constraints: `tools: []` (R-021), untrusted-document wrapping (R-026),
Haiku model to keep extraction cheap, confidence threshold of 0.5 to filter
noise.

#### 3d. Ingest route

```
POST /api/ingest/scan
```

- Reads `settings('workvault_root')`.
- Creates (or finds) an `ingest_sources` row for this root.
- Calls `scanWorkvault()`.
- Returns `{ files_scanned, inserted, updated, tombstoned, conflicts, errors }`.

```
GET /api/ingest/status
```

- Returns the most recent `ingest_sources` row + last 20 `ingest_errors`.

Manual trigger is the primary path for Phase 2. Automatic on-save scanning
for the live note-write flow is also wired in: `notes.route.ts`
`POST /api/notes` calls `extractMentions(noteId, content)` after insert.

**Tests**:
- Walk a tmp directory with 3 `.md` files (one new, one modified, one
  unchanged). Assert correct insert/update/touch counts.
- Tombstone: remove a file between scan calls; assert `deleted_at` is set.
- Conflict: insert a DB row with `last_seen_at = now()` and a different
  `sha256`; assert `ingest_errors` has a row.
- Mention extraction: mock the Anthropic SDK; assert `note_mentions` rows
  inserted with `source='ai_auto'`.
- `resolveSafePath` rejection: symlink outside root → logged to
  `ingest_errors`, not thrown.

---

### Step 4 — WorkVault write safety (`workvault.service.ts`)

**Goal**: when Phase 2 writes a user-authored note to disk (new notes saved
from the app), the write path is safe and auditable. Implements R-025.

**New file**: `backend/src/services/workvault.service.ts`

```ts
export async function writeNote(note: {
  id: number;
  organization_id: number;
  content: string;
  file_id: string;
}): Promise<string> {
  const workvaultRoot = settingsModel.get('workvault_root');
  if (!workvaultRoot) throw new Error('workvault_root not configured');

  // Server-derived filename only (R-025)
  const slug = note.content.slice(0, 40).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const filename = `${note.id}-${slug}.md`;
  const dest = path.join(workvaultRoot, filename);

  // Verify dest is inside root before writing (R-024 pattern)
  const safeDir = path.resolve(workvaultRoot);
  const safeDest = path.resolve(dest);
  if (!safeDest.startsWith(safeDir + path.sep)) {
    throw new Error('safe-path-rejected: destination escapes workvault_root');
  }

  // Refuse to overwrite a path not in the DB index (R-025)
  const existing = noteModel.getByPath(safeDest);
  if (existing && existing.id !== note.id) {
    throw new Error(`write-rejected: path already owned by note ${existing.id}`);
  }

  const frontmatter = `---\nfile_id: ${note.file_id}\n---\n\n`;
  fs.writeFileSync(safeDest, frontmatter + note.content, 'utf8');

  // Update the DB row with the new path + mtime
  const mtime = fs.statSync(safeDest).mtime.toISOString();
  noteModel.updateSourcePath(note.id, safeDest, mtime);

  return safeDest;
}
```

Wire into `notes.route.ts`: after `noteModel.create(...)`, if
`workvault_root` is configured and `settings('workvault_write') === 'true'`,
call `writeNote(...)`. The write is best-effort — log failures to stderr,
never reject the HTTP response because of a write failure.

**Tests**:
- Happy path: creates the file with correct frontmatter + content.
- Server-derived filename: content with special characters produces a clean
  slug.
- Collision: trying to write to a path already claimed by a different note
  throws.

---

### Step 5 — Reports module

#### 5a. Models

**`backend/src/models/report.model.ts`**

```ts
// list(): Report[]
// get(id): Report | undefined
// create(data): Report
// update(id, data): Report
// remove(id): void
```

**`backend/src/models/reportSchedule.model.ts`**

```ts
// listByReport(reportId): ReportSchedule[]
// getEnabled(): ReportSchedule[]       ← used by scheduler
// upsert(reportId, data): ReportSchedule
// updateLastRun(id, fireTime): void
// updateNextRun(id, nextAt): void
```

**`backend/src/models/reportRun.model.ts`**

```ts
// listBySchedule(scheduleId, limit?): ReportRun[]
// create(data): ReportRun          ← INSERT OR IGNORE on UNIQUE(schedule_id, fire_time)
// updateStatus(id, status, extra?): void
// getLastRun(scheduleId): ReportRun | undefined
```

`create()` uses `INSERT OR IGNORE` so that concurrent calls (edge case if
two scheduler ticks overlap) silently no-op rather than throw.

#### 5b. Reports service

**`backend/src/services/reports.service.ts`**

```ts
export async function runReport(scheduleId: number, fireTime: number): Promise<void>
```

1. `reportRun.create({ schedule_id, fire_time, status: 'queued' })` —
   returns immediately if UNIQUE conflict (idempotent).
2. Load report definition via `reportSchedule.model.get(scheduleId)` →
   `report.model.get(reportId)`.
3. Set run status `'running'`.
4. Build prompt:
   - Expand `{{tasks_due_today}}`, `{{tasks_overdue}}`, `{{tasks_stale}}`,
     `{{recent_notes}}` template variables with live DB data.
   - For the Daily Task Review template these are all tasks due today, tasks
     overdue, tasks not updated in >14 days, and the last 10 notes across
     target orgs respectively.
5. Call Anthropic (non-streaming):
   ```ts
   const resp = await anthropic.messages.create({
     model: settings.get('default_model') ?? 'claude-sonnet-4-6',
     max_tokens: 4096,
     tools: [],      // no tools in report generation
     messages: [{ role: 'user', content: prompt }],
   });
   ```
6. Write output to
   `C:\mastercontrol\reports\<report-id>\<run-id>.md`.
   Create directory if it doesn't exist.
7. Compute `content_sha256` of the output.
8. Update run row: `status='done'`, `output_path`, `output_sha256`,
   `finished_at`, `summary` (first 200 chars of output).
9. Update `report_schedules.last_run_at` and compute + store `next_run_at`.

On any unhandled exception, set `status='failed'`, `error = err.message`,
`finished_at = now()`.

#### 5c. Daily Task Review — seed data

On first `runMigrations()` completion, check whether a report named
`'Daily Task Review'` exists. If not, seed it:

```ts
const report = reportModel.create({
  name: 'Daily Task Review',
  prompt_template: DAILY_TASK_REVIEW_TEMPLATE,
  target: '["all"]',
  output_format: 'markdown',
  enabled: 1,
});
reportScheduleModel.upsert(report.id, {
  cron_expr: '0 7 * * *',
  enabled: 1,
});
```

`DAILY_TASK_REVIEW_TEMPLATE` (inline constant in `reports.service.ts`):

```
You are a personal CRM assistant for a WWT account executive. Generate a
concise daily task review for {{date}}.

**Tasks due today ({{tasks_due_count}}):**
{{tasks_due_today}}

**Overdue tasks ({{tasks_overdue_count}}):**
{{tasks_overdue}}

**Stale tasks — no activity >14 days ({{tasks_stale_count}}):**
{{tasks_stale}}

**Recent notes across all orgs (last 48 hours):**
{{recent_notes}}

Provide:
1. A 3-sentence "today at a glance" summary.
2. Suggested follow-ups or action items, ranked by urgency.
3. Any patterns or risks you notice across the stale / overdue pile.

Be direct. Use markdown. Keep the output under 600 words.
```

#### 5d. Routes

**`backend/src/routes/reports.route.ts`**

```
GET    /api/reports              → report.model.list()
POST   /api/reports              → report.model.create(body)
GET    /api/reports/:id          → report.model.get(id)
PUT    /api/reports/:id          → report.model.update(id, body)
DELETE /api/reports/:id          → report.model.remove(id)
POST   /api/reports/:id/run-now  → find schedule → runReport(scheduleId, Date.now())
GET    /api/reports/:id/runs     → reportRun.model.listBySchedule(scheduleId)
```

All request bodies validated via zod schemas in
`backend/src/schemas/report.schema.ts`.

**Tests**: CRUD round-trip, `run-now` triggers `runReport` (mock the
Anthropic call), second `run-now` within the same second is a no-op (assert
single run row in DB).

---

### Step 6 — Scheduler

#### 6a. Scheduler service

**`backend/src/services/scheduler.service.ts`**

```ts
import cron from 'node-cron';
import { reportScheduleModel } from '../models/reportSchedule.model.js';
import { runReport } from './reports.service.js';
import { getNextCronTime, getMostRecentCronTime } from '../lib/cronUtils.js';

export async function runMissedJobs(): Promise<void> {
  const now = Math.floor(Date.now() / 1000); // UNIX seconds
  const schedules = reportScheduleModel.getEnabled();
  for (const s of schedules) {
    const mostRecentFireTime = getMostRecentCronTime(s.cron_expr, now);
    if (mostRecentFireTime && (!s.last_run_at || s.last_run_at < mostRecentFireTime)) {
      await runReport(s.id, mostRecentFireTime);
    }
  }
}

export function startInProcessScheduler(): void {
  const schedules = reportScheduleModel.getEnabled();
  for (const s of schedules) {
    cron.schedule(s.cron_expr, async () => {
      const fireTime = Math.floor(Date.now() / 1000);
      await runReport(s.id, fireTime);
    });
  }
}
```

**`backend/src/lib/cronUtils.ts`**

Small utility wrapping `node-cron`'s `getTasks()` pattern or a direct
cron-next-fire calculation. Two exports:

```ts
// Returns the most recent cron fire-time ≤ now (UNIX seconds), or null
// if the schedule has never fired before the epoch.
export function getMostRecentCronTime(expr: string, nowSecs: number): number | null

// Returns the next fire-time > now (UNIX seconds).
export function getNextCronTime(expr: string, nowSecs: number): number
```

Use the `cron-parser` npm package (small, no native deps) for the
calculation. This is the one new direct dep added by Phase 2 beyond
`node-cron`.

**`scheduler:tick` CLI** — `backend/src/cli/scheduler-tick.ts`:

```ts
import { runMigrations } from '../db/database.js';
import { runMissedJobs } from '../services/scheduler.service.js';

await runMigrations();
await runMissedJobs();
process.exit(0);
```

Add to `backend/package.json`:

```json
"scheduler:tick": "tsx src/cli/scheduler-tick.ts"
```

The Windows Task Scheduler entry for the hourly safety net runs:
`npm run --prefix C:\mastercontrol\backend scheduler:tick`

#### 6b. New npm dependencies

```
backend: node-cron, cron-parser (both have types in @types/node-cron;
         cron-parser ships its own types)
```

**Tests for Step 6**: `cronUtils.test.ts` — the most important unit tests
in Phase 2. Verify `getMostRecentCronTime('0 7 * * *', ...)` returns the
previous 07:00 when called at 14:00 on the same day, and `null` when called
before the first occurrence. Test `runMissedJobs()` with a mocked
`runReport` — assert it fires for a schedule whose `last_run_at` is before
the most-recent fire-time and skips one that already ran.

---

### Step 7 — Phase 2 agent tools (R-021)

Add four tools to `claude.service.ts`. All four log to `agent_tool_audit`.

#### `search_notes`

```ts
{
  name: 'search_notes',
  description: 'Full-text search over notes. Returns matching note excerpts
    and their org. Use when the user asks "did we discuss X" or wants to
    find past context.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      org_id: { type: 'integer', description: 'Limit to one org (optional).' },
    },
    required: ['query'],
  },
}
```

Handler: SQLite FTS via `SELECT * FROM notes WHERE content LIKE '%' || ? || '%'`
(simple LIKE for Phase 2; a proper FTS5 virtual table is a Phase 3
upgrade). Returns up to 10 rows, each truncated to 300 chars, with
`org_id` and `created_at`.

#### `list_documents`

```ts
{
  name: 'list_documents',
  description: 'List documents attached to an org (links, files, OneDrive
    scans). Use before offering to open or summarize a document.',
  input_schema: {
    type: 'object',
    properties: {
      org_id:  { type: 'integer' },
      kind: { type: 'string', enum: ['link', 'file', 'all'], default: 'all' },
    },
    required: ['org_id'],
  },
}
```

Handler: `documentModel.listByOrg(org_id, kind)`.

#### `read_document`

```ts
{
  name: 'read_document',
  description: 'Read the text content of a stored document or WorkVault
    file. Always check list_documents first to get a valid path.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute file path.' },
    },
    required: ['path'],
  },
}
```

Handler:
```ts
const root = settingsModel.get('workvault_root') ?? settingsModel.get('onedrive_root');
const safe = resolveSafePath(input.path, root);       // R-024
enforceSizeLimit(safe);                                 // 1 MiB cap
const content = readFileSync(safe, 'utf8');
// Wrap in untrusted-document envelope (R-026)
return `<untrusted_document src="${safe}">\n${content}\n</untrusted_document>`;
```

#### `create_task`

```ts
{
  name: 'create_task',
  description: 'File a follow-up task. Use when the user says "remind me to"
    or "make a note to follow up on X." Prefers to attach to the current org.',
  input_schema: {
    type: 'object',
    properties: {
      title:      { type: 'string' },
      due_date:   { type: 'string', description: 'ISO 8601 date (YYYY-MM-DD).' },
      org_id:     { type: 'integer', description: 'Attach to this org (optional).' },
      contact_id: { type: 'integer', description: 'Attach to this contact (optional).' },
    },
    required: ['title'],
  },
}
```

Handler: `taskModel.create(...)` — validate that `contact_id`'s org matches
`org_id` before inserting (enforces R-019 trigger at the service layer as
well). Returns the new task `id`.

**Tool registration**: add all four to the `tools` array in `streamChat()`.
The `tools_enabled` JSON in `agent_configs` controls which are active per
section/org. Default: all four enabled for both sections.

**Tests**: unit-test each handler with a mocked DB; confirm `agent_tool_audit`
row written for each call; confirm `read_document` rejects paths outside
`workvault_root`.

---

### Step 8 — OEM documents scan endpoint

**Route**: `GET /api/oem/:id/documents/scan`

1. Load the OEM org; extract `metadata.onedrive_folder` (the user must have
   set this per-OEM, stored in the org's `metadata` JSON under the key
   `onedrive_folder`).
2. If not configured, return `{ configured: false }`.
3. Read `settings('onedrive_root')`.
4. Walk the folder (`fs.readdirSync(fullPath, { withFileTypes: true })`)
   — shallow listing only (no recursion in Phase 2).
5. For each entry, call `resolveSafePath(entry.path, onedrive_root)` to
   ensure it stays in bounds.
6. Return file listing: `[{ name, path, size, mtime, kind }]`.
7. Optionally upsert `documents` rows with `source='onedrive_scan'` for any
   files not already tracked.

**Frontend**: OEM Project Documentation tile calls this endpoint on mount
and renders the file list. Each row is a link that calls the `read_document`
agent tool (via a "Read with agent" button) or opens the OneDrive URL
directly.

---

### Step 9 — Reports frontend (`ReportsPage.tsx`)

Replace the Phase 1 placeholder stub with a real implementation.

#### List view

```
┌──────────────────────────────────────────────────────┐
│  Reports                              [+ New Report] │
├──────────────────────────────────────────────────────┤
│  Daily Task Review                                   │
│  Schedule: 0 7 * * *  Next: tomorrow 7:00 AM        │
│  Last run: today 7:02 AM  Status: ✓ done             │
│  [Run Now]  [Edit]  [History]                        │
├──────────────────────────────────────────────────────┤
│  …                                                   │
└──────────────────────────────────────────────────────┘
```

Each row shows: name, cron expression (rendered humanized via a tiny
`cronstrue` utility or a simple hand-rolled formatter), last run time +
status, next run time, three actions.

#### New / edit form

Fields:
- Name (text input, required)
- Prompt template (textarea, 8 rows, `font-family: var(--font-mono)` so cron
  and template vars are readable)
- Target orgs (multi-select checkboxes: `All orgs` or individual orgs from
  `useOrganizations()`)
- Schedule (cron expression text input; add an inline validator that uses
  `node-cron`'s `validate()` on the backend — `POST /api/reports/validate-cron`)
- Output destination (read-only display: `C:\mastercontrol\reports\<id>\`)

Submit calls `POST /api/reports` or `PUT /api/reports/:id`.

#### History drawer

Clicking `[History]` opens a drawer (not a full-page navigation) listing the
last 20 runs for that report, with start time, duration, status, and a link
to open the output `.md` file. Implemented as a `<Dialog>` following the
DESIGN.md overlay spec.

#### Frontend types

Add to `frontend/src/types/report.ts`:

```ts
export interface Report { id: number; name: string; prompt_template: string;
  target: string; output_format: string; enabled: boolean;
  created_at: string; updated_at: string; }

export interface ReportSchedule { id: number; report_id: number;
  cron_expr: string; enabled: boolean;
  next_run_at: number | null; last_run_at: number | null; }

export interface ReportRun { id: number; schedule_id: number;
  fire_time: number; status: string; output_path: string | null;
  summary: string | null; error: string | null;
  started_at: string; finished_at: string | null; }
```

---

### Step 10 — ARCHITECTURE.md updates

Two sections need updating to reflect Phase 2 reality. Edit in place — no
new document.

1. **`§ Schema migration policy`** — Replace the existing paragraph
   ("`Phase 1 uses CREATE IF NOT EXISTS only — there is no migration
   system.`") with a description of the `_migrations` table + numbered SQL
   files approach. Reference `backend/src/db/migrations/`.

2. **`§ Scheduler architecture`** — Replace the current text (which still
   references Windows Service + node-windows + nssm) with the Task
   Scheduler-only approach: in-process `node-cron`, `runMissedJobs()` on
   startup, `scheduler:tick` CLI for the hourly Task Scheduler safety net.
   Reference ADR-0004.

3. **Add `§ Ingest pipeline`** describing the walk → hash → reconcile loop,
   the five-case reconciliation matrix, and the mention-extraction call
   pattern.

---

### Step 11 — Ops documentation

**New file**: `docs/ops/scheduler-install.md`

Single-page install guide. See the separate section in this plan for the
full content spec; the actual file is written in Step 11 when the scheduler
code is complete and the exact script can be confirmed.

Content outline:
1. Prerequisites (Node on PATH, backend built or run via tsx).
2. PowerShell commands to register two Task Scheduler entries:
   - `MasterControl Backend` — runs at logon, starts the Express server.
   - `MasterControl Scheduler Tick` — runs hourly, runs `scheduler:tick`.
3. Verification steps (open Task Scheduler, confirm entries, trigger a
   manual run, check `report_runs` table).
4. Uninstall (PowerShell `Unregister-ScheduledTask` commands).

---

### Step 12 — Verification

**Backend**:
```
npm run test          ← all model + route + service tests pass
npm run typecheck     ← both workspaces clean
npm run lint          ← both workspaces clean
```

**Migration smoke test**: delete `database/mastercontrol.db`, start the
backend, confirm migrations 001–006 all applied (query `_migrations`), confirm
seed data (Daily Task Review report + schedule exists).

**Ingest smoke test**: configure `workvault_root` in Settings to a test
directory with 3 markdown files. Call `POST /api/ingest/scan`. Confirm
`notes` rows inserted, `note_mentions` populated, `ingest_sources`
`last_scan_at` updated.

**Report smoke test**: confirm `run-now` on the Daily Task Review creates a
`report_runs` row, writes a `.md` file under `C:\mastercontrol\reports\`,
returns the output path. Confirm a second `run-now` within the same second
is a no-op (single run row).

**Scheduler smoke test**: set a schedule's `last_run_at` to 24 hours ago,
restart the backend, confirm `runMissedJobs()` fires the report.

**Browser smoke test**:
- Navigate to Reports page — Daily Task Review row visible.
- Click `Run Now` — spinner → done → history row appears.
- Click `History` — drawer opens with the run.
- Navigate to an OEM page — if `onedrive_folder` is set in org metadata,
  Project Documentation tile shows the file listing.
- Open any org chat — type "what tasks are overdue?" — agent calls
  `search_notes` tool, result appears in chat.
- Open Settings — `scheduler:tick` last-run time visible (if Task Scheduler
  is installed).

**CHANGELOG entry**: add a Phase 2 entry to `docs/CHANGELOG.md` once the
above checks pass.

## Critical files

**New (backend)**:
- `backend/src/db/migrations/001_initial.sql` through `006_reports.sql`
- `backend/src/services/ingest.service.ts`
- `backend/src/services/workvault.service.ts`
- `backend/src/services/reports.service.ts`
- `backend/src/services/mention.service.ts`
- `backend/src/services/scheduler.service.ts`
- `backend/src/models/report.model.ts`
- `backend/src/models/reportSchedule.model.ts`
- `backend/src/models/reportRun.model.ts`
- `backend/src/models/ingestSource.model.ts`
- `backend/src/routes/reports.route.ts`
- `backend/src/routes/ingest.route.ts`
- `backend/src/routes/oem-scan.route.ts`
- `backend/src/lib/cronUtils.ts`
- `backend/src/cli/scheduler-tick.ts`
- `backend/src/schemas/report.schema.ts`

**New (frontend)**:
- `frontend/src/pages/ReportsPage.tsx` (real implementation, replaces stub)
- `frontend/src/api/useReports.ts`
- `frontend/src/api/useReportRuns.ts`
- `frontend/src/api/useIngest.ts`
- `frontend/src/types/report.ts`

**New (docs)**:
- `docs/ops/scheduler-install.md`
- `docs/adr/0004-task-scheduler-not-windows-service.md`

**Modified**:
- `backend/src/db/database.ts` — `initSchema()` → `runMigrations()`
- `backend/src/db/schema.sql` — add documentation-snapshot header comment
- `backend/src/services/claude.service.ts` — add 4 new tools
- `backend/src/routes/notes.route.ts` — wire `extractMentions()` on note save
- `backend/src/index.ts` — mount new routes; call `runMissedJobs()` +
  `startInProcessScheduler()` at startup
- `backend/package.json` — add `node-cron`, `cron-parser`, `scheduler:tick`
  script
- `docs/ARCHITECTURE.md` — update migration policy + scheduler sections
- `docs/PRD.md` — mark Q-3 resolved; tighten Phase 2 list

## Verification checklist

```
[x] npm run test                  — all tests pass (backend + frontend Vitest suites green on 2026-04-29)
[x] npm run typecheck             — both workspaces clean (verified 2026-04-29 from worktree-agent-a011334cc2f9db481)
[x] npm run lint                  — both workspaces clean (verified 2026-04-29; ESLint v9 flat config)
[x] _migrations has 6 rows        — _migrations holds 24 rows (001–024) on the live DB; 001–006 the original Phase 2 set, 007–024 the post-checkpoint schema work
[x] Daily Task Review seeded      — reports id=1 'Daily Task Review' + report_schedules id=1 cron='0 7 * * *' confirmed via better-sqlite3 read
[x] Run Now fires correctly       — report_runs has 4 rows on disk; reports.service.test.ts covers run-now → status transitions and output write
[x] Second Run Now is a no-op     — reportRun.model uses INSERT OR IGNORE on UNIQUE(schedule_id, fire_time); idempotency covered in reports.service.test.ts
[x] runMissedJobs catches up      — scheduler.service.test.ts asserts a stale last_run_at fires runReport on next runMissedJobs() pass
[ ] Ingest scan reconciles        — (deferred — WorkVault wiring excluded from this Phase 2 close-out per user direction; the 5-case matrix is covered by ingest.service.test.ts but live wiring/ingest_sources is empty)
[ ] Mention extraction populates  — (deferred — WorkVault wiring excluded from this Phase 2 close-out per user direction; live note_mentions has 3 rows with source='ai_auto' from earlier dev runs and unit tests cover the path)
[x] read_document rejects ../     — claude.service.tools.test.ts covers resolveSafePath rejection of paths escaping workvault_root
[x] OEM docs tile lists files     — oem-scan.route.ts + oem-scan.route.test.ts in place; route returns `{ configured: false }` until the OEM's metadata.onedrive_folder is set (manual configuration required)
[x] Reports page renders          — ReportsPage.test.tsx covers list view, run-now control, history dialog, and failed-run flag
[x] Task trigger enforced         — sqlite_master shows trg_tasks_contact_org_insert + trg_tasks_contact_org_update on the live DB; create_task service-layer guard backstops them
[x] CHANGELOG entry added         — docs/CHANGELOG.md "Phase 2 — closeout (2026-04-29)" section landed alongside this checklist update
```

## Open questions

1. **WorkVault frontmatter mutation**: the ingest scanner writes a `file_id`
   into files that don't have one. OneDrive will sync this change. Is that
   acceptable? If not, we need a side-database that maps `(path, inode,
   mtime)` → `file_id` instead. Default plan: write the frontmatter — it's
   low-noise and makes the file self-describing.

2. **Mention-extraction model**: Haiku 4.5 is used for cost. If extraction
   quality is poor (lots of false positives at 0.5 confidence), bump to
   Sonnet 4.6 and raise the threshold to 0.7. Leave this as a configurable
   `agent_configs`-adjacent setting in Phase 3.

3. **OEM `onedrive_folder` UX**: currently a raw `metadata` JSON field
   edited through the org's Profile tile. A dedicated "Configure OneDrive
   folder" affordance on the OEM page would be cleaner. Defer to Phase 2.5
   polish or Phase 3.

4. **Reports output viewer**: the History drawer links to a `.md` file path
   that only opens in a local file manager (no in-app renderer). Phase 3
   should add a markdown viewer panel inside the app. For Phase 2, the
   output path is shown as text — the user opens it in VS Code or Obsidian.

5. **FTS5 virtual table**: `search_notes` currently uses a `LIKE` scan.
   Once the WorkVault ingest lands (potentially thousands of notes), this
   will be slow. Phase 3 should add `CREATE VIRTUAL TABLE notes_fts USING
   fts5(content, content=notes)` and update the `search_notes` handler.
