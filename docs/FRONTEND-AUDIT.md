# MasterControl — Frontend Audit

**Branch**: `claude/great-tesla-6c5416`
**Auditor**: Senior frontend + accessibility reviewer
**Date**: 2026-04-25
**Scope**: All Round 1/2/3 frontend files — config, store, types, API hooks, layout, tiles, forms, agents, pages.
**References**: `docs/DESIGN.md`, `docs/REVIEW.md`, Vercel Web Interface Guidelines.

---

## DESIGN.md fidelity

### Design-token compliance table

| Rule | Status | Notes |
|---|---|---|
| Fraunces on h1–h3 | PASS | `var(--display)` on all `<h1>`–`<h3>` elements; global `h1,h2,h3 { font-family: var(--display) }` in `index.css`. One exception: `InsightsTab.tsx` renders an `<h2>` with `fontFamily: 'var(--body)'` — see Bug B-01. |
| Switzer body | PASS | `font-family: var(--body)` on body; all inline styles reference it correctly. |
| No JetBrains Mono | PASS | System-mono stack only; `tailwind.config.ts` mono family is `ui-monospace, Menlo, Consolas`. |
| `text-wrap: balance` on headings | PASS | Global rule in `index.css`; inline overrides in pages also set it where needed. |
| `text-wrap: pretty` on paragraphs | PASS | Global rule in `index.css`. |
| Vermilion at rest: only active sidebar entry | PASS | Active `NavLink` uses `border-l-accent bg-accent-soft`. |
| Vermilion transient set | PARTIAL PASS | All enumerated signals present. However, the `BulkBar` floating action bar in `InsightsTab.tsx` uses `boxShadow: '0 4px 24px rgba(0,0,0,0.18)'` — a drop shadow, forbidden by DESIGN.md ("No drop shadows"). |
| Spacing scale (4/8/12/16/24/32/48 only) | FAIL (minor) | `gap: 14px` appears in `TileGrid.tsx` (grid gap), `ChatTile.tsx` (feed rows), `RecentNotesTile.tsx` (note list). `gap: 10px` in several tiles' list rows. `padding: '28px 36px 80px'` in `Shell.tsx` main region (28px and 36px are off-scale). `gap: 6px` in multiple button rows. `marginBottom: 6` in `AgentsPage.tsx` breadcrumb. Off-scale values: 6, 10, 14, 22, 26, 28, 36, 80. |
| No `transition: all` | PASS | All transitions enumerate properties explicitly (`background-color`, `color`, `border-color`, `opacity`). |
| No drop shadows | FAIL | `BulkBar` in `InsightsTab.tsx:279` has `boxShadow: '0 4px 24px rgba(0,0,0,0.18)'`. |
| Dark default / `color-scheme: dark` on `:root` | PASS | `:root { color-scheme: dark }` in `index.css`. |
| `<meta name="theme-color">` | PASS | Present in `index.html` with value `#0E1116`. |
| Light palette via `.light` class + media query | PASS | Both paths present in `index.css`. |
| `font-display: swap` | PASS | All `@font-face` declarations include it. |
| Hairlines not shadows on tiles | PASS | `Tile.tsx` uses `border: '1px solid var(--rule)'`, no `box-shadow`. |
| 8px tile border-radius | PASS | `borderRadius: 8` throughout. |
| Prefers-reduced-motion global override | PASS | Present in `index.css`; streaming caret fallback also included. |
| `tabular-nums` on timestamps/numbers | PASS | `fontVariantNumeric: 'tabular-nums'` or `.tnum` class used consistently. |
| Vermilion focus rings | PASS | Global `:focus-visible { outline: 2px solid var(--accent) }` in `index.css`. |

### Vermilion enumeration (rendered output)

Every occurrence of `var(--accent)` in the live UI:

