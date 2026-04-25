# MasterControl Phase 1 — Backend Pre-Ship Audit

**Date**: 2026-04-25  
**Auditor**: Senior backend reviewer (automated pass)  
**Branch**: `claude/great-tesla-6c5416`  
**Scope**: All backend source files; read-only review.

---

## Compliance check

| R-ID | Title | Status | Note |
|---|---|---|---|
| R-001 | Bind backend + Vite to loopback | **Met** | `index.ts` line 78-79: `app.listen(PORT, '127.0.0.1', …)`. |
| R-002 | `record_insight` allowlist + provenance + unconfirmed | **Met (gap)** | Allowlist resolution correct; schema has `provenance` and `confirmed=0`; `createInsight` takes `NoteProvenance` object but service casts the signature as `(orgId, content, provenance: string)` — type mismatch (see Bug B-01). |
| R-003 | DPAPI-encrypt API key; masking in model layer | **Met (gap)** | DPAPI integration complete; `getMasked` used by routes. `warmDpapi()` is **never called** from `index.ts` — first write before warm may encrypt with no-op fallback silently (see Bug B-02). |
| R-004 | Fix `agent_configs` UNIQUE-on-NULL | **Met** | Schema uses two partial unique indexes; `agentConfig.model.ts` uses `INSERT OR REPLACE`. |
| R-005 | Drop mirror; use `notes_unified` VIEW | **Met (gap)** | Mirror dropped in service; VIEW exists in schema; but `GET /:id/notes` in organizations route calls `noteModel.listFor(id, includeUnconfirmed)` — the model's `listFor` only takes one argument (no second param), silently ignoring the flag (see Bug B-03). |
| R-013 | CORS allowlist + origin check + redacting error handler | **Met** | CORS + origin check middleware in `index.ts`; `errorHandler.ts` redacts known keys. |
| R-016 | Prompt cache split + per-thread cache | **Met** | Stable/volatile split implemented; `bumpOrgVersion` exported. |
| R-021 | Tool hardening | **Met (partial)** | System prompt segment included. `max_uses` reads from `tools_enabled` JSON, but `AgentConfigSchema` defines `tools_enabled` as `z.record(z.string(), z.unknown())` while `agentConfig.model.ts` hydrates it as `string[]` — type mismatch means `buildWebSearchTool` always gets `'[]'` JSON and falls back to default 5 (see Bug B-04). |
| R-022 | Agent tool audit log | **Met** | `agent_tool_audit` table; `agentToolAuditModel` wired; every tool call logged. |
| R-014 | Migration framework | **Not applicable** | P1.5 item; not yet due. |
| R-015 | Index additions | **Not applicable** | P1.5 item. |
| R-017 | Self-host fonts | **Not applicable** | Frontend item. |
| R-018 | `:memory:` test DB | **Met** | `DB_PATH=':memory:'` supported in `database.ts`. |
| R-019 | Schema hardening | **Not applicable** | P1.5 item. |
| R-020 | Drop `crud-router` | **Met** | No `crud-router.ts` exists; routes are explicit handlers. |
| R-024 | `safePath` stub | **Met** | `lib/safePath.ts` implemented and tested. |
| R-026 | Untrusted-document wrapper | **Met** | System-prompt segment includes the `<untrusted_document>` instruction. |

---

## Bugs

### B-01 — Type mismatch: `noteModel.createInsight` signature vs service cast
**File**: `backend/src/services/claude.service.ts:137` and `backend/src/models/note.model.ts:127`  
**Severity**: High  
**Description**: The service casts `noteModel.createInsight` as `(orgId: number, content: string, provenance: string) => NoteRow` (string third arg) but the real model signature is `createInsight(targetOrgId: number, content: string, provenance: NoteProvenance)` where `NoteProvenance` is an object. The service calls it with a `JSON.stringify`-ed string (`provenance` variable built at line 764), but the model's `createInsight` immediately calls `JSON.stringify(provenance)` on whatever it receives — double-serialising the provenance into `"{\"tool\":\"record_insight\",…}"` (JSON string of a JSON string) in the database.  
**Fix**: Change the service cast (line 137) to accept `provenance: NoteProvenance` (object, not string), and pass the object directly instead of pre-stringifying it — or change the model to accept a pre-serialised string and document which layer owns serialisation, not both.

