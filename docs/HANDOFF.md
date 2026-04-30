# MasterControl Handoff

Last updated: 2026-04-29 (session 3 — Phase 2 closeout)

## Current State

Phase 1 + Phase 2 closed. Phase 2 verification checklist 13/15 items
ticked off (the 2 remaining are WorkVault wiring, explicitly deferred).
Main is on the green path: typecheck, lint, and 999 tests pass.

Phase 3 plan written at [`docs/plans/phase-3.md`](plans/phase-3.md):
Outlook integration, vault writeback, FTS5, in-app markdown viewer,
extraction settings, OEM `onedrive_folder` UI, visual design pass.

Known local-only working tree noise to preserve:

- `.claude/settings.local.json`

Do not stage that unless the user explicitly asks. (The earlier
`C:mastercontrol.claudelaunch.json` artifact was deleted in session 3.)

## What Changed

- Customer pages have a Home tab and one tab per project.
- Project tabs expose editable project fields and now include a note tile
  that captures notes with customer and project context.
- OEM is a single left-rail entry with in-page tabs under the selected OEM
  name. The old top buttons and "OEM Partners" eyebrow are gone.
- OEM top notes are editable inline and persist to the selected OEM's
  `metadata.summary`.
- Customer sidebar ordering pins C.H. Robinson first and Fairview second,
  then sorts remaining customers by name.
- Live note capture writes markdown through `/api/notes/capture` into scoped
  `_notes/<year>` folders and indexes the row in SQLite.
- Captured notes create initial `note_proposals` rows. The Home page has a
  Note Approvals tile with detail modal and Approve / Deny / Discuss actions.
- M365 calendar syncs from an ICS subscription URL (DPAPI-encrypted in
  settings as `calendar_ics_url`). Events cached in `calendar_events` table,
  synced at boot + 06:00/12:00/17:00. Today's Agenda tile on Home page.
- System alert log (`system_alerts` table). Background job failures call
  `logAlert()` so they surface in the UI rather than fail silently. Bell icon
  (top-right of every page) shows badge + dismissable panel.
- "Priority Projects" tile renamed to **"Open Projects"**; now shows active,
  qualifying, and paused projects (paused in amber). Folder button always
  visible. "All projects" modal accessible from the tile header.
- Customer page tabs only show active and qualifying projects; paused/closed
  reachable via the "All projects" modal.

## Validation

- `npm run typecheck -w backend`
- `npm run typecheck -w frontend`
- `npm run lint -w backend`
- `npm run lint -w frontend`
- `npm run test -w backend -- notes.route.test.ts`
- `npm run test -w frontend -- RecentNotesTile.test.tsx`
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- Browser smoke on Home and a C.H. Robinson project tab at
  `http://127.0.0.1:5173`

Browser console errors: none during smoke.

## What Changed (session 2)

- `018_project_tasks_and_resources.sql`: `project_id` FK on `tasks`;
  new `project_resources` table.
- `task.model.ts` + `task.schema.ts` + `tasks.route.ts`: full project_id support.
- `projectResource.model.ts` + `projectResource.schema.ts` +
  `projectResources.route.ts`: CRUD under `/api/projects/:projectId/resources`.
- `noteProposal.model.ts`: added `internal_resource` proposal type.
- `claude.service.ts`: added `internal_resource` to extraction tool enum +
  system prompt description.
- `noteProposal.service.ts`: `task_follow_up` approval passes project_id;
  `internal_resource` approval creates `project_resources` row.
- Frontend: `ProjectResource` type, `useProjectResources` hook,
  `ProjectNextStepsTile`, `ProjectResourcesTile`, both wired into `ProjectPage`.

## What Changed (session 3 — Phase 2 closeout)

Note proposal pipeline overhaul:
- `note_proposals.contact_id` (migration 020) records which person a
  proposal is tied to; the model is given the org's known contacts and
  resolves names → ids during extraction.
- `customer_ask` role on notes (migration 021): queryable internal memory
  for the agents but filtered out of Recent Notes feed and the volatile
  context block. `search_notes` still finds them.
- Tightened extraction prompt; dropped `risk_blocker` and
  `customer_insight` types entirely; `task_follow_up` defaults due_date
  to +7 days when none is in the note.
- "Redo with feedback" — `POST /api/notes/proposals/:id/revise`
  regenerates the proposal in-place using user feedback. Returns 204 if
  the model decides nothing should remain.