1. Active sidebar left border + `--accent-soft` bg (`Sidebar.tsx`) — permitted (one at-rest zone).
2. Focus rings globally — permitted (transient).
3. Stream caret in `ChatTile.tsx` — permitted (transient).
4. Agent-insight dot in `RecentNotesTile.tsx` and `HomePage.tsx` — permitted (transient).
5. Overdue task date text in `TasksTile.tsx`, `TasksPage.tsx`, `HomePage.tsx` — permitted (transient).
6. Edit-mode chrome: dashed border, drag-grip, resize handle in `TileEditChrome.tsx` — permitted (transient).
7. Stream failure banner top-border in `ChatTile.tsx` — permitted (transient).
8. Error text in `FormField.tsx`, `TemplatesTab.tsx`, `ThreadsTab.tsx` — accepted usage per design intent.
9. **BulkBar** floating bar `boxShadow` — the bar itself uses `var(--bg)` fill, not accent; shadow is the violation, not color. Bug B-02.
10. `NotFound.tsx` Back-to-home link uses `color: 'var(--accent)'` — this is a link at rest, not a transient signal. Minor drift.

---

## Accessibility against Vercel guidelines

| Rule | Status | Location | Notes |
|---|---|---|---|
| `aria-label` on icon-only buttons | PASS | All icon-only buttons (ThemeToggle, Send, Stop, Move tile) have `aria-label`. |
| `<button>` for actions, `<a>`/`<Link>` for nav | FAIL | `TasksPage.tsx:438–449` — `<div role="button" tabIndex={0}>` with `onClick`/`onKeyDown` wraps the task title expand. This should be a `<button>`. |
| No `<div onClick>` for navigation | PASS | All navigation uses `NavLink` or `<Link>`. |
| Visible focus on all interactive elements | PARTIAL FAIL | `TabStrip.tsx:85` — `outline: 'none'` on the active tab button. The global `:focus-visible` rule in `index.css` would normally provide the ring, but the inline `outline: 'none'` style overrides it entirely (inline styles win over stylesheet rules), killing focus visibility for tab buttons entirely. Critical a11y bug — see Bug B-03. |
| `outline-none` without replacement | FAIL | `ChatTile.tsx:259` — `outline: 'none'` on the `<textarea>`. `onFocus`/`onBlur` swap `borderColor` but this is not a conformant replacement for `outline` (the border is inside the element, not offset). |
| `TemplatesTab.tsx:290` — `outline: 'none'` on the system-prompt `<textarea>`. Same issue. | FAIL | Same as above. |
| `SettingsPage.tsx:39` — `outline: 'none'` in `INPUT_STYLE` shared constant, applied to all inputs and selects on the Settings page. | FAIL | All settings form controls lack visible focus. |
| Heading hierarchy | FAIL | `AccountChannelTile.tsx:162,182` — `<h3>` inside a tile whose heading (tile title "Team") is rendered as `<header>` plain text, not an `<h2>`. The `<h3>` appears without a parent `<h2>` in the DOM context of the page. `InsightsTab.tsx:516` renders `<h2>` with `fontFamily: 'var(--body)'` (design drift) and is an `<h2>` inside `AgentsPage` which already has an `<h1>` — this is fine structurally, but the font choice breaks the Fraunces-on-headings rule. |
| Skip-to-main link | PASS | `SkipLink.tsx` present, first in `Shell`, targets `#main`. |
| `id="main"` on `<main>` | PASS | `Shell.tsx:29`. |
| `aria-live` on async updates | PARTIAL PASS | Stream errors in `ChatTile.tsx` use `role="alert"`. `BulkBar` uses `aria-live="polite"`. `TemplatesTab.tsx` save confirmation uses `aria-live="polite"`. However `ContactsTile.tsx`, `DocumentsTile.tsx`, `OemQuickLinksTile.tsx` have no loading/error `aria-live` announcements for their skeleton state transitions. |
| Form labels | PASS | All visible form inputs have `<label htmlFor>`. Hidden fields use `position: absolute; clip: rect(0,0,0,0)`. |
| `autocomplete` on inputs | PARTIAL PASS | `autocomplete="off"` on the chat composer (`ChatTile`) and task title inputs is correct. Settings page API key field has `autocomplete="off"`. However, `TasksPage.tsx` date input has no `autocomplete` attribute (`type="date"` should have `autocomplete="bday"` or `"off"` explicitly). |
| `tabular-nums` on number columns | PASS | Applied consistently across timestamps and counts. |
| `prefers-reduced-motion` honored | PASS | Global override in `index.css`; stream caret static fallback present. |
| `color-scheme: dark` on `:root` | PASS | Present in `index.css`. |
| `<meta name="theme-color">` | PASS | Present in `index.html`. |
| `min-w-0` on truncating flex children | PARTIAL PASS | `ContactsTile.tsx:82` and `AccountChannelTile.tsx:39` have `minWidth: 0` on name containers. `ThreadRow` in `ThreadsTab.tsx:248` has `minWidth: 0`. However `SortableTileSlot` wrapper `<div>` in `TileGrid.tsx:65` has no `minWidth: 0`; if tile content is a flex child that truncates, it may overflow in some browsers. |
| `loading="lazy"` on below-fold images | N/A | No `<img>` elements in the codebase. |
| No `<img>` without dimensions | N/A | No `<img>` elements. |
| Large arrays without virtualization (>50) | PARTIAL | `TasksPage.tsx` renders all filtered tasks without virtualization. A power user with 100+ tasks will see jank. For Phase 1 volumes (personal CRM) this is acceptable but worth flagging. |
| `<select>` background-color/color explicit in dark mode | PASS | `SettingsPage.tsx:44-49` sets explicit `backgroundColor` and `color` on `SELECT_STYLE`. `TasksPage.tsx` inline `<select>` elements use `background: 'transparent'` and `color: 'var(--ink-1)'`. |
| `text-wrap: balance` on headings | PASS | Applied globally and in inline styles. |
| Curly quotes / `…` / `&nbsp;` between number+unit | PARTIAL PASS | `OemDocsTile.tsx:32` uses `Phase&#8239;2` (narrow no-break space — correct). `ChatTile.tsx:295` uses `&#8984;` for ⌘ followed by a space — should be `&nbsp;` between ⌘ and "Enter". `HomePage.tsx:614` uses `Phase&nbsp;2` — correct. |
| No `transition: all` | PASS | Verified across all files. |
| `touch-action: manipulation` | MISSING | No touch-action declarations anywhere. Low priority for a desktop-only app, but noted. |
| Destructive actions need confirmation | FAIL | `TasksPage.tsx:584-590` — Delete button calls `onDelete(task.id)` immediately with no confirmation. `useDeleteTask` fires the DELETE immediately. For a personal CRM where accidental deletion is permanent, this is a usability and data-safety issue. |