### B-02 — `warmDpapi()` never called from `index.ts`
**File**: `backend/src/index.ts` (missing call); `backend/src/models/settings.model.ts:96-104`  
**Severity**: High  
**Description**: The model comment says "Callers must warm the DPAPI module on startup by calling `warmDpapi()` before the first write; after that the in-process reference is stable." `index.ts` calls `initSchema()` but never calls `warmDpapi()`. The first `PUT /api/settings` request that tries to store `anthropic_api_key` will call `encryptSync` while `_dpapi === undefined` (not yet resolved), which falls through to the `_dpapi ?? null` no-op path and stores the key as plaintext prefixed with `enc:` on Windows instead of encrypting it.  
**Fix**: `await warmDpapi()` in `index.ts` before the `app.listen` call (requires making the startup async or using a top-level `await` in ESM).

### B-03 — `noteModel.listFor` called with two args; second arg silently ignored
**File**: `backend/src/routes/organizations.route.ts:92` and `backend/src/models/note.model.ts:92`  
**Severity**: High  
**Description**: `organizations.route.ts` line 92 calls `noteModel.listFor(id, includeUnconfirmed)`, but `listFor` is defined as `(orgId: number): Note[]` — TypeScript should catch this at typecheck, but if the project is not strict-checking routes it will silently ignore the second argument and always return all notes (including unconfirmed `agent_insight` notes) regardless of the `include_unconfirmed` query flag. The `notes_unified` VIEW is never queried from the HTTP layer; the route reads directly from `notes` via `listFor`, missing agent_messages rows entirely.  
**Fix**: (a) Expose a `listForUnified` or update `listFor` to accept the include/exclude unconfirmed flag, and have the route call `noteModel.listFor(id)` or `noteModel.listRecent(id, limit, { confirmedOnly: !includeUnconfirmed })`. (b) To get the VIEW semantics intended by R-005, the notes list endpoint must query `notes_unified`, not `notes`.

### B-04 — `tools_enabled` type mismatch: schema says `Record`, model hydrates as `string[]`
**File**: `backend/src/schemas/agentConfig.schema.ts:10`, `backend/src/models/agentConfig.model.ts:66`  
**Severity**: Medium  
**Description**: `AgentConfigSchema` declares `tools_enabled: z.record(z.string(), z.unknown())` (an object), but `agentConfig.model.ts` `hydrate()` parses `row.tools_enabled` as `string[]`. The DB stores `[]` (JSON array) by default. `buildWebSearchTool` in `claude.service.ts` receives `agentConfig.tools_enabled` which is the raw DB string `'[]'`, then tries to parse `cfg['web_search']` from `JSON.parse('[]')` which returns an array, not an object, so the property access always yields `undefined` and `max_uses` defaults to 5 — the config-driven cap is non-functional. The `upsertArchetype`/`upsertOverride` calls serialize `input.tools_enabled ?? []` as a JSON array, but the service expects a JSON object.  
**Fix**: Decide on one shape (object `{"web_search":{"max_uses":5}}` or array `["web_search"]`), update schema, model, and service to all agree.

### B-05 — `agentThreadModel.create` called with positional args; expects object input
**File**: `backend/src/routes/agents.route.ts:51,82` vs `backend/src/models/agentThread.model.ts:34`  
**Severity**: High  
**Description**: `agents.route.ts` calls `agentThreadModel.create(organization_id, title)` (positional) at line 51 and `agentThreadModel.create(orgId)` at line 82. The model's `create` signature is `create(input: AgentThreadInput): AgentThread` (object input). TypeScript will catch this at typecheck, but it will fail at runtime: `organization_id` gets assigned to `input`, and `input.organization_id` and `input.title` will be `undefined`, producing `INSERT … VALUES (undefined, undefined)`.  
**Fix**: Change both call sites to `agentThreadModel.create({ organization_id, title })` and `agentThreadModel.create({ organization_id: orgId })`.

