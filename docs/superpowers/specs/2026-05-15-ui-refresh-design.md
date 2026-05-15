# CSV Doctor — UI Refresh
**Date:** 2026-05-15
**Status:** Approved — ready for implementation planning

---

## Overview

A full UI restructure that turns the app into a clear top-to-bottom workflow:
**Upload → Diagnose → Clean → Filter → Analyse → Download**

Four changes in this iteration:
1. **Full-width layout** — remove the `max-width` cap; content stretches edge-to-edge
2. **Collapsible diagnosis sidebar** — hide/show toggle; table expands to full width when hidden
3. **Filter slots** — replace the per-column inline toolbar with a dedicated filter section (1–5 dynamic slots, each with a column picker + value field)
4. **Analysis panel** — a dedicated section below the filters with a column picker and stat cards (Sum, Avg, Count, Min, Max)

The download action moves to a permanent action bar at the bottom of the content area.

---

## Part 1 — Layout

### 1.1 Full-width page

Remove `max-width: 1500px` from `.main`. Replace with:

```css
.main {
  flex: 1;
  width: 100%;
  padding: 2rem 2% 3rem;
}
```

The topbar retains its own padding (`padding: 1rem 2%`). All content sections stretch edge-to-edge within the 2% side padding.

### 1.2 Page sections (post-upload, in order)

1. Topbar (sticky)
2. File bar — filename, size, row/col count, "Upload another file" button
3. Stats row — 4 quick-stat chips
4. Workspace — sidebar + table (CSS grid, sidebar collapsible)
5. Filters section
6. Analysis panel
7. Download bar

Sections 4–7 are rendered only when a file is loaded. The hero + upload zone replace them when no file is present.

---

## Part 2 — Collapsible Diagnosis Sidebar

### 2.1 Expanded state (default)

- Fixed width: `360px`
- Header row: "Diagnosis" label + issue count badge (e.g. `8 issues`) + **"Hide ◀"** button flush right
- Issue list: each issue is a card with icon, label, affected-cell count, severity chip (`low` / `medium` / `high`), and an enable/disable toggle switch
- "Enable all" link above the list
- **"Apply fixes"** button at the bottom — disabled until at least one issue is toggled on; becomes primary style when ready
- Grid column: `grid-template-columns: 360px 1fr`

### 2.2 Collapsed state

- Sidebar shrinks to `40px` wide
- Content hidden; only a vertical **"▶ Diagnosis (N)"** rotated label + chevron icon visible
- The workspace grid changes to `grid-template-columns: 40px 1fr` — the preview table, filters, analysis panel, and download bar all expand to fill the remaining width
- Clicking the strip re-expands to 360px

### 2.3 State management

- `sidebarOpen: boolean` added to `AppState`, default `true`
- Toggled by `handleToggleSidebar()` — calls `render()`
- Resets to `true` when a new file is uploaded (`handleFile`)

### 2.4 CSS

Two workspace grid states controlled by a class on the workspace element:

```css
.workspace { grid-template-columns: 360px 1fr; }
.workspace.sidebar-collapsed { grid-template-columns: 40px 1fr; }
```

The sidebar panel itself:

```css
.issues-sidebar { overflow: hidden; transition: width 0.2s ease; }
.issues-sidebar.collapsed { width: 40px; }
```

---

## Part 3 — Filter Slots

Replaces `src/ui/analysis-toolbar.ts` entirely. The new component is `src/ui/filter-slots.ts`.

### 3.1 State

```ts
interface FilterSlot {
  column: string;   // empty string = unset
  value: string;
}
```

Added to `AppState`:
```ts
filterSlots: FilterSlot[];   // replaces columnFilters: Map<string, string>
```

Initial state: `[{ column: '', value: '' }]` (one empty slot).

Reset to initial on `handleFile`, `handleRevert`, `handleReset`.

### 3.2 `src/ui/filter-slots.ts` — new file