---

## Bugs

| ID | File:Line | Severity | Description | Fix |
|---|---|---|---|---|
| B-01 | `InsightsTab.tsx:517` | Medium | `<h2>` "Unconfirmed insights" uses `fontFamily: 'var(--body)'` — violates DESIGN.md rule that h1–h3 use Fraunces/`var(--display)`. | Remove the `fontFamily` override; the global `h1,h2,h3` rule in `index.css` will apply Fraunces automatically. |
| B-02 | `InsightsTab.tsx:279` | Low | `BulkBar` uses `boxShadow: '0 4px 24px rgba(0,0,0,0.18)'` — drop shadow is explicitly forbidden by DESIGN.md ("No drop shadows. Hierarchy is built from rhythm, hairlines, and typography, not z-axis."). | Remove `boxShadow`. Apply `border: '1px solid var(--rule)'` as already present; that suffices. |
| B-03 | `TabStrip.tsx:85` | Critical | `outline: 'none'` inline style on every tab button overrides the global `:focus-visible` stylesheet rule (inline always wins). Keyboard users navigating the Agents page tabs get zero visible focus indicator — a WCAG 2.1 failure. | Remove the `outline: 'none'` line. The global rule provides the ring. |
| B-04 | `ChatTile.tsx:259` | High | `outline: 'none'` on the chat `<textarea>` removes focus visibility. The `onFocus`/`onBlur` `borderColor` swap is cosmetically similar but not a conformant replacement (`outline` sits outside the border box; a color change to the border is inside the box and fails the "visible focus indicator" criterion). | Remove `outline: 'none'`; keep the border-color swap as an enhancement only. |
| B-05 | `TemplatesTab.tsx:290` | High | Same `outline: 'none'` issue on the system-prompt `<textarea>`. | Same fix. |
| B-06 | `SettingsPage.tsx:39` | High | `outline: 'none'` in `INPUT_STYLE` kills focus visibility for all inputs/selects on the Settings page (API key, model select, path fields). Most critical page for keyboard users. | Remove `outline: 'none'` from `INPUT_STYLE`. |
| B-07 | `TasksPage.tsx:438-449` | High | `<div role="button" tabIndex={0}>` used instead of `<button>` for the task-row expand toggle. Violates Vercel guideline and DESIGN.md ("never `<div onClick>`"). `role="button"` on a `<div>` requires the author to manually handle all button keyboard behavior; the implementation handles Enter/Space but misses Shift+Tab focus behavior and `aria-disabled`. | Replace with `<button type="button">`. |
| B-08 | `Sidebar.tsx:57-63` | Critical (correctness) | `STATIC_CUSTOMERS` is a hardcoded array of four fixture organizations. These IDs (`1`, `2`, `3`, `4`) will almost certainly not match the real database IDs. The sidebar will link to wrong org pages or 404. `CustomerPage.tsx` also uses a stub `useOrganizationStub` that constructs a fake name from the URL param. | Replace with `useOrganizations('customer')` hook at merge time. Both stubs must be wired before ship. |
| B-09 | `OemPage.tsx:21-30` | Critical (correctness) | `useOrganizationsStub` returns hardcoded `[Cisco id=1, NetApp id=2, Dell id=3]`. The real `useOrganizations('oem')` hook exists in `api/useOrganizations.ts` and is unused here. | Wire the real hook. |
| B-10 | `CustomerPage.tsx:23-28` | Critical (correctness) | `useOrganizationStub` ignores the database and fabricates `{ id: parseInt(id, 10), name: 'Customer #${id}' }`. All tile data will be fetched against the URL integer, which may not be the real org ID. | Replace with `useOrganization(parseInt(id, 10))` from `api/useOrganizations.ts`. |
| B-11 | `useStreamChat.ts:45` | Medium | `useAgentMessages(threadId ?? 0)` — when `threadId` is `undefined`, this calls the hook with `0`. The `useAgentMessages` hook has `enabled: threadId > 0`, so the query is disabled, but the keys factory still generates `['agent_messages', { threadId: 0 }]` which is a misleading cache entry. | Pass `undefined` explicitly and guard in `useAgentMessages`: `enabled: threadId !== undefined && threadId > 0`. |
| B-12 | `useStreamChat.ts:95-107` | Medium | After stream completes (`onDone`), the assembled assistant message is appended to `optimisticPending` AND the persisted query is invalidated. After refetch, `persistedMessages` will contain the real message from the backend. The merge at line 152 (`[...persistedAsMessages, ...optimisticPending]`) will show the message TWICE — once from the backend and once from `optimisticPending` — until the component re-renders and the optimistic pending is cleared. There is no logic to clear `optimisticPending` after the persisted query catches up. | After invalidation resolves, clear optimistic entries that are now in `persistedMessages`. One approach: compare IDs and remove matches, or reset `optimisticPending` to `[]` inside `onDone` after invalidation. |
| B-13 | `InsightsTab.tsx:564` | Medium | `accepting` prop passed to `InsightRow` is `busyIds.has(note.id) && confirmMutation.isPending`. Since there is a single shared `confirmMutation` instance, `isPending` is `true` during **any** accept, not just this row's. A user accepting row A will show all other rows (which are in `busyIds`) as also "accepting". | Track busy-state per note via `busyIds.has(note.id)` only; remove the `confirmMutation.isPending` conjunction. |
| B-14 | `TasksPage.tsx:584-590` | Medium | Delete button fires immediately, no confirmation. A personal CRM with no multi-user auth and a single SQLite db has no undo path. | Add a `window.confirm()` guard or inline confirmation step before calling `onDelete`. |
| B-15 | `useTileLayout.ts:52-58` | Low | The `useEffect` that syncs `savedLayout → setLayout` runs on every render where `savedLayout` changes, but the dependency is `[savedLayout]` (object identity). If TanStack Query returns a new array reference on every cache hit (which it can on stale-while-revalidate), this effect will overwrite local unsaved layout changes. When the user is mid-drag, a background refetch could silently reset their position. | Guard with `if (!editMode) setLayout(savedLayout)` — pass `editMode` as a dep or use a ref. |
| B-16 | `ReferenceTile.tsx:36-48` | Low | `ReferencePopover` adds document-level `keydown` and `mousedown` listeners inside a `useEffect` with `[onClose]` in deps. Because `onClose` is `() => setOpenEntry(null)` defined inline in the render of `ReferenceTile`, it gets a new reference every render, causing the effect to re-subscribe on every render of the parent. | Wrap `onClose` in `useCallback` in `ReferenceTile`. |
| B-17 | `OemInsightsTab` / `InsightsTab.tsx` (renderless fetchers) | Low | `OrgInsightsFetcher` runs a `useEffect` without a deps array on every render — lines 44-51 fire unconditionally and only bail if IDs match. With many orgs this is a lot of overhead per render cycle. | Add `// eslint-disable-next-line react-hooks/exhaustive-deps` and document why it is intentional, or restructure with `useEffect([insights])`. |