### B-06 — Missing schema exports break agents route at import time
**File**: `backend/src/routes/agents.route.ts:9-13`, `backend/src/schemas/agentConfig.schema.ts`  
**Severity**: Critical  
**Description**: `agents.route.ts` imports `AgentThreadCreateSchema`, `AgentThreadListQuerySchema`, `AgentChatBodySchema`, and `AuditListQuerySchema` from `agentConfig.schema.ts`. None of these are defined or exported in that file (only `AgentSectionSchema`, `AgentConfigSchema`, `AgentConfigUpdateSchema`). Similarly, `settings.route.ts` imports `SettingsSetSchema` from `settings.schema.ts`, but the file only exports `SettingPutSchema` (not `SettingsSetSchema`). And `organizations.route.ts` imports `OrgNotesQuerySchema` and `OrgTypeQuerySchema` which do not exist in `organization.schema.ts`. These are fatal import errors — the backend will not start. `TaskListQuerySchema` is also imported by `tasks.route.ts` but not exported from `task.schema.ts`.  
**Fix**: Add the missing schema definitions to the relevant files, or fix the import names to match what is actually exported.

### B-07 — `agentConfigModel.listAll` and `updateById` do not exist
**File**: `backend/src/routes/agents.route.ts:22,34`, `backend/src/models/agentConfig.model.ts`  
**Severity**: Critical  
**Description**: `GET /configs` calls `agentConfigModel.listAll()` and `PUT /configs/:id` calls `agentConfigModel.updateById(id, template, tools, model)`. Neither method is defined in `agentConfig.model.ts` — the model only exports `getEffective`, `getArchetype`, `getById`, `upsertArchetype`, `upsertOverride`. Both endpoints will throw at runtime.  
**Fix**: Implement `listAll()` (returns all archetype + override rows) and `updateById(id, template, tools, model)` in `agentConfig.model.ts`.

### B-08 — `streamChat` persists user message before validating org/thread; orphaned rows on error
**File**: `backend/src/services/claude.service.ts:503`  
**Severity**: Medium  
**Description**: `agentMessageModel.append(threadId, 'user', content)` is called at step 1 before the org existence check (step 2) and before the agent config check. If the org does not exist or has no config, the user message is already written to `agent_messages` and `touchLastMessage` is never called, leaving a dangling row. The route handler does the org check before calling `streamChat`, so this is defence-in-depth for the case where `streamChat` is called from other contexts.  
**Fix**: Move the `append(user)` call to after the org and config validation, or ensure the org guard in the route is the only entry point.

### B-09 — `resolveAllowlist` direct `db` import violates layer rules
**File**: `backend/src/services/claude.service.ts:366-399`  
**Severity**: Low  
**Description**: `resolveAllowlist` dynamically imports `db` from `../db/database.js` and executes raw SQL directly in the service layer — violating the layer rule "models own prepared SQL statements; services call models". The comment acknowledges this. This is a code smell and a testing friction point.  
**Fix**: Add `noteMentionModel.listMentionedOrgsForOrg(orgId, limit)` and `organizationModel.listAll()` to their respective models and call them from the service.

---

## Security

### S-01 — `org_id` in `POST /agents/:org_id/chat` not cross-validated against thread at allowlist build time
**File**: `backend/src/routes/agents.route.ts:87`, `backend/src/services/claude.service.ts:546-547`  
**Severity**: Medium  
**Description**: The route correctly validates that `thread.organization_id === orgId`. However, the allowlist is built from `orgId` (the route param), not from the thread's stored `organization_id`. If the check order were ever changed, a crafted request could supply a different `orgId` in the URL to widen the allowlist while targeting a thread belonging to another org.  
**Fix**: Acceptable as-is given the guard exists. Document the dependency ordering explicitly.

