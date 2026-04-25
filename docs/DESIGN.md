# MasterControl — Design Direction

**Status**: v1 — committed direction for Phase 1.
**Companion docs**: [`PRD.md`](PRD.md), [`ARCHITECTURE.md`](ARCHITECTURE.md), [`CLAUDE.md`](../CLAUDE.md).

## Why this doc exists

Two skills inform the frontend: Anthropic's **frontend-design** skill (commit to a bold, distinctive direction; reject generic AI aesthetics) and Vercel's **web-interface-guidelines** (the floor — a11y, focus, performance, content handling). This doc names the direction so every component decision rolls up to a single coherent vision instead of accumulating ad-hoc styling.

Anything not specified here defaults to the Vercel guidelines, which are loaded fresh from
[`web-interface-guidelines/command.md`](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)
and audited against in PR review.

## Aesthetic — "Field Notes"

A workmanlike, editorial feel. Built for hours of writing and reading: less Salesforce, less Linear; more *designed analog notebook crossed with a printed magazine spread*. Quiet by default; structure emerges through rhythm and typography, not chrome.

The user is an account executive who will live in this app 6+ hours a day. Density is the enemy at rest. Calm is the goal. Information density appears on demand (tile expand, command palette) but never assaults at default state.

**Explicitly NOT:**
- Dashboard density (modern CRMs, charts on the home page)
- Power-user terminal aesthetic (Linear / Raycast / Vim-y)
- Glassmorphism, frosted glass, acrylic panels (overdone)
- Generic AI aesthetic — Inter + purple gradient on white
- Drop-shadow-heavy material design
- Cookie-cutter hero sections

## Typography

- **Display — Fraunces** (variable serif, Google Fonts, free). Optical sizing baked in. Uses: org names on detail pages, page titles, section headers. The serif sets a literary tone for an app that's primarily a reading and writing surface.
- **Body — Switzer** (variable humanist sans by Indian Type Foundry, Fontshare, free for commercial). Distinct from Inter — narrower x-height, warmer terminals. Uses: all UI labels, paragraphs, form inputs, buttons.
- **Mono — JetBrains Mono** (free). Uses: cron expressions, file paths, raw JSON metadata viewer, anything code-ish.
- **Numbers**: `font-variant-numeric: tabular-nums` everywhere counts, timestamps, currency, or dates appear in vertically aligned columns.
- **Wrap rules**: `text-wrap: balance` on `<h1>`–`<h3>`. `text-wrap: pretty` on body paragraphs. Notes column max-width 70ch.
- **Per Vercel guidelines**: curly quotes `"` `"`, ellipsis `…` not `...`, non-breaking spaces in `10&nbsp;MB`, brand names, `⌘&nbsp;K`.

## Color

Two palettes, swappable via Tailwind's `darkMode: 'class'`. All colors are CSS variables on `:root` and `.dark`.

### Light — "warm paper"
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#FAF7F2` | page background, sidebar |
| `--bg-2` | `#F2EDE3` | tile hover, faint zone |
| `--ink-1` | `#1A1815` | primary text |
| `--ink-2` | `#5C564E` | secondary text, labels |
| `--ink-3` | `#A39A8C` | tertiary, placeholder, decorative timestamps |
| `--rule` | `#E0D8C9` | hairline borders, dividers |
| `--accent` | `#C8482E` | vermilion — active state, focus rings, agent-insight dot |
| `--accent-soft` | `#FCE8DF` | accent surface (e.g. selected sidebar item bg, unobtrusive) |

### Dark — "ink and ivory"
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#0E1116` | page bg |
| `--bg-2` | `#161A21` | tile hover, faint zone |
| `--ink-1` | `#EDE7DA` | warm ivory, primary text |
| `--ink-2` | `#9A958A` | secondary |
| `--ink-3` | `#5C564E` | tertiary |
| `--rule` | `#2A2F38` | hairlines |
| `--accent` | `#E66B4D` | vermilion lifted for dark legibility |
| `--accent-soft` | `#2C1A14` | accent surface, dark |

**Rules:**
- No purple. No neon. No multi-stop gradients.
- The only "gradient" is an optional 0.04-opacity paper-grain SVG overlay on `--bg` in light mode — barely visible, not a chrome effect.
- Vermilion is used **sparingly** — never on more than one element per screen at rest. It signals user attention zones (active nav item, focus ring) and the agent-insight dot.
- Default theme on first load: respect `prefers-color-scheme`. User toggle persists in `localStorage` via Zustand.

## Layout

- Sidebar fixed at 220px desktop, collapses to 56px (icons + first letter only). No chrome separator — the sidebar shares `--bg` with the main column. Visual separation is a single 1px hairline.
- Main content: max width 1100px, centered, generous breathing room.
- Tiles: flat surfaces with hairline `--rule` borders. Border-radius 8px (deliberate — 16px reads as too friendly for an editorial tool). **No drop shadows.** Hierarchy is built from rhythm, hairlines, and typography, not z-axis.
- Tile internal padding: 32px desktop, 20px ≤768px.
- The org name on a detail page is set in 56–72px Fraunces, slightly hanging into the gutter (`margin-left: -6px`) — a small, intentional gesture that makes the page feel printed rather than rendered.

## Motion

- Default duration: 240ms.
- Default easing: `cubic-bezier(0.2, 0.0, 0.0, 1.0)` — slightly snappier than Material's standard ease-out.
- Animate `transform` and `opacity` only (compositor-friendly, per Vercel).
- **Never** `transition: all` — list properties.
- Set `transform-origin` deliberately on each animated element.

