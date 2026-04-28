# MasterControl Handoff

Last updated: 2026-04-28 (session 2)

## Current State

Main includes the customer/OEM workspace polish, the first notes manager
setup slice, the LLM extraction + approval engine, and the Open Projects
tile / tab filter changes.

Known local-only working tree noise to preserve:

- `.claude/settings.local.json`
- `C:mastercontrol.claudelaunch.json`

Do not stage those unless the user explicitly asks.

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

## Remaining TODO

1. Add the Discuss workflow — store user discussion, optionally re-run
   extraction with user guidance, keep original evidence linked.
   Currently `discussing` status saves a text comment but no re-extraction.
2. Make Approve merge or update an existing record when a very similar one
   already exists (e.g. a duplicate task_follow_up) instead of always
   inserting a new row.
3. Build historical WorkVault snapshot ingest from a copied source tree,
   leaving the existing WorkVault untouched. Apply same extraction/approval
   pipeline as live notes.
4. Add data-source configuration for recall priority: current org/OEM notes,
   all local notes, configured local/team sources such as HPT, then future web
   or browser-backed OEM sources.
5. Persist full customer sidebar ordering with drag-to-reorder.
6. Split project header notes from `projects.notes_url` if the product needs
   both a freeform note and a document/link field.
7. Add focused route tests for customer project editing, OEM tab labels, and
   the new projectResources route.
8. Verify narrow/mobile layouts for wrapped tabs, project editing, and the
   Note Approvals modal.
9. Reconcile any active parallel work in `.claude/worktrees/` before landing
   both branches.
10. Global Tasks page: show project label badge when `task.project_id` is set.