### S-02 — Anthropic error messages logged via `sse.send({ type: 'error', message })` may expose internal error detail
**File**: `backend/src/services/claude.service.ts:677-679`  
**Severity**: Medium  
**Description**: The catch block sends `err.message` directly to the SSE stream. For Anthropic SDK errors, the message can include information about rate limits, model availability, or partial context. While this is a single-user app, it is still worth noting that error messages flow to the browser.  
**Fix**: For `isAnthropicError(err)`, send a generic "Anthropic API error" message to the SSE stream; log the detail server-side only.

### S-03 — CORS origin check uses `req.get('referer')` as fallback
**File**: `backend/src/index.ts:46`  
**Severity**: Low  
**Description**: `Referer` headers are user-controlled and can be spoofed or omitted. The belt-and-braces check treats a missing origin as permitted (for curl/same-origin), which is acceptable for a loopback-only app; but the referer fallback can be bypassed by simply not sending it, which is the same as the "missing origin" path. The CORS middleware already handles the real cross-origin case, so this middleware is redundant for browsers (browsers always send Origin on cross-origin POST) but misleading because it suggests the referer check adds security.  
**Fix**: Remove the referer fallback. Keep origin-check middleware but only act on `Origin` header.

### S-04 — `settingsModel.remove` not protected against deleting secrets
**File**: `backend/src/routes/settings.route.ts:26-33`  
**Severity**: Low  
**Description**: `DELETE /api/settings/:key` with `key=anthropic_api_key` hard-deletes the API key. This is fine for tile-layout resets but silently allows deleting the API key via an HTTP call.  
**Fix**: In the route, reject `DELETE` on keys in `SECRET_KEYS`.

---

## Performance

### P-01 — `noteModel.listFor` fetches all notes with no limit
**File**: `backend/src/models/note.model.ts:92`, `backend/src/routes/organizations.route.ts:92`  
**Severity**: Medium  
**Description**: `listFor` uses `SELECT * FROM notes WHERE organization_id = ?` with no `LIMIT`. The route does `.slice(0, q.limit ?? 20)` in application memory. This means SQLite loads all N notes for an org then Node discards all but 20. As the note table grows this becomes an unbounded read.  
**Fix**: Push the limit into the SQL statement, or replace the route's use of `listFor` with `listRecent` which already takes a limit.

### P-02 — `resolveAllowlist` builds two unprepared statements on every chat turn
**File**: `backend/src/services/claude.service.ts:372,383`  
**Severity**: Low  
**Description**: `db.prepare('SELECT id, name FROM organizations').all()` and the `note_mentions` join are created as new `Statement` objects on every call to `resolveAllowlist`. `better-sqlite3` statements should be prepared once (module scope) and reused. Per-call prepare is a minor but unnecessary allocation.  
**Fix**: Move both statements to module-level constants (or add model methods as noted in S-01-fix).

### P-03 — `threadCache` never expires orphaned entries for deleted threads
**File**: `backend/src/services/claude.service.ts:207`  
**Severity**: Low  
**Description**: `threadCache` is a `Map<number, ThreadCacheEntry>` that grows without bound. When a thread is deleted (cascade from org delete), the in-process map retains the entry forever. For a single-user app with few threads this is negligible, but the map could accumulate thousands of stale entries in long-running sessions.  
**Fix**: Either clear the entry in `agentThreadModel.remove` (call a `clearThreadCache(id)` export from the service), or implement a simple LRU eviction on the map with a maximum entry count.

### P-04 — `notes_unified` VIEW not used by the HTTP notes endpoint
**File**: `backend/src/routes/organizations.route.ts:92`; schema VIEW exists  
**Severity**: Medium  
**Description**: R-005 says the notes feed should read from `notes_unified`, but `GET /:id/notes` reads from `notes` via `listFor`. This means assistant turns (stored in `agent_messages`) never appear in the notes feed. The VIEW exists in the schema but no model method queries it.  
**Fix**: Add `noteModel.listUnified(orgId, limit, { confirmedOnly })` backed by the `notes_unified` VIEW and wire the route to call it.

---

## Consistency / Style

