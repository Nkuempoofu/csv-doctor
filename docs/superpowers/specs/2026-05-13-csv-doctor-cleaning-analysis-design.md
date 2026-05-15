# CSV Doctor — Extended Cleaning & In-Table Analysis
**Date:** 2026-05-13
**Status:** Approved — ready for implementation planning

---

## Overview

Two parallel additions to CSV Doctor:

1. **Four new cleaning operations** — plugged into the existing issues pipeline
2. **Integrated analysis layer** — filter rows and aggregate a selected column directly inside the preview table, with no new navigation

The single-page upload → diagnose → clean → analyze → download flow is preserved.

---

## Part 1 — New Cleaning Operations

### 1.1 New IssueIds

Added to `src/types.ts` `IssueId` union:

```ts
| 'currency-numbers'
| 'header-issues'
| 'contact-formats'
| 'sparse-columns'
```

### 1.2 `currency-numbers` — Number / currency noise

**Detector (`analyzer.ts`):**
Scans every column. A column triggers this issue if ≥ 30% of its non-empty cells match the pattern: optional currency symbol (`$`, `€`, `£`, `¥`, `R`) + optional whitespace + digits with optional comma separators and optional decimal. If mixed currencies are detected across cells in the same column, the issue description notes this.

**Fix (`cleaner.ts`):**
For each cell in a flagged column: strip leading currency symbol and whitespace, remove thousands-separator commas, normalise decimal point to `.`. Result is a plain numeric string (e.g. `$1,200.00` → `1200.00`, `€ 850` → `850`, `1,000` → `1000`).

**Severity:** Medium. **Default:** enabled.

---

### 1.3 `header-issues` — Bad column headers

**Detector (`analyzer.ts`):**
Checks the `headers` array (not rows). Flags if any header has leading/trailing whitespace, if two or more headers are identical after trimming and lowercasing, or if headers in the same file use more than one casing convention (all-lower, Title Case, camelCase, UPPER, snake_case detected via regex patterns).

**Fix (`cleaner.ts`):**
Applied to `ParsedFile.headers` before row processing:
1. Trim leading/trailing whitespace from every header.
2. Deduplicate: if normalised names collide, append `_2`, `_3`, etc. to the later occurrences.
3. Normalise casing: convert all headers to Title Case (matching the existing `mixed-case` cell fix convention).

**Severity:** Low. **Default:** enabled.

---

### 1.4 `contact-formats` — Phone / email inconsistencies

**Detector (`analyzer.ts`):**
A column is a *phone column* if ≥ 40% of non-empty cells match any common phone pattern (digits, spaces, dashes, parentheses, `+` prefix). The issue fires if a phone column uses 3 or more distinct formats.