Task UX unified:
- `TaskEditDialog` modal used everywhere; clicking the row opens the
  dialog, checkbox alone toggles complete. Replaced inline expand/edit
  on TasksPage. Same pattern in TasksTile, ProjectNextStepsTile, and
  the Home page Today's Tasks tile (renamed to just "Tasks").

Master notes:
- New `master_notes` table (migration 022). One free-form markdown blob
  per (org, optional project) with debounced autosave. Mirrors to a
  vault file. "Process now" button feeds content through the extraction
  pipeline.
- Hourly external-edit scanner (`scanExternalMasterNoteEdits`) detects
  when an external editor wrote to the file and re-runs extraction.

Backlog:
- New `backlog_items` table (migration 023). MasterControl-meta backlog
  for tracking features/changes to this app itself. `BacklogTile`
  replaced Agent Insights on the Home page.

Tile system + project page:
- Replaced custom `@dnd-kit/sortable` grid with `react-grid-layout` —
  resize now pushes other tiles down instead of overlapping.
- Project page redesign: drop the redundant name/description form (now
  in gear popover); WWT Resources moved to a popover button between
  Folder and Settings; Customize Layout button moved to fixed top-right
  toolbar across customer/project/OEM pages, icon-only.

Themes:
- Five named theme variants (pine/moss/carbon/oxblood/ridge) + Verdant
  (deep emerald with darker tile/sidebar surface). `--surface` CSS var
  lets themes lift tiles + sidebar off the page bg.
- Sidebar theme toggle removed; theme is set from Settings.

Brand:
- Red MCP-face favicon at `/brand/favicon-mcp.png`.
- Green MCP-face beside the sidebar title.

Phase 2 closeout:
- Failed report runs raise system alerts via `logAlert` so the bell
  surfaces them. ReportsPage history rows render failed status pills in
  accent color with inline error preview.
- `errorHandler.ts` exposes `redactError`; `systemAlert.model.ts`'s
  last-resort `console.error` runs `dbErr` through it (R-013 compliance).
- `runReport` early-failure paths (schedule-not-found,
  report-not-found) raise `severity='error'` alerts.
- Shared `StatusPill` primitive at `frontend/src/components/shared/`,
  used in ReportsPage, CustomerPage, PriorityProjectsTile.
- `docs/CHANGELOG.md` Phase 2 closeout section; `docs/plans/phase-2.md`
  verification checklist ticked.

## Remaining TODO

Carried over from session 2:
1. ~~Discuss workflow with re-extraction~~ — DONE via "Redo with feedback".
2. Make Approve merge or update an existing record when a very similar
   one already exists (e.g. a duplicate task_follow_up) instead of
   always inserting a new row.
3. ~~Historical WorkVault snapshot ingest~~ — explicitly deferred per
   user direction; pipeline exists, no `ingest_sources` row pointing at
   WorkVault.
4. Add data-source configuration for recall priority: current org/OEM
   notes, all local notes, configured local/team sources, then future
   web or browser-backed OEM sources.
5. Persist full customer sidebar ordering with drag-to-reorder.
6. ~~Split project header notes from `projects.notes_url`~~ — `master_notes`
   table now provides the freeform note surface; `projects.notes_url`
   stays as the document/link field.
7. ~~Focused route tests~~ — coverage expanded across the session;
   backend 576 tests, frontend 423.
8. Verify narrow/mobile layouts for wrapped tabs, project editing, and
   the Note Approvals modal.
9. ~~Reconcile parallel worktrees~~ — workstream agents shipped via
   isolated worktrees + clean merges this session.
10. Global Tasks page: show project label badge when `task.project_id`
    is set.

New from Phase 2 cleanup observations (Phase 3 carry-overs):
11. `reportRunModel.create` "insert ignored but no existing row found"
    path throws a bare Error — would benefit from `logAlert`.
12. Visual review of the Cleanup A `StatusPill` color harmonization
    (Reports run-status pills + Priority Projects status pills moved
    from monochrome ink-2 to the canonical green/blue/amber/accent
    palette). Either accept or revert.

Phase 3 (planned, not yet started — see [`docs/plans/phase-3.md`](plans/phase-3.md)):
13. Outlook integration (delegated auth, sync, per-org messages tile).
14. Vault writeback for org notes — generic mirror pattern extracted
    from master notes, applied to every captured note.
15. FTS5 for `search_notes`.
16. In-app markdown viewer for report outputs + master-note preview.
17. Mention-extraction model + threshold as runtime settings.
18. OEM `onedrive_folder` dedicated UI input.
19. Visual design pass against the design skills (no layout changes).