### C-01 — `OrgType` in `organization.model.ts` includes `'agent'`; schema and other types do not
**File**: `backend/src/models/organization.model.ts:3`  
**Severity**: High  
**Description**: `OrgType` is `'customer' | 'agent' | 'oem'`. The schema `CHECK(type IN ('customer', 'oem'))` does not include `'agent'`. `organization.schema.ts` `OrgTypeSchema` is `z.enum(['customer', 'oem'])`. CLAUDE.md explicitly states "No `agent` org type — 'agent' in this app means AI agent only." Any code calling `organizationModel.listByType('agent')` will silently get an empty array, but the type definition misleads future developers.  
**Fix**: Remove `'agent'` from `OrgType` in `organization.model.ts`.

### C-02 — `claude.service.ts` casts `noteModel.createInsight` as returning `NoteRow` (private interface), not `Note` (public interface)
**File**: `backend/src/services/claude.service.ts:137`  
**Severity**: Low  
**Description**: The lazy-model cast uses the local `NoteRow` interface (the raw DB shape, with `confirmed: number`) rather than `Note` (the hydrated shape, with `confirmed: boolean`). The actual model returns a `Note`. The usage at line 777 accesses `note.id` which exists on both, so it does not cause a runtime error, but the cast is misleading.  
**Fix**: Change the cast to use `Note` and update the interface references accordingly.

### C-03 — `AgentConfigUpdateSchema` allows all fields optional; `PUT /configs/:id` handler treats them as required
**File**: `backend/src/schemas/agentConfig.schema.ts:16-20`, `backend/src/routes/agents.route.ts:29-36`  
**Severity**: Low  
**Description**: The schema marks `system_prompt_template`, `tools_enabled`, and `model` all `.optional()`. The route handler destructures them and passes them directly to `agentConfigModel.updateById`, which is expected to do a full replace. If a partial update is submitted (only `model`), `system_prompt_template` will be `undefined` and the model call will corrupt the row unless `updateById` handles partial patches. Since `updateById` is not yet implemented (Bug B-07), this is secondary but should be resolved when implementing the method.  
**Fix**: Either make all fields required in `AgentConfigUpdateSchema`, or ensure `updateById` does a read-modify-write patch.

### C-04 — `OrganizationUpdateSchema` makes `name` optional; route handler passes `name ?? {}` but `metadata` required
**File**: `backend/src/schemas/organization.schema.ts:29-32`, `backend/src/routes/organizations.route.ts:45-48`  
**Severity**: Low  
**Description**: `OrganizationUpdateSchema` marks `name` as optional but the route does `organizationModel.update(id, name, metadata ?? {})` where `name` could be `undefined`. `updateStmt` runs `UPDATE … SET name = ?` with `undefined`, which SQLite's better-sqlite3 will convert to `NULL`, clearing the org name.  
**Fix**: Validate that `name` is present, or do a read-modify-write like the contact and project update paths.

### C-05 — `TaskUpdateSchema` includes `organization_id` and `contact_id` but `taskModel.update` ignores them
**File**: `backend/src/schemas/task.schema.ts:24-30`, `backend/src/models/task.model.ts:99-108`  
**Severity**: Low  
**Description**: `TaskUpdateSchema` exposes `organization_id` and `contact_id` as patchable fields. `taskModel.update` maps to `updateStmt` which only updates `title`, `due_date`, and `status`. The org/contact fields are accepted by the schema, passed to the model, and silently discarded. This is either a missing feature or a leaked schema field.  
**Fix**: Either drop `organization_id` and `contact_id` from `TaskUpdateSchema`, or extend `updateStmt` to include them with cross-org FK consistency check (per R-019).

### C-06 — `settings.route.ts` uses `SettingsSetSchema` but the file only exports `SettingPutSchema`
**File**: `backend/src/routes/settings.route.ts:3`, `backend/src/schemas/settings.schema.ts`  
**Severity**: Critical  
**Description**: Part of Bug B-06. Import name mismatch. The schema file does not export `SettingsSetSchema`.

