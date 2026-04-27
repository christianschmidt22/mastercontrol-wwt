# Follow-up Items

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