---

## React anti-patterns

| ID | File:Line | Severity | Description | Fix |
|---|---|---|---|---|
| RP-01 | `TasksPage.tsx:837-858` | Low | `status` and `due` are derived from `searchParams` via multi-ternary chains on every render. This is fine (no `useState` storing derived data), but the ternaries are complex enough to benefit from a helper function or `useMemo`. | Extract a `parseFilters(searchParams)` function. |
| RP-02 | `SettingsPage.tsx` (`DefaultModelSection:283-289`) | Low | `useEffect([existing?.value, dirty])` uses optional chaining in the dependency array. If `existing` is `undefined` (loading), the effect fires with `undefined` and silently does nothing. Then when it resolves it fires again. This is correct but fragile — the effect also sets `selected` which is `useState`, causing a re-render that re-runs the effect. A `useRef` for `hasInitialized` would prevent the double-fire. | Add an initialized-ref guard. |
| RP-03 | `TemplatesTab.tsx:174-178` | Low | `useEffect([config])` resets `prompt` and `tools` whenever `config` changes. If `config` arrives after the user has already started editing (due to React Strict Mode double-invoke or a background refetch), their edits are silently discarded. The `isDirty` flag is reset too. | Guard: `if (config && !isDirty) { ... }` (same pattern as `DefaultModelSection` but not applied here). |
| RP-04 | `InsightsTab.tsx:47-51` | Low | The `OrgInsightsFetcher` effect (lines 43-51) fires on every render because `insights` is a computed constant, not memoized. React Strict Mode will double-invoke this in development. Wrap `insights` in `useMemo`. | `const insights = useMemo(() => data?.filter(...) ?? [], [data])`. |
| RP-05 | `ChatTile.tsx:37-41` | Low | Auto-scroll `useEffect` depends on `[messages, stream.partial]`. `stream.partial` changes on every token delta, triggering a layout read (`scrollHeight`) on every token. This is correct behavior but slightly expensive. A `useRef` on the feed and a `requestAnimationFrame` debounce would keep it smooth on long streams. Low impact at current volumes. | Consider batching via `requestAnimationFrame`. Not blocking. |
| RP-06 | `useStreamChat.ts:143` | Medium | `retry()` calls `setOptimisticPending` to remove the last user-message, then calls `send(last)` synchronously. `send` itself calls `setOptimisticPending((prev) => [...prev, { role: 'user', content }])`. Because both are synchronous state updates in the same event handler, React 18 batches them — so the net effect should be correct. However this is brittle: if `setFailed(null)` in `retry` causes a re-render before `send` runs in a concurrent future, the order breaks. | Pull the retry logic into a single batched update using `React.startTransition` or restructure `send` to accept an option to suppress the optimistic user-message append. |

