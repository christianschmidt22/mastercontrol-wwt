# MasterControl adversarial review - 2026-04-28

## Executive summary

The customer-screen complaints are real code defects, not just polish gaps. Several controls render as if they are complete but are either not wired, wired to the wrong API shape, or backed by test-only stubs. TypeScript passes and the full test suite passes, but lint fails, and the tests miss the production wiring failures that matter most.

Verification run:

- `npm run typecheck`: passed.
- `npm run test`: passed, 980 total tests.
- `npm run lint`: failed on 12 unused stub functions in frontend tile components.

## User-reported issues

### 1. Customize layout half works, and tile resize does not work

Evidence:

- The resize handle is visual only: `frontend/src/components/tiles/TileEditChrome.tsx:190-204` renders the corner with `cursor: 'nwse-resize'` but no pointer, drag, keyboard, or callback behavior.
- `TileGrid` only supports drag reorder and keyboard position changes, not width/height changes: `frontend/src/components/tiles/TileGrid.tsx`.
- Layout persistence posts to the wrong backend route: `frontend/src/components/tiles/useTileLayout.ts:66` sends `PUT /api/settings/:key` with only `{ value }`, while the backend only exposes `PUT /api/settings` with `{ key, value }` at `backend/src/routes/settings.route.ts:19`.
- The same layout hook is used by both customer and OEM dashboards: `frontend/src/pages/CustomerPage.tsx:57` and `frontend/src/pages/OemPage.tsx:47`.

Fix plan:

- Add `onResize(id, { w, h })` to `TileEditChrome` and `TileGrid`.
- Implement pointer resize with grid-cell math based on the `.tile-grid` bounding box, clamped to 1..12 columns and a minimum height.
- Add keyboard resize controls for accessibility, likely `Shift+Arrow` while focused on a resize button.
- Update `useTileLayout` to use the typed settings mutation shape: `PUT /api/settings` with `{ key: settingKey, value: JSON.stringify({ tiles }) }`.
- Add tests for resize, save persistence URL/body, reset, and reload behavior.

### 2. Edit, Chat, and New note buttons across the top of customer screens do not work

Evidence:

- `CustomerPage` renders `CustomerPageHeader` without `onEditOrg`, `onNewNote`, or `onOpenChat`: `frontend/src/pages/CustomerPage.tsx:126-130`.
- The header buttons call optional props directly: `frontend/src/components/customers/CustomerPageHeader.tsx:537`, `:562`, and `:587`. With no handlers, clicks are no-ops.

Fix plan:

- Decide exact UX:
  - `Edit`: open an org edit panel/modal for profile metadata.
  - `Chat`: focus the chat tile composer and scroll it into view.
  - `New note`: open the Recent Notes inline add form and scroll/focus it.
- Implement page-level refs/events or lift note/chat add state into `CustomerPage`.
- Add customer-page integration tests that render the actual page wiring, not only isolated header tests.

### 3. Dropdowns in edit boxes have unreadable white backgrounds with light text

Evidence:

- Shared inline select/input styles use `background: 'transparent'` and `color: 'var(--ink-1)'`, for example `frontend/src/components/tiles/customer/PriorityProjectsTile.tsx:62-71`, `:168`, and `:582`.
- Contact role select uses the same pattern in `frontend/src/components/tiles/customer/ContactsTile.tsx`.
- There is no global `select` / `option` theme rule in `frontend/src/index.css`.

Fix plan:

- Add a global form-control style in `index.css` for `input`, `textarea`, `select`, and `option`, or create a small shared `fieldControlStyle`.
- For native dropdown options, explicitly set `option { background: var(--bg); color: var(--ink-1); }`.
- Replace repeated inline select styles with the shared control style so dark/light themes stay coherent.
- Add visual/browser verification because native select popups vary by OS and browser.

### 4. What is the Reference box for?

Current intent:

- The `Reference` tile is meant to be a compact profile/reference drawer with `Profile`, `Locations`, and `Portals`: `frontend/src/components/tiles/customer/ReferenceTile.tsx:170-173`.

Actual behavior:

- In production it uses `useOrganizationStub`, not the real `useOrganization` hook: `frontend/src/components/tiles/customer/ReferenceTile.tsx:12` and `:176`.
- As rendered from `CustomerPage`, no hook is injected: `frontend/src/pages/CustomerPage.tsx:108`.
- Result: it usually shows an empty-state even when the org has metadata.

Product recommendation:

- Rename it to `Profile` or `Quick reference`.
- Make it pull real org metadata.
- Decide whether it duplicates the page header summary. If it stays, it should hold structured details: industry, address, size, portal links, key buying notes, and account planning facts.

Fix plan:

- Import and use `useOrganization` as the default hook in `ReferenceTile`.
- Keep `_useOrganization` only for tests.
- Add a production-wiring test that renders `<ReferenceTile orgId={...}>` with a QueryClient and mocked API response.

### 5. Need to pin accounts and OEMs to the top of the left bar, or customize the entire order

Evidence:

- Customers and OEMs are rendered in backend order only: `frontend/src/components/layout/Sidebar.tsx:384` and `:433`.
- Backend order is hardcoded alphabetical: `backend/src/models/organization.model.ts:107-108`.
- The `+ Add customer` button has no click handler: `frontend/src/components/layout/Sidebar.tsx:414-416`.

Recommendation:

- Implement full sidebar customization rather than a narrow pin-only hack.
- Add a `sidebar.layout` setting with stable item IDs:
  - `nav:home`, `nav:tasks`, `nav:reports`, `section:customers`, `org:customer:<id>`, `org:oem:<id>`, `nav:agents`, `nav:settings`.
- Store order plus pin state in JSON. Merge unknown/new orgs into their default section by name.
- Render a top `Pinned` section for pinned customer/OEM orgs, then render the remaining customized order below.
- Add drag handles or a "Customize sidebar" mode, using the same DnD dependency already present.

## Five additional top issues

### A. Organization update contract is broken and can wipe metadata

Evidence:

- Frontend type says `OrganizationUpdate` fields are optional: `frontend/src/types/organization.ts`.
- Backend schema requires `name`: `backend/src/schemas/organization.schema.ts:29-36`.
- Header summary save sends only metadata: `frontend/src/components/customers/CustomerPageHeader.tsx:357`, so it fails backend validation.
- Header name save sends only name: `frontend/src/components/customers/CustomerPageHeader.tsx:342`; backend then writes `metadata ?? {}` at `backend/src/routes/organizations.route.ts:66-67`, wiping existing metadata.

Fix:

- Make backend update true PATCH semantics: `name?: string`, `metadata?: Metadata | null`, at least one field required.
- In the model, fetch the existing row and merge only supplied fields.
- Add route tests for name-only, metadata-only, and preserving unrelated metadata fields.

### B. Tests are over-mocked and miss production wiring

Evidence:

- `ReferenceTile.test.tsx` states it uses hook injection and no real network calls: `frontend/src/components/tiles/customer/ReferenceTile.test.tsx:5`.
- The Reference tile tests pass with injected data even though production defaults to a stub.
- Header tests cover button render/edit UI but not the `CustomerPage` handlers being absent.

Fix:

- Keep unit tests, but add page-level integration tests for customer dashboard wiring.
- Add a small MSW/fetch-mock layer for real hooks.
- Add tests for the settings API request shape used by layout persistence.

### C. Lint is red, which violates the repo's own "done" contract

Evidence:

- `npm run lint` fails on unused stub functions in Contacts, PriorityProjects, RecentNotes, Tasks, and AccountChannel tiles.

Fix:

- Remove the unused stubs or rename to `_use...Stub` only if intentionally retained.
- Prefer no local stubs unless they are actually used as defaults; test injection can live in tests.

### D. PRD and implementation have drifted

Evidence:

- PRD says the OEM sidebar should be a single entry with OEM tabs inside the page, while the implementation lists OEMs individually in the sidebar.
- PRD describes a Profile tile, while implementation has a Reference tile that currently does not fetch real data.
- PRD still treats sidebar scaling/order as deferred, but the current product need is now active.

Fix:

- Update `docs/PRD.md` after deciding the sidebar model.
- Rename/reference the tile consistently in PRD, code, and tests.
- Add a short ADR for sidebar customization if it becomes a persisted setting.

### E. Shared UI primitives are missing, so form bugs repeat

Evidence:

- Form controls, buttons, select styling, and inline edit layouts are hand-coded repeatedly across tile components.
- This is why the select dropdown issue appears in multiple places and why dead affordances can look finished.

Fix:

- Add lightweight shared primitives: `Control`, `Select`, `TextInput`, `TextArea`, `IconButton`, and `TileActionButton`.
- Keep them visually aligned with `docs/DESIGN.md`.
- Migrate the highest-change forms first: Contacts, Projects, Tasks, Notes, Settings.

## Suggested implementation order

1. Fix organization update PATCH semantics and tests.
2. Wire customer header actions to real page behavior.
3. Fix layout persistence API shape.
4. Implement real tile resizing.
5. Fix Reference tile data hook and rename/product-copy decision.
6. Add global/shared select styling.
7. Fix lint.
8. Implement sidebar `Pinned` plus customizable order.
9. Update PRD/ADR/docs to match the chosen sidebar and reference/profile model.
10. Add customer-page integration tests that exercise production wiring.