A column is an *email column* if ≥ 40% of non-empty cells contain `@`. The issue fires if any cell in an email column fails a basic email regex (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`).

**Fix (`cleaner.ts`):**
- **Phones:** Strip all non-digit characters except a leading `+`. If the result is 10 digits and starts with `0`, reformat as `0XX XXX XXXX`. If it starts with a country code (e.g. `27`), reformat as `+27 XX XXX XXXX`. Other lengths are left stripped but not reformatted.
- **Emails:** Not auto-changed — invalid email cells are cleared to empty (treated as unrecoverable). The issue description warns the user of this behaviour.

**Severity:** Medium. **Default:** disabled (destructive for emails). User must explicitly enable.

---

### 1.5 `sparse-columns` — Nearly-empty columns

**Detector (`analyzer.ts`):**
For each column, count empty cells (empty string or whitespace-only). If `emptyCount / totalRows >= 0.80`, the column is sparse. Reports the count of sparse columns and their names.

**Fix (`cleaner.ts`):**
Removes the entire column from every row and from `headers`. Guard: if removing all flagged sparse columns would leave the file with zero columns, the fix is blocked and the issue description shows: "Cannot remove — file would have no columns remaining."

**Severity:** Low. **Default:** disabled (column removal is destructive).

---

## Part 2 — Integrated Analysis Layer

### 2.1 New state in `main.ts`

```ts
let activeColumn: string | null = null;
let columnFilters: Map<string, string> = new Map(); // header → filter string
```

A derived value `filteredRows` is computed on every render:
```
filteredRows = displayRows.filter(row =>
  every active filter: row[colIndex] matches filter string (case-insensitive contains)
)
```
`displayRows` is the cleaned rows if a clean has been applied, otherwise the raw parsed rows.

### 2.2 `src/ui/analysis-toolbar.ts` — New file

Renders a slim toolbar above the preview table. Appears as soon as a file is parsed.

**Filter controls:**
- One control per column.
- If a column has ≤ 15 unique non-empty values → renders a `<select>` with "All" + each unique value.
- Otherwise → renders a text `<input>` with 250 ms debounce.
- An active filter (anything other than "All" / non-empty string) highlights the control with a cyan left border.
- When any filter is active, a pill appears at the right end of the toolbar: `Showing 142 of 500 rows`. When all filters are cleared, the pill disappears.
- A "Clear all filters" link appears alongside the pill when filters are active.

**Toolbar overflow:** On narrow viewports (< 768 px) or when a file has > 8 columns, the toolbar scrolls horizontally inside a `overflow-x: auto` container.

### 2.3 Updates to `src/ui/preview-table.ts`

**Column header click:**
- Clicking a `<th>` toggles `activeColumn` between that header name and `null`.
- The active column's `<th>` receives an `active` class (cyan underline).
- Every `<td>` in the active column receives an `active-col` class (subtle tinted background).
- Clicking the same header again clears `activeColumn` and removes the footer.

**Sticky aggregation footer:**
Rendered as a `<tfoot>` row. Visible only when `activeColumn !== null`. Always sticks to the bottom of the visible table area (`position: sticky; bottom: 0`).

The footer row spans the full table. Only the active column's cell is populated; all others are blank. Content:

| Condition | Stats shown |
|---|---|
| Column is numeric (≥ 50% of filtered non-empty cells parse as numbers) | `Sum`, `Avg`, `Count`, `Min`, `Max` — all computed over filtered rows only |
| Column is text | `Count` (non-empty), `Min` (shortest value), `Max` (longest value); `Sum` and `Avg` show `—` |

Numbers in the footer are formatted with `toLocaleString()` (comma-separated, 2 decimal places for Sum/Avg).

Stats always reflect `filteredRows` — so filtering to `Region = ZA` and selecting `Cost` shows the ZA-only total.

### 2.4 Download behaviour update

The "Download cleaned" button is updated:
- If `columnFilters` has any active filter, only `filteredRows` are exported.
- A note appears next to the button (updated reactively):
  - Filters active: `Exporting 142 rows (filtered)`
  - No filters: `Exporting 500 rows`
- The button is **disabled** (greyed out, `disabled` attribute set) when `filteredRows.length === 0`.

---

## Part 3 — Edge Cases & Guards

| Scenario | Behaviour |
|---|---|
| Currency column has mixed currencies (`$100`, `€200` in same column) | Strip symbols and separators; issue description notes mixed currencies were present |
| Header normalisation creates a collision | Append `_2`, `_3`, etc. to later duplicates |
| Sparse fix would remove all columns | Blocked; issue description: "Cannot remove — file would have no columns remaining" |
| No rows match current filters | Table body shows: "No rows match the current filters" (full-width empty state row) + "Clear filters" button in toolbar |
| Sum clicked on 100% text column | Footer shows `Sum: —`, `Avg: —`; Count/Min/Max still populate |
| File has 0 exportable rows (filters + cleaning = empty) | Download button disabled |
| Phone number has non-standard length after stripping | Digits stripped but not reformatted; left as-is |

---

## Part 4 — Files Changed

| File | Change type |
|---|---|
| `src/types.ts` | Add 4 new `IssueId` values |
| `src/core/analyzer.ts` | Add 4 new detector functions; register in `analyze()` |
| `src/core/cleaner.ts` | Add 4 new fix functions; register in `clean()` switch |
| `src/main.ts` | Add `activeColumn`, `columnFilters` state; add `filteredRows` derivation; wire toolbar + footer events |
| `src/ui/analysis-toolbar.ts` | **New file** — filter bar component |
| `src/ui/preview-table.ts` | Column header click handler; `<tfoot>` aggregation footer; active-column highlight |
| `src/styles.css` | Toolbar styles; active column highlight; footer styles; filter pill; disabled download state |
| `README.md` | Update "Issues detected" table with 4 new entries; add Analysis section |

No changes to `parser.ts`, `exporter.ts`, `stats.ts`, or `lib/`.

---

## Out of Scope (this iteration)

- Multi-condition filter rules (e.g. `Cost > 500 AND Region = ZA`)
- Column sorting
- Excel `.xlsx` input
- Custom find/replace rules
- PWA / offline install
