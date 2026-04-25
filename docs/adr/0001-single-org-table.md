# ADR-0001: Single `organizations` table with type discriminator

**Status**: Accepted
**Date**: 2026-04-25

---

## Context

The initial scaffold defined separate tables for each org type: `customers`,
`agents`, and `oems`. Every FK from `contacts`, `notes`, `projects`, etc. was
a polymorphic pair (`entity_type TEXT, entity_id INTEGER`) rather than a plain
FK to one table. The models that were written against this schema used a single
`organizations` table with a `type` column instead — a mismatch that would have
caused runtime failures on the first query.

The question was whether to reconcile by writing separate tables (each with its
own FK targets) or by formalizing the single-table layout the models already
assumed.

**Option A — Separate tables per org type**
`customers(id, name, industry, …)`, `oems(id, name, partner_level, …)`.
Child tables carry a FK to the specific parent. Schema is self-documenting
for each type; no `type` column needed.

Downside: every query joining across types (e.g., "all orgs mentioned in a
note") requires a UNION. Agent context-building must union across tables.
The mention-graph (`note_mentions`) would need polymorphic FKs or per-type
join tables. Adding a new org type requires schema migration. The sidebar
aggregate queries become more complex.

**Option B — Single `organizations` table** (chosen)
`organizations(id, type ∈ {customer, oem}, name, metadata JSON, …)`.
Type-specific fields (industry, region, partner_level, tier, website, etc.)
live in `metadata`. All FK tables use a single `organization_id` column.

---

## Decision

Single `organizations` table with `type` discriminator. Type-specific fields
live in `metadata JSON`; the app reads and writes them via model helpers that
JSON-parse on read, JSON-stringify on write.

The `agent` org type is dropped entirely. "Agent" in MasterControl means AI
agent (a Claude conversation); the old concept of a reseller/agent partner
is either a Customer or an OEM depending on the relationship.

---

## Consequences

**Gets easier**

- All FK relationships are simple `organization_id INTEGER REFERENCES
  organizations(id) ON DELETE CASCADE` — no polymorphic FKs anywhere.
- Agent context-building reads a single org row + joins to contacts/projects
  regardless of org type.
- The mention-graph (`note_mentions`) uses two plain FKs.
- Adding a new org type requires only a new `type` value in the CHECK
  constraint — no schema migration for the join tables.
- Cross-type queries (all orgs, org-agnostic task list) are trivial selects.

**Gets harder**

- Per-type filtering is required in every query that scopes by type (e.g.,
  sidebar list of customers only). This is handled at the model layer:
  `listByType(type)` is the entry point; raw `SELECT *` from `organizations`
  without a `WHERE type=` is disallowed by convention.
- Type-specific metadata fields are not enforced by the DB schema; enforcement
  is in the zod schemas and model helpers. A malformed `metadata` payload
  that passes zod validation will silently persist.

**Deferred**

- If a `metadata` key is filtered in a `WHERE` clause frequently enough to
  require an index, promote it to a real column via a generated index
  (`json_extract(metadata, '$.field')`). Phase 1 does not do this; the
  ARCHITECTURE.md § Database conventions documents when to promote.
- Phase 2 may need additional type-specific fields that are awkward in `metadata`
  (e.g., per-OEM OneDrive root path). Evaluate promoting those fields to real
  columns at migration time rather than keeping them in the blob.