### C-07 — `bumpOrgVersion` not called after document delete
**File**: `backend/src/routes/documents.route.ts:24-34`  
**Severity**: Low  
**Description**: `DELETE /api/documents/:id` calls `bumpOrgVersion(existing.organization_id)` — actually this IS present (line 32). But `noteModel.createInsight` (called by the service) does not call `bumpOrgVersion`. Since an insight changes the org's note context, the stable block cache should be invalidated.  
**Fix**: Add `bumpOrgVersion(targetOrgId)` call after `noteModel.createInsight` succeeds in `handleRecordInsight` (claude.service.ts line 772).

---

## Test gaps

- `agentConfig.model.ts` — `listAll()` and `updateById()` have no tests (and no implementation); the route-level test stubs around them.
- `organizations.route.ts` — `PUT /:id` with partial body (`name` omitted) is not tested; the null-name bug (C-04) is not covered.
- `tasks.route.ts` — the `PUT /:id` with `organization_id`/`contact_id` being silently ignored is not tested.
- `notes.route.ts` — the `POST /` endpoint does not test that `bumpOrgVersion` is called; confirm/reject endpoints have no tests in the route file (only indirectly via claude.service tests).
- `noteModel.listFor` called with a second argument (silently ignored) is not caught by any existing test.
- `warmDpapi()` not called at startup — the race condition window (first write before warm resolves) is untested.
- `resolveAllowlist` — the `note_mentions` LIMIT 50 boundary is untested; behaviour when `note_mentions` table is empty but the current org has no name is not covered.
- `streamChat` error path when the Anthropic stream throws after partial text has been sent is not tested; the `sse.end()` called in the catch block (line 679) combined with the unconditional `sse.end()` at line 703 could produce a double `res.end()` depending on error timing — not tested.
- `safePath.ts` — `enforceSizeLimit` is untested; the ancestry-walk race condition (TOCTOU between `realpathSync` and `lstatSync`) is untested (acceptable).
- `contact.model.ts` — `update` with an entirely empty patch object (`{}`) is not tested; no test verifies that `bumpOrgVersion` is called by the route after contact update (only contact create is tested).
- `agentMessage.model.ts` — the dual-signature `append` overload is not tested directly; only tested through integration.
- `settings.route.ts` — `DELETE /:key` on a secret key (anthropic_api_key) is not tested.
- `notes_unified` VIEW is not queried from any tested code path; its correctness is untested.

---

## Verdict

The backend's security-critical P0 items (R-001 through R-005) are largely addressed, and the code quality is generally high — prepared statements are used consistently, zod validation is wired on all mutating endpoints, the SSE pattern is clean, and the DPAPI integration is well-structured. However, the codebase has **multiple fatal import-time errors** (B-06, B-07) that prevent the backend from starting: `agents.route.ts` imports four schema names and two model methods that do not exist. These, combined with the type-level mismatch between `noteModel.createInsight`'s actual object argument and the service's string cast (B-01), mean the current code cannot pass typecheck or run correctly. Additionally, the `notes_unified` VIEW — the centrepiece of R-005 — is never actually queried by the HTTP layer (P-04/B-03), so the notes feed never shows agent turns.

**Top 5 must-fix before ship:**

1. **B-06** — Add the missing schema exports (`AgentThreadCreateSchema`, `AgentChatBodySchema`, `AgentThreadListQuerySchema`, `AuditListQuerySchema`, `OrgTypeQuerySchema`, `OrgNotesQuerySchema`, `SettingsSetSchema`, `TaskListQuerySchema`). Backend will not start without these.
2. **B-07** — Implement `agentConfigModel.listAll()` and `agentConfigModel.updateById()`. Two agent config routes are dead without them.
3. **B-05** — Fix `agentThreadModel.create` call sites in `agents.route.ts` (lines 51, 82) to pass an object input, not positional args.
4. **B-01** — Resolve the `noteModel.createInsight` signature mismatch: the service pre-serialises provenance to a string, the model serialises again. Fix one end.
5. **B-03 / P-04** — Wire `GET /:id/notes` to query `notes_unified` VIEW (or at minimum fix the second-argument `listFor` call that silently ignores the `include_unconfirmed` flag).