```ts
export interface FilterSlotsCallbacks {
  onSlotChange: (index: number, column: string, value: string) => void;
  onAddSlot: () => void;
  onRemoveSlot: (index: number) => void;
  onClearAll: () => void;
}

export function renderFilterSlots(
  headers: string[],
  allRows: Row[],
  slots: FilterSlot[],
  filteredCount: number,
  cb: FilterSlotsCallbacks
): HTMLElement
```

**Rendered structure:**

```
┌─ section.filters-section ──────────────────────────────────┐
│  [Filter data]  [2 active ×]  [Clear all]                  │
│                                                             │
│  [Column ▾]  [Value…]  [✕]     ← slot 1                   │
│  [Column ▾]  [Value…]  [✕]     ← slot 2                   │
│                                                             │
│  [+ Add filter]  (greyed when 5 slots exist)               │
└─────────────────────────────────────────────────────────────┘
```

**Column dropdown:** lists all `headers`; first option is `"— Select column —"` (value `""`).

**Value field:**
- If the selected column has ≤ 15 unique non-empty values in `allRows` → `<select>` with "All" + unique values
- Otherwise → `<input type="text">` with 250ms debounce
- Disabled / placeholder `"Select a column first"` when no column is chosen

**Slot interactions:**
- Changing the column resets the value to `""`
- `[✕]` remove button on each slot; only shown when there are ≥ 2 slots (cannot remove the last one)
- `[+ Add filter]` adds a new empty slot; disabled at 5 slots
- `[Clear all]` resets all slots to one empty slot; only shown when any slot has a non-empty column

**Active filter count badge:** counts slots where `column !== ''` and `value !== ''`.

### 3.3 `getFilteredRows` update

Replace the `Map<string, string>` parameter with `FilterSlot[]`:

```ts
function getFilteredRows(rows: Row[], headers: string[], slots: FilterSlot[]): Row[] {
  const active = slots.filter(s => s.column && s.value);
  if (active.length === 0) return rows;
  return rows.filter(row =>
    active.every(({ column, value }) => {
      const idx = headers.indexOf(column);
      if (idx === -1) return true;
      return (row[idx] ?? '').toLowerCase().includes(value.toLowerCase());
    })
  );
}
```

Multiple slots use AND logic.

---

## Part 4 — Analysis Panel

Replaces the tfoot aggregation in the preview table. The table no longer has a sticky footer or column-click handler. Analysis moves to a standalone section below the filters.

### 4.1 State

```ts
activeColumn: string | null;   // kept in AppState, set by analysis panel
```

Reset to `null` on `handleFile`, `handleRevert`, `handleReset`.

### 4.2 `src/ui/analysis-panel.ts` — new file

```ts
export function renderAnalysisPanel(
  headers: string[],
  filteredRows: Row[],
  activeColumn: string | null,
  totalFilteredCount: number,
  onColumnSelect: (col: string | null) => void
): HTMLElement
```

**Rendered structure:**

```
┌─ section.analysis-section ─────────────────────────────────┐
│  Analyse a column                                           │
│  [Select a column… ▾]                                      │
│                                                             │
│  ┌──────┐ ┌──────┐ ┌───────┐ ┌──────┐ ┌──────┐           │
│  │ Sum  │ │ Avg  │ │ Count │ │ Min  │ │ Max  │           │
│  │ 9420 │ │  47  │ │  200  │ │  2   │ │  99  │           │
│  └──────┘ └──────┘ └───────┘ └──────┘ └──────┘           │
│  Based on 200 filtered rows                                 │
└─────────────────────────────────────────────────────────────┘
```

**Column picker:** a `<select>` with `"— Select a column to analyse —"` (value `""`) + all headers. Selecting `""` clears `activeColumn`. 

**Stat cards:** appear only when `activeColumn !== null`.

| Condition | Sum | Avg | Count | Min | Max |
|---|---|---|---|---|---|
| ≥ 50% of non-empty filtered cells parse as numbers | numeric | numeric | non-empty count | numeric min | numeric max |
| < 50% parse as numbers | `—` | `—` | non-empty count | shortest string | longest string |

Numbers formatted with `toLocaleString()` (2 decimal places for Sum/Avg).

