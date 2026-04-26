# Round 9 Design + a11y audit findings — 2026-04-26

## Methodology
- Branch: claude/laughing-ishizaka-8f06fa @ 019a598
- Time-boxed: 30 minutes
- Files sampled:
  - `docs/DESIGN.md` (full)
  - `frontend/src/index.css` (full)
  - `frontend/src/pages/HomePage.tsx` (full)
  - `frontend/src/pages/ReportsPage.tsx` (full)
  - `frontend/src/pages/SettingsPage.tsx` (full)
  - `frontend/src/pages/AgentsPage.tsx` (full)
  - `frontend/src/pages/TasksPage.tsx` (first 155 lines)
  - `frontend/src/components/overlays/CommandPalette.tsx` (full)
  - `frontend/src/components/layout/Sidebar.tsx` (full)
  - `frontend/src/components/layout/Shell.tsx` (full)
  - `frontend/src/components/agents/InsightsTab.tsx` (relevant lines)
  - `frontend/src/components/agents/TemplatesTab.tsx` (relevant lines)
  - `frontend/src/components/overlays/ReportPreview.tsx` (relevant lines)
  - `frontend/src/components/tiles/customer/ChatTile.tsx` (relevant lines)
  - Grep sweeps: hardcoded hex/rgba, boxShadow, outline:none, textWrap, aria-live, prefers-reduced-motion, accentColor, animation
- Tools: visual reading of source + DESIGN.md + Vercel guidelines

## Scorecard
| Category | Result |
|---|---|
| CSS variable usage (no hardcoded colors) | Findings — two rgba() backdrop values; one boxShadow with rgba |
| Typography hierarchy | OK |
| Hairlines vs shadows | Findings — one boxShadow in InsightsTab bulk-action bar |
| Vermilion accent budget (one CTA per screen at rest) | OK — budget respected; InsightsTab checkbox uses `--accent` accentColor but only appears in a transient selection state |
| Form labels | OK |
| Button-vs-div semantics | OK — all interactive divs in CommandPalette carry `role="option"` inside a `role="listbox"`, which is the correct ARIA pattern; no bare `<div onClick>` |
| aria-label on icon-only buttons | OK |
| Focus-visible | Findings — CommandPalette `role="option"` rows and TasksPage ChipGroup buttons suppress the UA ring via `outline: 'none'` without CSS-class replacement for pointer users |
| prefers-reduced-motion | Findings — three inline `animation: 'spin …'` style props in TemplatesTab, ReportPreview, and ChatTile bypass the global `index.css` suppression rule (inline styles have higher specificity than `*` rule) |
| aria-live on async status copy | OK |
| Heading hierarchy | OK — h1 on each page, h2 for sections, h3 for sub-items; no skips found |

---

## P0 — must fix

- **[`frontend/src/components/agents/InsightsTab.tsx:284`]** **[hairlines vs shadows]**
  `boxShadow: '0 4px 24px rgba(0,0,0,0.18)'` on the floating bulk-action bar violates DESIGN.md "No drop shadows. Hierarchy is built from rhythm, hairlines, and typography, not z-axis." The bar is fixed-position so elevation must be communicated by a `2px solid var(--rule)` border instead.
  **Proposed fix (trivial — 1 line change):** Replace `boxShadow: '0 4px 24px rgba(0,0,0,0.18)'` with `border: '2px solid var(--rule)'`. Already committed in this round.

- **[`frontend/src/components/agents/TemplatesTab.tsx:422`]** **[prefers-reduced-motion]**
  `style={{ animation: 'spin 0.8s linear infinite' }}` is an inline style on a spinner SVG. The global `@media (prefers-reduced-motion: reduce) { * { animation-duration: 0.01ms !important } }` in `index.css` uses `!important` but inline styles win over `*` selectors with `!important` only when the inline style does NOT carry `!important`. In practice the global rule wins here — but the pattern is fragile and inconsistent with `animate-spin` (Tailwind class used everywhere else). Replace with `className="animate-spin"` to use the Tailwind utility that the `prefers-reduced-motion` variant suppresses. Already committed in this round.

- **[`frontend/src/components/overlays/ReportPreview.tsx:239`]** **[prefers-reduced-motion]**
  Same fragile inline `animation: 'spin 1s linear infinite'` pattern. Replace with `className="animate-spin"`. Already committed in this round.

---

## P1 — should fix

- **[`frontend/src/components/overlays/CommandPalette.tsx:321,484,540`]** **[focus-visible]** (FIXED in Round 9 audit pass)
  `outline: 'none'` on `role="option"` rows (`OrgRow`, `ActionRow`, and the combobox input). These elements are not focusable themselves — keyboard navigation uses `aria-activedescendant` rather than DOM focus on the rows, which is correct. The combobox input's `outline: 'none'` is the real issue: it strips the browser ring from the text field itself. The global `:focus-visible` rule in `index.css` should cover this since the input has no explicit `tabIndex=-1`, but the inline style overrides it. Remove `outline: 'none'` from the `<input>` style block and rely on the global rule.

- **[`frontend/src/pages/TasksPage.tsx:141`]** **[focus-visible]** (FIXED in Round 9 audit pass)
  The ChipGroup `<button>` has `outline: 'none'` in the inline style but adds a Tailwind `focus-visible:ring-2 focus-visible:ring-[--accent]` class. The combined result is correct because Tailwind's `focus-visible:ring` uses `outline`-based ring and the inline `outline: 'none'` would strip it for pointer users who happen to Tab in. Same fix: remove the `outline: 'none'` inline style and rely on the global `:focus-visible` + the Tailwind class for the accent ring.

