# MasterControl Handoff

Last updated: 2026-04-28

## Current State

The customer/OEM workspace polish is complete on
`codex/customer-oem-tabs-layout`.

Shipped code commits:

- `9003e81 feat(ui): align customer and oem workspaces`
- `8d7a237 fix(ui): refine tabs and project editing`

Validation completed on the branch:

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- Browser smoke on `http://127.0.0.1:5173/oem`
- Browser smoke on a C.H. Robinson project tab

Known local-only working tree noise to preserve:

- `.claude/settings.local.json`
- `C:mastercontrol.claudelaunch.json`

Do not stage those unless the user explicitly asks.

## What Changed

- Customer pages now have a Home tab and one tab per project.
- Project tabs expose an editable project-specific header note and editable
  project fields for name, status, description, and folder.
- The left rail pins C.H. Robinson first and Fairview second, then sorts the
  remaining customers by name.
- OEM is a single left-rail entry with in-page tabs under the selected OEM
  name.
- OEM tabs wrap instead of showing the small scroll control. Dell and Pure
  are shortened; all other OEM labels are spelled out.
- OEM top header buttons were removed.
- Tile layout customization persists and supports resizing during customize
  mode.

## Remaining TODO

1. Persist full customer sidebar ordering with drag-to-reorder.
2. Split project header notes from `projects.notes_url` if the product needs
   both a freeform note and a document/link field.
3. Add focused route tests for customer project editing and OEM tab labels.
4. Wire the visible Add customer affordance to a real create flow.
5. Verify narrow/mobile layouts for wrapped tabs and project editing.
6. Reconcile this branch with any parallel work in
   `claude/pensive-taussig-e04a99` before landing both.