---

## TanStack Query / Zustand / streaming concerns

### TanStack Query

| ID | Location | Severity | Issue |
|---|---|---|---|
| TQ-01 | `useTileLayout.ts:34` | Low | `useTileLayout` constructs its own `queryKey: ['settings', settingKey]` manually instead of using `settingKeys.one(settingKey)` from `useSettings.ts`. If `useSetSetting` invalidates `settingKeys.one(key)` after a save, the tile-layout query (which uses a raw array) will NOT be invalidated because the key objects differ in reference. Saving a layout from the Settings page path would not update the tile-layout query. | Reuse `settingKeys.one(settingKey)` from `useSettings.ts`. |
| TQ-02 | `useTileLayout.ts:64-76` | Low | `saveToServer` mutation uses `mutateAsync` but has no error handling at the call site in `save()`. If the PUT to `/api/settings` fails, the local `layout` state is already updated (line 92: `setLayout(tiles)` runs before the async call). The layout diverges silently. | Add `.catch(err => console.error(...))` in `save`, or add `onError` to the mutation that reverts `setLayout(serverLayout)`. |
| TQ-03 | `HomePage.tsx:270-278` | Low | `RecentNotesWidget` calls `useQueries` with `orgs.map(org => ({ queryKey: noteKeys.list(org.id, false), queryFn: () => request(...) }))`. If `orgs` changes length (e.g. new org added), React will generate a different number of hooks. TanStack Query `useQueries` supports dynamic arrays, but `queryFn` is inlined without `staleTime` override. Combined with the global 30 s stale time, this is fine — but the notes queries run independently from `useNotes()` calls on child tiles for the same org, so two consumers of the same key each fetch separately at mount. | Accept as acceptable for Phase 1. Document the fan-out pattern for a future aggregator endpoint. |
| TQ-04 | `ThreadsTab.tsx:24-30` | Low | `useAllThreads` uses `queryKey: ['agent_threads_all', { limit }]`. When `limit` increases via "Load more", a new key is generated, causing a full refetch rather than appending. The previous page's data is discarded. | Use `keepPreviousData: true` (TanStack Query v5: `placeholderData: keepPreviousData`) so the old list stays visible during the new fetch. |
| TQ-05 | `useAgentConfigs.ts` | Low | The `agentConfigKeys` factory only has `all()`. If a future mutation needs to invalidate per-org config, there is no `one(id)` key. Not a bug now but worth noting before adding per-org overrides. |

