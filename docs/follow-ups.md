# Follow-up Items

## Customer/OEM workspace handoff

Shipped in `codex/customer-oem-tabs-layout` and merged from commit
`8d7a237` plus the docs handoff commit:

- Customers are pinned in the left rail as C.H. Robinson, Fairview, then
  the rest alphabetically. Full drag-to-reorder/sidebar-order persistence is
  still open.
- Customer pages have Home plus project tabs. The header note field is
  project-specific on project tabs and customer-summary-specific on Home.
- Project pages now edit project name, status, description, and folder.
  The header note currently persists through the existing `projects.notes_url`
  field, used as a freeform note field. If "notes" becomes a real document
  link later, split this into a dedicated `project_notes` or
  `project_summary` column before adding richer note semantics.
- OEM is one sidebar entry with tabs under the OEM name. The old top header
  Edit / Chat / New note buttons are removed from OEM pages.
- OEM tab labels wrap with full names except Dell and Pure, by product
  request.

Open items for the next agent:

1. Add real drag-to-reorder for the customer sidebar, backed by a persisted
   ordering setting or `organizations.metadata.sidebar_order`.
2. Decide whether project header notes should stay on `projects.notes_url` or
   get a dedicated schema field. Do this before notes/file-link behavior gets
   more complex.
3. Add regression tests around `CustomerPage` project editing and
   `OemPage` tab label formatting; current validation is full-suite plus
   browser smoke, but these route pages do not yet have focused tests.
4. Wire visible "Add customer" and any future customer/order editor to actual
   mutations; the button is still a placeholder affordance.
5. Revisit mobile/narrow layouts for the project edit form and wrapped OEM
   tabs. Desktop browser smoke is good; mobile was not separately verified.
6. If the next agent lands the parallel `claude/pensive-taussig-e04a99`
   contact seed work, reconcile seed data with the pinned customer order and
   project tab assumptions before merging.

## ~~OEM seed data missing~~ — DONE in `0b4d486`

Migration `012_seed_oem_partners.sql` seeds Cisco / NetApp / Nutanix with
contacts, projects, documents, notes (incl. one unconfirmed
`agent_insight`), threads, and two `note_mentions` rows wiring existing
customer notes to the OEM cross-refs panel.

## HomePage enrichment widgets

Backend endpoints `GET /api/notes/recent?limit=N` and
`GET /api/organizations/recent?limit=N` shipped in `74d98eb` with full
zod + integration test coverage; the consuming frontend widgets
(`RecentChatterWidget`, `OrgQuickJumpWidget`) and the `useRecentNotes` /
`useRecentOrgs` hooks were deferred when Job J hit max_iterations. The
endpoint shapes are stable — see `backend/src/schemas/note.schema.ts`
and `backend/src/schemas/organization.schema.ts` for the response
contracts. Pick this up when the home page gets its next polish pass.

## Sidebar last-touched: query duplication

The Sidebar uses `GET /api/organizations/last-touched?type=customer|oem`
which returns `{ [orgId]: ISO }`. The HomePage consumer would want
`GET /api/organizations/recent` which returns the same data plus name
+ type + sort order. Both endpoints are wired and tested; if the home
page widgets land they could share one source. Not worth consolidating
until a real consumer ships.

## Personal usage tile & savings tracker — present but not surfaced

`frontend/src/components/agents/PersonalUsageTile.tsx` and the savings
tracker on the Delegate console (commits `09f2fa2`, `d2c8567`) are
fully wired. The Delegate Console renders them. If we add a "Usage"
sub-section to AgentsPage or a HomePage widget, that component is
ready to drop in.

## CSV export, CRM sync, reports schedule editor

Phase 2 scope — see `docs/PRD.md` and `docs/plans/`.
