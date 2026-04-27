# Follow-up Items

## OEM seed data missing

`backend/src/db/migrations/009_seed_demo_orgs.sql` seeds two customer orgs
(Fairview Health Services and CHR) but no OEM orgs. The OEM page renders
correctly when zero OEMs exist (shows the "No OEM partners yet" empty state),
but to demo the new `OemPageHeader` and `OemCrossRefsPanel` components a
migration is needed that inserts at least one OEM organization (e.g. Cisco,
NetApp, or Nutanix) with:

- `type = 'oem'`
- `metadata` containing `summary` and optionally `partner_status` (`idle` /
  `active` / `strategic`)
- A few contacts (`role = 'channel'`)
- At least one `agent_insight` note whose `organization_id` is a **customer**
  org and whose content mentions the OEM by name — this will surface in the
  `OemCrossRefsPanel` via
  `GET /api/notes/cross-org-insights?org_id=<oem_id>`.

Avoid migration 011 (sibling agent owns that slot). Use migration 012 or
higher, or add OEM rows to an existing seed migration once the dust settles.