### Zustand

| ID | Location | Severity | Issue |
|---|---|---|---|
| ZU-01 | `useUiStore.ts` | PASS | Stores only `sidebarCollapsed` (ephemeral UI) and `theme` (long-lived preference). No server data. Compliant with the architecture rule. |
| ZU-02 | `ThemeToggle.tsx:27-33` | Low | `useEffect([theme])` syncs the `<html>` class. This is correct. However `ThemeToggle` is rendered inside `Sidebar` which is rendered on every route. If the component unmounts and remounts (e.g. fast navigation), the effect re-runs but the class is already present — benign but redundant. Not a bug. |

### Streaming

| ID | Location | Severity | Issue |
|---|---|---|---|
| ST-01 | `streamChat.ts:104-107` | Low | `signal?.aborted` is checked before `reader.read()` in the loop. If the abort fires between the read returning and the next loop iteration, there is a one-iteration delay before detection. This is standard for AbortController usage and benign at human perception scales. |
| ST-02 | `useStreamChat.ts:61-65` | Low | `abortControllerRef.current?.abort()` is called to cancel any previous stream before starting a new one. The previous stream's `.catch` handler then fires with an `AbortError`. Since `ctrl.signal.aborted` in the catch checks the **new** controller, not the aborted one, the check `ctrl.signal.aborted` uses the **new** `ctrl` captured in the closure, which has not been aborted — the old stream's catch will see `ctrl.signal.aborted === false` and may show an error banner. The `ctrl` variable is captured by the closure over `send`, and a new `ctrl` is created each call. The old `streamChat` promise has `signal: oldCtrl.signal`; the `.catch` handler references `ctrl` from the closure which is now the **new** `ctrl`. Verdict: **this is a real bug.** Old streams that are cancelled by a new `send()` call will set `setFailed(message)` instead of silently discarding. | Store the abort controller in a local variable before the closure is replaced: capture `const myCtrl = ctrl` inside the streamChat `.catch` and check `myCtrl.signal.aborted`. |
| ST-03 | `useStreamChat.ts:95-108` | Medium | See Bug B-12 above — duplicate messages in the feed until `optimisticPending` is cleared. |
| ST-04 | `streamChat.ts:57-58` | Low | `res.body?.getReader()` — if `res.body` is null, throws a helpful error. The optional chain means `reader` could be `undefined` and the null-check on line 58 handles it. Correct. |

