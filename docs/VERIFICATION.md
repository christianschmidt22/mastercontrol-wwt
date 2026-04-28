# Phase 1 Verification

**Status**: Phase 1 is feature-complete in code. Verification (typecheck, lint, test, dev-server smoke) has not been run from this branch — Node.js wasn't available in the sandboxed shell that produced the commits. The instructions below are what to run on any machine with Node 18.18+.

## One-time setup

Required:
- Node.js **18.18+** ([download](https://nodejs.org/))
- Claude Code authenticated with `claude /login` for the recommended
  subscription/Enterprise path.
- Optional fallback: an Anthropic API key, configured in Settings only if
  you want to force metered API billing.
- Windows recommended (DPAPI integration); macOS/Linux works with the no-op encryption fallback documented in `backend/src/models/settings.model.ts`

```bash
# From the repo root
npm install            # installs both backend and frontend workspaces
```

## Backend verification

```bash
npm run typecheck -w backend     # tsc --noEmit, expect 0 errors
npm run lint -w backend          # if eslint configured, expect clean
npm run test -w backend          # vitest run, expect all green
```

What the backend tests cover:
- **Models** — `organization`, `settings` (round 1) plus `agentConfig`, `note`, `task` (round 4 fill).
- **Lib** — `safePath`, `sse`, `validate` (round 4 fill).
- **Middleware** — `errorHandler` redactor (round 4 fill).
- **Routes** — every route group has a `*.route.test.ts` covering happy-path CRUD, zod rejection, cascade-delete, and the chat SSE path (Anthropic SDK mocked).
- **Services** — `claude.service.ts` covers allowlist resolution, cache versioning, audit logging, no-mirror-to-notes, and the SSE protocol shape.

Test infrastructure:
- `:memory:` SQLite per process + `SAVEPOINT t` / `ROLLBACK TO t` per test (R-018) — sub-second suite even at 100+ tests.
- Anthropic SDK mocked via `vi.mock('@anthropic-ai/sdk', …)`.

## Frontend verification

```bash
npm run typecheck -w frontend    # tsc --noEmit, expect 0 errors
npm run lint -w frontend         # eslint, expect clean
npm run test -w frontend         # vitest run
```

What the frontend tests cover:
- `streamChat.test.ts` — happy multi-chunk path, tool_use frame dispatch, mid-stream abort, payload buffering across reader-chunk boundaries.
- `useStreamChat.test.tsx` — `renderHook` + `QueryClientProvider`; happy path, abort path, failure path, retry path.
- `http.test.ts` — fetch wrapper happy / 4xx / 5xx / network error.

Frontend test infra:
- jsdom environment, `@testing-library/react` + `jest-dom` + `user-event`.
- `@vitejs/plugin-react` plugin in `vitest.config.ts` so `.tsx` JSX compiles.

## Manual browser smoke test

```bash
npm run dev    # backend on :3001, frontend on :5173 (both bound to 127.0.0.1 — R-001)
```

Open `http://localhost:5173` and exercise:

1. **Settings**: set **Core Claude Authentication** to **Claude Code login** after `claude /login`. If testing the fallback path, paste an Anthropic API key; after save, GET should display `***last4` (DPAPI-encrypted on Windows; no-op fallback on other platforms).
2. **Sidebar `+ Add customer`**: create a customer "Fairview Health". It appears in the sidebar.
3. **Customer page**: open Fairview. The 7-tile dashboard renders in default layout (Chat / Priority Projects / Tasks / Recent Notes / Contacts / Reference / Documents).
4. **Customize layout**: click the button. Tiles get the dashed accent border + drag-grip + resize handle. Drag a tile, resize a tile, then **press Tab to a tile and use the keyboard "Move tile" affordance** — `Enter` activates move mode, arrow keys move, `Esc` cancels. Save. Refresh — layout persists.
5. **Chat**: send "summarize what you know about Fairview". Watch tokens stream in with the vermilion typewriter caret. Mid-stream, hit the Stop button — partial text is retained per DESIGN.md § States.
6. **Insights**: in the same chat, ask "what should I follow up with the Cisco channel team about?" — the agent may call `record_insight` to record an insight on Cisco. Open Cisco's page (after creating it as an OEM); the insight should appear with a vermilion dot and an inline `Accept` / `Dismiss` bar.
7. **Tasks**: open the Tasks page. Add "Email Sarah Tuesday" with a due date. Verify URL filters update on chip changes (Vercel rule).
8. **OEM**: open OEM page. Tab between OEMs. Each tab shows its dashboard (Account & Channel team, Quick Links, Chat, Project documentation placeholder).
9. **Theme**: cycle the ThemeToggle between system / dark / light.

## Known limitations (Phase 1)

These are intentional Phase 2 deferrals, not bugs:

- **Project documentation tile (OEM page)**: empty state "Coming Phase 2" — OneDrive folder ingest lands with the Phase 2 ingest pipeline.
- **Reports page**: placeholder "Coming Phase 2".
- **WorkVault note ingestion**: Phase 1 stores notes as DB rows only. Phase 2 adds the markdown round-trip + mtime-wins reconciliation per `docs/plans/phase-2.md`.
- **Mention auto-tagging**: cross-org mentions in `note_mentions` aren't populated automatically — Phase 2 work.
- **Phase 2 agent tools** (`search_notes`, `list_documents`, `read_document`, `create_task`): not wired; Phase 1 ships only `web_search` + `record_insight`.
- **Scheduler**: in-process only; no missed-job catch-up; no Windows Task Scheduler hookup. Phase 2 plan locks the Task Scheduler-only architecture (see `docs/adr/0004-task-scheduler-not-windows-service.md`).

## Reference: audit findings + resolution

- `docs/REVIEW.md` — original 5-agent pre-implementation review (29 items R-001…R-029).
- `docs/BACKEND-AUDIT.md` — pre-ship code audit; resolutions in commit `8db441f`.
- `docs/FRONTEND-AUDIT.md` — pre-ship a11y + frontend audit; resolutions in commit `8db441f`.

## Phase 2 prep

When Phase 1 verification is green and you're ready for Phase 2, see:
- `docs/plans/phase-2.md` — full implementation plan
- `docs/adr/0004-task-scheduler-not-windows-service.md` — locked scheduler decision
- `docs/PRD.md § Open Questions` — Q-3 RESOLVED, all others closed
