# MasterControl Handoff

Last updated: 2026-04-28

## Current State

Main now includes the customer/OEM workspace polish and the first notes
manager setup slice.

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

## Remaining TODO

1. Implement real LLM extraction for note proposals: customer asks,
   tasks/follow-ups, project updates, risks/blockers, OEM mentions, and
   customer insights.
2. Make Approve create or update the target durable record instead of only
   changing proposal status.
3. Add the Discuss workflow to chat with the source/evidence and revise the
   proposed record before approval.
4. Build historical WorkVault snapshot ingest from a copied source tree,
   leaving the existing WorkVault untouched.
5. Add data-source configuration for recall priority: current org/OEM notes,
   all local notes, configured local/team sources such as HPT, then future web
   or browser-backed OEM sources.
6. Persist full customer sidebar ordering with drag-to-reorder.
7. Split project header notes from `projects.notes_url` if the product needs
   both a freeform note and a document/link field.
8. Add focused route tests for customer project editing and OEM tab labels.
9. Verify narrow/mobile layouts for wrapped tabs, project editing, and the
   Note Approvals modal.
10. Reconcile any active parallel work in `.claude/worktrees/` before landing
    both branches.