---

## Type safety

| ID | Location | Severity | Issue |
|---|---|---|---|
| TS-01 | `useTileLayout.ts:41` | Low | `const body: { key: string; value: string } = await res.json() as { key: string; value: string }` — unchecked `as` cast. If the backend returns an unexpected shape, `body.value` will be `undefined` and `JSON.parse(undefined)` will throw, caught by the surrounding `try/catch` which silently falls back to `defaultLayout`. The fallback mitigates but the cast is still unverified. | Use a Zod schema or at minimum check `typeof body.value === 'string'` before parsing. |
| TS-02 | `ReferenceTile.tsx:129` | Low | `org.metadata?.locations as string | undefined` — unchecked cast from `MetadataValue` (which per the types file is `string | number | boolean | null | Record<string, unknown>`) to `string`. If `locations` is a number or array, `.split(',')` will throw at runtime. | Check `typeof locations === 'string'` before splitting. |
| TS-03 | `ReferenceTile.tsx:150` | Low | Same pattern: `org.metadata?.portal_url as string | undefined` — unguarded cast from `MetadataValue`. | Type-guard before use. |
| TS-04 | `TemplatesTab.tsx:152-159` | Low | `parseToolsEnabled` accepts `Record<string, unknown>` for `raw` and then does `val as Record<string, unknown>` to check for `.enabled`. This works but the inner `(val as Record<string, unknown>).enabled` is unchecked — it could throw if `val` is a primitive. | `typeof val === 'object' && val !== null && !Array.isArray(val)` before the cast. |
| TS-05 | `SettingsPage.tsx:273` | Low | `const v = existing.value as ModelValue` — the value from the backend is cast to the union without checking it's in `MODEL_OPTIONS`. If an old model name is stored in the DB, the select element shows a blank option but no error. | Validate with `MODEL_OPTIONS.some(o => o.value === v)` (already done on line 285, but the initial cast on 273 is still unguarded). |
| TS-06 | `ChatTile.tsx` | Low | No `any` usages found. `useStreamChat` typings are complete. |
| TS-07 | Global | PASS | No `as any` found across the codebase. The codebase is generally well-typed for Phase 1. |

---

## Error / loading / empty states — coverage matrix