**Footer note:** `"Based on N filtered rows"` — always shows the filtered count so the user knows stats reflect their current filter state. If no filters are active: `"Based on all N rows"`.

**Empty state:** when `filteredRows` is empty after filtering: `"No rows to analyse — clear your filters first."` in place of the stat cards.

### 4.3 Remove from `preview-table.ts`

- Remove `activeColumn`, `onColumnClick`, `columnFilters`, `allRows`, `onFilterChange`, `onClearFilters` from `PreviewOptions`
- Remove `buildTfoot`, `computeAggregates`, `fmt` functions
- Remove `<tfoot>` from the rendered table
- Remove column-click event wiring
- Remove `th-active` and `col-active` CSS classes from header/cell rendering
- Remove the `renderAnalysisToolbar` import

The `analysis-toolbar.ts` file is deleted entirely (replaced by `filter-slots.ts`).

---

## Part 5 — Download Bar

Moves the download action out of `renderFileBar` and into a permanent bottom section.

### 5.1 `src/ui/download-bar.ts` — new file

```ts
export function renderDownloadBar(
  filteredCount: number,
  hasResult: boolean,
  hasFilters: boolean,
  onDownload: () => void
): HTMLElement
```

**Rendered structure:**

```
┌─ section.download-bar ─────────────────────────────────────┐
│  Exporting 500 rows           [⬇ Download cleaned CSV]     │
└─────────────────────────────────────────────────────────────┘
```

**States:**

| Condition | Note text | Button |
|---|---|---|
| No clean applied yet | `"Apply fixes before downloading"` | Disabled, greyed |
| Clean applied, no filters | `"Exporting N rows"` | Enabled |
| Clean applied, filters active | `"Exporting N filtered rows"` | Enabled |
| Filters produce 0 rows | `"No rows to export"` | Disabled |

The "Revert to original" button moves from the filebar into the download bar (right-aligned, secondary/ghost style), visible only after a clean has been applied.

### 5.2 `renderFileBar` update

Remove the export button and revert button from the filebar. The filebar retains only: filename, size/row/col meta, and "Upload another file" button.

---

## Part 6 — Files Changed

| File | Change |
|---|---|
| `src/types.ts` | Add `FilterSlot` interface |
| `src/main.ts` | Replace `columnFilters: Map` with `filterSlots: FilterSlot[]`; add `sidebarOpen: boolean` to `AppState`; new handlers; updated `getFilteredRows` signature; updated render pipeline; remove `hasActiveFilters` and old filter logic; wire all new components |
| `src/ui/filter-slots.ts` | **New** — filter slots component |
| `src/ui/analysis-panel.ts` | **New** — analysis panel with column picker + stat cards |
| `src/ui/download-bar.ts` | **New** — download action bar |
| `src/ui/analysis-toolbar.ts` | **Delete** — replaced by `filter-slots.ts` |
| `src/ui/preview-table.ts` | Remove `tfoot`, `activeColumn`, `onColumnClick`, `columnFilters`, `allRows`, `onFilterChange`, `onClearFilters` from `PreviewOptions`; remove toolbar integration; remove `buildTfoot`/`computeAggregates`/`fmt` functions |
| `src/styles.css` | Full-width layout; sidebar collapse animation; filter slots; analysis panel; download bar |

---

## Part 7 — Edge Cases

| Scenario | Behaviour |
|---|---|
| Slot column changed | Value field resets to empty |
| All 5 slots filled | "+ Add filter" button disabled |
| Only 1 slot remains | Remove `[✕]` button hidden |
| Analysis column removed by sparse-columns fix | `activeColumn` reset to `null` on clean |
| Filters active + 0 rows | Download button disabled; analysis panel shows "No rows to analyse" |
| Sidebar collapsed on mobile (< 768px) | Sidebar hidden entirely (not a 40px strip); full-width layout always |

---

## Out of Scope

- Drag-to-reorder filter slots
- Save/restore filter presets
- Export filters as query strings
- Column sorting in the table