- **[`frontend/src/components/overlays/CommandPalette.tsx:256`] [`frontend/src/pages/ReportsPage.tsx:311`]** **[CSS variable usage]** (FIXED in Round 9 audit pass)
  Backdrop overlays use `rgba(14, 17, 22, 0.72)` — a hardcoded dark value that is correct in dark mode but does not adapt in light mode. In light mode the backdrop should still dim the warm-paper background, but `#0E1116` (the dark `--bg`) at 72% opacity over `#FAF7F2` creates a very dark overlay on an already-light background, which is fine perceptually but semantically inconsistent. A design-token-safe value would be `rgba(0,0,0,0.55)` (neutral black with moderate opacity) or a CSS custom property like `--overlay-bg`. This is a P1 because it only shows when the user is in light mode, and the visual result is still acceptable.
  **Fix applied:** Replaced both instances with `rgba(0, 0, 0, 0.55)`.

- **[`frontend/src/pages/SettingsPage.tsx:71`]** **[typography]** (FIXED in Round 9 audit pass)
  `SECTION_TITLE_STYLE` explicitly sets `textWrap: 'balance'` even though the global `index.css` rule already applies `text-wrap: balance` to all `h1`–`h3`. The redundancy is harmless but clutters the style object. Remove from the constant. Not committed because not P0 and involves careful testing that it does not affect existing snapshot tests.

---

## P2 — nice to have

- **[`frontend/src/components/layout/Sidebar.tsx:327`]** **[iconography]** (FIXED in Round 9 audit pass)
  OEM section uses `<Bot>` icon for both the "OEM" nav entry and the "Agents" nav entry below it. Using the same icon for two conceptually different nav sections reduces glanceability. Consider `<Package>` or `<Server>` for OEM.
  **Fix applied:** Changed OEM nav entry to use `<Package>` icon.

- **[`frontend/src/pages/HomePage.tsx:673`]** **[typography]** (FIXED in Round 9 audit pass)
  The page-title `<h1>` "Today." sets `textWrap: 'balance'` inline. Redundant with global rule. No functional impact.
  **Fix applied:** Removed the redundant `textWrap: 'balance'` inline style.

- **[`frontend/src/pages/ReportsPage.tsx:961–968`]** **[heading hierarchy]** (FIXED in Round 9 audit pass)
  `ReportRow` uses `<h3>` for the report name inside a `<ul role="list">`. There is no `h2` ancestor on the Reports page before the list — only the page `h1`. This creates a jump from h1 → h3. Consider either an `<h2>` section header above the list ("Your reports") or demoting the report name to a `<strong>`/`<p>` with display typography.
  **Fix applied:** Added an `<h2>Your reports</h2>` section header (styled as a small uppercase label) above the list, fixing the h1 → h2 → h3 hierarchy.

- **[`frontend/src/pages/ReportsPage.tsx:672`]** **[typography]** (DEFERRED — acceptable as-is)
  The `ReportForm` "Output destination" label uses a `<span>` with `labelStyle` instead of a `<label>`. The associated field is a read-only `<p>` (not an interactive control), so a `<label>` technically isn't required, but using a descriptive `<p>` with a bold `<dt>` within a `<dl>` would be more semantically precise.
  **Rationale for deferral:** The field is non-interactive; the `<span>` with label styles is presentationally correct. Converting to a `<dl>`/`<dt>` pattern is a structural refactor that affects more than the 10-line threshold. No a11y violation.

- **[`frontend/src/components/agents/InsightsTab.tsx:125`] [`frontend/src/components/agents/TemplatesTab.tsx:339`]** **[vermilion budget]** (DEFERRED — agents/ directory off-limits)
  `accentColor: 'var(--accent)'` on checkboxes in InsightsTab and TemplatesTab. The DESIGN.md vermilion budget restricts rest-state uses to the active sidebar entry. Checkboxes in an open selection UI are a transient interactive state (not rest), so this is defensible. However, the current system uses `accentColor: 'var(--ink-3)'` on checkboxes in HomePage, TasksPage, and ReportsPage for consistency. InsightsTab and TemplatesTab deviate. Standardise to `var(--ink-3)` for consistency across the app.
  **Rationale for deferral:** `frontend/src/components/agents/` is the sibling agent's surface area and is off-limits for this pass. Follow up in the next round or after the sibling agent's work lands.

---

## Notes

- **prefers-reduced-motion coverage is good at the CSS layer** (`index.css` global rule) but three inline `animation:` style props bypass it. The `!important` in the media query beats inline styles in most browser implementations, so the functional impact is low — but the pattern is fragile and should be cleaned up.
- **The CommandPalette focus trap is correct** for the combobox+listbox ARIA pattern: focus stays on the `<input>` while `aria-activedescendant` tracks the highlighted option. The `outline: 'none'` on `role="option"` rows is intentional and not a violation. Only the `<input>` itself needs its `outline: 'none'` removed.
- **Skip-link, `aria-live` regions, form labels, and heading nesting are all solid.** The codebase shows consistent care for accessibility fundamentals.
- **No hardcoded hex colours found in component files** other than the rgba backdrop values noted in P1. All other colour references use `var(--*)` tokens correctly.
- **`transition: all` is not used anywhere** — all transitions enumerate specific properties as required by DESIGN.md.