**High-impact moments — not micro-interactions on every hover:**
- **Page load**: tiles stagger in 50ms apart, opacity 0→1 + translateY(8px → 0).
- **Tile expand**: 200ms height + body opacity 0→1 layered on the second 100ms.
- **Sidebar nav active**: 2px vermilion line slides in from the left edge, 200ms.
- **Chat streaming**: 1px-wide vertical caret blinks at the streamed text's trailing edge (typewriter feel); fades 400ms after stream ends.
- **Submit during request**: icon swaps to spinner; label appends `…`.

**Reduced motion** (mandatory, per Vercel):
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

## Component patterns

### Sidebar
- Section headers: 11px Switzer SemiBold uppercase, `letter-spacing: 0.08em`, `--ink-3`. Examples: `HOME`, `CUSTOMERS`, `OEM`, `AGENTS`.
- Entries: 14px Switzer regular, `--ink-1`. Active entry has a 2px vermilion bar on the left edge + `--accent-soft` background.
- Hairline separator between sections.
- Empty Customers state: inline outline button `+ Add customer`, 13px, `--ink-2` border, no shadow. Hover lifts to `--ink-1`.
- Collapse toggle: arrow icon, top-right of sidebar header.

### Tile
- Header row: 16px Switzer SemiBold, `--ink-1`. Chevron icon trailing right (16px Lucide stroke). 1px hairline `--rule` below.
- Body: depends on the tile.
- **Collapsed state hover**: header background tints to `--bg-2` to signal "click to expand."
- **Focus-visible**: 2px vermilion ring, 2px offset (uses `outline` so it sits outside the border). Never `outline-none` without replacement.

### Notes / Chat tile
- **Notes feed** (above the composer):
  - Each row: timestamp on left, 11px tabular-nums, `--ink-3`, fixed width 80px. Content right of timestamp, 16px Switzer, max width 70ch.
  - `agent_insight` notes: 4px vermilion dot to the left of the timestamp. The dot is the only persistent vermilion in the UI; tooltip on hover surfaces the source thread.
  - Long notes truncate with `line-clamp-3` and an inline "Read more" affordance.
- **Chat composer** (below):
  - **Single-input writing surface, not a tweet box.** 24px Switzer Light. Multi-line `<textarea>`. Auto-grows to 12 lines max, then scrolls.
  - Placeholder: `Ask the {customer name} agent…` (24px, `--ink-3`).
  - **Submit**: ⌘/Ctrl+Enter. Enter alone inserts newline (writer-tool convention).
  - **During streaming**: muted "Stop" affordance materializes near the composer; submit button shows spinner + label `Streaming…`.
  - When stream ends, the assistant message is mirrored into the notes feed above with a small `agent` label.

### Forms (per Vercel guidelines, non-negotiable)
- Every input has a `<label>` (use `htmlFor` or wrap).
- `autocomplete`, `name`, `inputmode`, and `type` set correctly per field.
- API-key field: `type="password"` + `spellCheck={false}` + `autocomplete="off"`. After save, displayed masked: `sk-ant-…last4`.
- Errors render inline next to the field; focus jumps to first error on submit.
- Specific button labels — `Save API Key` not `Save`; `Add Customer` not `Submit`.
- Submit button stays enabled until the request begins; disables + shows spinner during.
- Warn on unsaved-changes navigation (`beforeunload` listener on dirty forms).

### Iconography
- **Lucide** stroke icons. Sizes 16px or 20px. Stroke width 1.5.
- Icons never carry meaning alone — pair with text or `aria-label`.
- Decorative icons get `aria-hidden="true"`.

### Empty states
- Default frame: thin dashed `--rule` border, centered 14px `--ink-2` copy, no illustrations. The text says what's missing and what to do — `No documents yet — add a link to start tracking.`

## Accessibility floor (non-negotiable)

Every PR touching the frontend audits against the
[Vercel web-interface-guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md).
The high-frequency offenders to watch for:

- Icon-only buttons → `aria-label`.
- Visible focus on every interactive element (`focus-visible:ring-2 focus-visible:ring-[--accent]`).
- Headings strictly nested `h1 → h2 → h3`.
- Skip-to-main-content link at top of page.
- Async UI updates → `aria-live="polite"`.
- `<button>` for actions, `<a>`/`<Link>` for navigation; never `<div onClick>`.
- AA color contrast (vermilion on warm-paper meets, verified during build).

## URL state (per Vercel guideline: URL reflects state)

Anything that survives a refresh lives in the URL:
- Active OEM tab → `/oem/:id`
- Active customer → `/customers/:id`
- Active thread on an org → `?thread=42`
- Tasks page filters → `?status=open&due=today&org=3`
- Theme override → cookie or `localStorage` (not URL — it's a long-lived preference, not page state).

## Internationalization & locale

- Dates: `Intl.DateTimeFormat` (no hard-coded `"MM/DD/YYYY"`).
- Numbers / currency: `Intl.NumberFormat`.
- Brand names, code tokens, file paths: `<span translate="no">…</span>`.

## Phase 1 vs. Phase 1.5 split

| Land in Phase 1 | Defer to Phase 1.5 polish |
|---|---|
| Fonts loaded (`@font-face`, `font-display: swap`) | Optical-size fine-tune across breakpoints |
| Both palettes wired via CSS variables | Paper-grain SVG overlay |
| Sidebar + Shell + Tile + ThemeToggle | Sidebar collapse spring animation |
| Chat composer with streaming caret | Caret idle-pulse refinement |
| Focus rings everywhere | Custom focus-ring spring (current is `transition: outline-color`) |
| `agent_insight` vermilion dot | Tooltip on the dot showing source thread |
| Empty-state component | Empty-state copy review pass |
| Light + dark via `prefers-color-scheme` | Manual override toggle in Settings |

Both palettes ship in Phase 1; Phase 1.5 just refines the moments that don't block usability.