| Page / Component | Loading | Error | Empty | Notes |
|---|---|---|---|---|
| `HomePage` — TodayTasksWidget | PASS | PASS (TileError with Retry) | PASS | |
| `HomePage` — RecentNotesWidget | PASS | PASS (TileError with Retry) | PASS | |
| `HomePage` — AgentInsightsWidget | PASS | PASS (TileError with Retry) | PASS | |
| `HomePage` — TodaysReportsWidget | N/A | N/A | PASS (Phase 2 placeholder) | |
| `CustomerPage` | PASS (stub) | MISSING | PASS | No error state if `useOrganization` fails. |
| `CustomerPage` — ChatTile | PASS (implicit — empty feed) | PASS (role="alert" banner) | PASS (empty feed) | |
| `CustomerPage` — TasksTile | PASS | MISSING | PASS | No error rendered if useTasks fails. |
| `CustomerPage` — RecentNotesTile | PASS | MISSING | PASS | No error rendered if useNotes fails. |
| `CustomerPage` — ContactsTile | PASS | MISSING | PASS | No error rendered. |
| `CustomerPage` — PriorityProjectsTile | PASS | MISSING | PASS | No error rendered. |
| `CustomerPage` — DocumentsTile | PASS | MISSING | PASS | No error rendered. |
| `CustomerPage` — ReferenceTile | N/A (org data is silent) | MISSING | PASS ("No profile data") | No error if useOrganization fails. |
| `TasksPage` | PASS | PASS (inline alert + Retry) | PASS | |
| `OemPage` | PASS | MISSING | PASS | No error if useOrganizations fails. |
| `OemPage` — AccountChannelTile | PASS | MISSING | PASS | |
| `OemPage` — OemQuickLinksTile | PASS | MISSING | PASS | |
| `AgentsPage` — TemplatesTab | PASS | PASS (role="alert") | N/A (always two cards) | |
| `AgentsPage` — ThreadsTab | PASS | PASS (role="alert") | PASS | |
| `AgentsPage` — InsightsTab | PASS | MISSING | PASS | No error state if `useOrganizations` fails after the loading spinner. |
| `SettingsPage` | PASS (per-field) | PASS (inline error per form) | N/A | |
| `ReportsPage` | N/A | N/A | PASS (Phase 2 placeholder) | |
| `NotFound` | N/A | N/A | PASS | |

**Pattern observed**: The tile components (`ContactsTile`, `TasksTile`, `RecentNotesTile`, `DocumentsTile`, `PriorityProjectsTile`, etc.) all use the stub-injection pattern `_useContacts?: …` and their stubs return `{ data: undefined, isLoading: false }`. When the real hooks are wired in, error states will need to be added to each tile, as none of them currently render anything when `isError` is true — they will silently show an empty state, indistinguishable from "no data."

---

## URL state

| State | Lives in URL? | Notes |
|---|---|---|
| Active customer | PASS | `/customers/:id` |
| Active OEM tab | PASS | `/oem/:id` |
| Tasks filters (status, due, org) | PASS | `?status=open&due=today&org=3` via `useSearchParams` |
| Active agent thread | MISSING | `threadId` is held in component state (`CustomerPage` passes nothing; `ChatTile` receives optional `threadId` prop defaulting to `undefined`). Per DESIGN.md, active thread should be `?thread=42` in the URL. A refresh loses the thread context. |
| Agents page active tab | MISSING | `AgentsPage` stores `activeTab` in `useState`. Refreshing always lands on "templates". The tab should be a URL param or path segment. |

---

## Verdict

The codebase is well-structured for Phase 1: layer rules are followed, TanStack Query is used correctly, Zustand is ephemeral-only, streaming logic is largely sound, and typography + color tokens are faithfully implemented. The design system aesthetics are coherent and the Fraunces/Switzer/warm-paper direction comes through clearly.

**Ship-blocking issues** (must fix before merge):

1. **B-03** — `TabStrip.tsx:85` `outline: 'none'` inline style kills all keyboard focus visibility on the Agents tab strip. WCAG 2.1 AA failure.
2. **B-04 / B-05 / B-06** — `outline: 'none'` on the chat textarea, system-prompt textarea, and all Settings inputs. Three independent focus-visibility regressions.
3. **B-08 / B-09 / B-10** — Critical data-correctness: hardcoded customer/OEM stubs must be replaced with real hooks before any testing against a live database. The stubs are not gated and will silently produce wrong data.
4. **ST-02** — Streaming abort race: when a second `send()` cancels the first, the cancelled stream's `.catch` checks the wrong `AbortSignal` and may show a spurious error banner.
5. **B-12** — Optimistic message duplication: after a successful stream, the assistant message appears twice in the feed until the optimistic array is cleared.
