# CSV Doctor — UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the UI into a clear Upload → Diagnose → Clean → Filter → Analyse → Download flow with full-width layout, collapsible sidebar, slot-based filters, and a dedicated analysis panel.

**Architecture:** Seven focused tasks in dependency order — types and pure utilities first, then new UI components, then simplify existing components, then wire everything in `main.ts`, then CSS. Each task compiles cleanly before the next begins.

**Tech Stack:** TypeScript 5, Vite 5, Vitest, Papa Parse 5, vanilla DOM (no framework)

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| **Modify** | `src/types.ts` | Add `FilterSlot` interface |
| **Create** | `src/lib/filter.ts` | `getFilteredRows(rows, headers, slots)` pure function |
| **Create** | `src/lib/__tests__/filter.test.ts` | Unit tests for `getFilteredRows` |
| **Create** | `src/ui/filter-slots.ts` | Filter slot controls component (1–5 dynamic slots) |
| **Create** | `src/ui/analysis-panel.ts` | Column picker + stat cards component |
| **Create** | `src/ui/__tests__/analysis-panel.test.ts` | Unit tests for `computeAggregates` |
| **Create** | `src/ui/download-bar.ts` | Download action bar component |
| **Modify** | `src/ui/issues-panel.ts` | Add `onHide` callback + hide button to header |
| **Modify** | `src/ui/preview-table.ts` | Remove tfoot, column-click, toolbar integration |
| **Delete** | `src/ui/analysis-toolbar.ts` | Replaced by `filter-slots.ts` |
| **Modify** | `src/main.ts` | New state, new handlers, new render pipeline |
| **Modify** | `src/styles.css` | Full-width, sidebar collapse, filter slots, analysis panel, download bar |

---

## Task 1: Add `FilterSlot` to `types.ts` + create `src/lib/filter.ts`

**Files:**
- Modify: `src/types.ts`
- Create: `src/lib/filter.ts`
- Create: `src/lib/__tests__/filter.test.ts`

- [ ] **Step 1: Add `FilterSlot` interface to `src/types.ts`**

Append this after the `AnalyzerState` interface at the end of the file:

```typescript
/** A single active filter slot — column name + match string. */
export interface FilterSlot {
  column: string;  // empty string means this slot is unset
  value: string;
}
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/__tests__/filter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getFilteredRows } from '../filter';
import type { FilterSlot } from '../../types';

const headers = ['Name', 'Region', 'Cost'];
const rows = [
  ['Alice', 'ZA', '100'],
  ['Bob',   'US', '200'],
  ['Carol', 'ZA', '300'],
];

describe('getFilteredRows', () => {
  it('returns all rows when no slots have column set', () => {
    const slots: FilterSlot[] = [{ column: '', value: '' }];
    expect(getFilteredRows(rows, headers, slots)).toEqual(rows);
  });

  it('returns all rows when slot has column but empty value', () => {
    const slots: FilterSlot[] = [{ column: 'Region', value: '' }];
    expect(getFilteredRows(rows, headers, slots)).toEqual(rows);
  });

  it('filters by a single active slot', () => {
    const slots: FilterSlot[] = [{ column: 'Region', value: 'ZA' }];
    const result = getFilteredRows(rows, headers, slots);
    expect(result).toHaveLength(2);
    expect(result[0][0]).toBe('Alice');
    expect(result[1][0]).toBe('Carol');
  });

  it('applies AND logic for multiple active slots', () => {
    const slots: FilterSlot[] = [
      { column: 'Region', value: 'ZA' },
      { column: 'Name',   value: 'Alice' },
    ];
    const result = getFilteredRows(rows, headers, slots);
    expect(result).toHaveLength(1);
    expect(result[0][0]).toBe('Alice');
  });

  it('is case-insensitive', () => {
    const slots: FilterSlot[] = [{ column: 'Region', value: 'za' }];
    expect(getFilteredRows(rows, headers, slots)).toHaveLength(2);
  });

  it('ignores slots with empty column even when value is set', () => {
    const slots: FilterSlot[] = [
      { column: '',       value: 'ZA' },
      { column: 'Region', value: 'US' },
    ];
    const result = getFilteredRows(rows, headers, slots);
    expect(result).toHaveLength(1);
    expect(result[0][0]).toBe('Bob');
  });

  it('returns empty array when no rows match', () => {
    const slots: FilterSlot[] = [{ column: 'Region', value: 'EU' }];
    expect(getFilteredRows(rows, headers, slots)).toHaveLength(0);
  });

  it('handles unknown column name gracefully', () => {
    const slots: FilterSlot[] = [{ column: 'Unknown', value: 'foo' }];
    expect(getFilteredRows(rows, headers, slots)).toEqual(rows);
  });
});
```

- [ ] **Step 3: Run — expect FAIL**

```bash
npm test -- --reporter=verbose
```

Expected: fails with `Cannot find module '../filter'`.

- [ ] **Step 4: Create `src/lib/filter.ts`**

```typescript
import type { Row, FilterSlot } from '../types';

/**
 * Filter rows using an array of FilterSlots.
 * Only slots where both `column` and `value` are non-empty are applied.
 * Multiple active slots are combined with AND logic.
 */
export function getFilteredRows(
  rows: Row[],
  headers: string[],
  slots: FilterSlot[]
): Row[] {
  const active = slots.filter(s => s.column !== '' && s.value !== '');
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

- [ ] **Step 5: Run tests — expect PASS**

```bash
npm test -- --reporter=verbose
```

Expected: 8 new tests pass (32 total).

- [ ] **Step 6: TypeScript check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/lib/filter.ts src/lib/__tests__/filter.test.ts
git commit -m "feat: add FilterSlot type and getFilteredRows utility with tests"
```

---

## Task 2: Create `src/ui/filter-slots.ts`

**Files:**
- Create: `src/ui/filter-slots.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/ui/filter-slots.ts
/**
 * Filter slots — 1 to 5 dynamic filter rows, each with a column picker
 * and a value field. Replaces the old per-column analysis-toolbar.
 */

import type { Row, FilterSlot } from '../types';
import { escapeHtml } from '../lib/format';

export interface FilterSlotsCallbacks {
  onSlotChange: (index: number, column: string, value: string) => void;
  onAddSlot: () => void;
  onRemoveSlot: (index: number) => void;
  onClearAll: () => void;
}

const MAX_SLOTS = 5;
const DEBOUNCE_MS = 250;
const MAX_UNIQUE_FOR_SELECT = 15;

export function renderFilterSlots(
  headers: string[],
  allRows: Row[],
  slots: FilterSlot[],
  filteredCount: number,
  cb: FilterSlotsCallbacks
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'filters-section';

  const activeCount = slots.filter(s => s.column !== '' && s.value !== '').length;
  const hasActive = activeCount > 0;

  // ── Header ──
  const headerHtml = `
    <div class="filters-header">
      <h3 class="filters-title">Filter data</h3>
      ${hasActive ? `<span class="filters-count">${activeCount} active</span>` : ''}
      ${hasActive ? `<button class="filters-clear" type="button" id="filters-clear-all">Clear all</button>` : ''}
    </div>
  `;

  // ── Slots ──
  const slotsHtml = slots.map((slot, idx) => {
    const colOpts = [
      `<option value="">— Select column —</option>`,
      ...headers.map(h =>
        `<option value="${escapeHtml(h)}"${slot.column === h ? ' selected' : ''}>${escapeHtml(h)}</option>`
      ),
    ].join('');

    // Value field: select if chosen column has ≤ 15 unique values; text input otherwise
    let valueHtml: string;
    if (slot.column === '') {
      valueHtml = `<input type="text" class="filter-slot-val" data-idx="${idx}" placeholder="Select a column first" disabled />`;
    } else {
      const colIdx = headers.indexOf(slot.column);
      const uniq = [...new Set(
        allRows.map(r => (r[colIdx] ?? '').trim()).filter(Boolean)
      )].sort();

      if (uniq.length <= MAX_UNIQUE_FOR_SELECT) {
        const valOpts = [
          `<option value="">All</option>`,
          ...uniq.map(v =>
            `<option value="${escapeHtml(v)}"${slot.value === v ? ' selected' : ''}>${escapeHtml(v)}</option>`
          ),
        ].join('');
        valueHtml = `<select class="filter-slot-val filter-slot-val--select" data-idx="${idx}">${valOpts}</select>`;
      } else {
        valueHtml = `<input type="text" class="filter-slot-val" data-idx="${idx}" value="${escapeHtml(slot.value)}" placeholder="Filter…" />`;
      }
    }

    const canRemove = slots.length > 1;
    return `
      <div class="filter-slot" data-slot="${idx}">
        <select class="filter-slot-col" data-idx="${idx}">${colOpts}</select>
        ${valueHtml}
        ${canRemove
          ? `<button class="filter-slot-remove" data-idx="${idx}" type="button" title="Remove filter" aria-label="Remove filter">✕</button>`
          : `<span class="filter-slot-remove filter-slot-remove--placeholder"></span>`}
      </div>
    `;
  }).join('');

  const canAdd = slots.length < MAX_SLOTS;

  section.innerHTML = `
    ${headerHtml}
    <div class="filter-slots-list">${slotsHtml}</div>
    <button class="filters-add" type="button" id="filters-add-slot"${canAdd ? '' : ' disabled'}>+ Add filter</button>
  `;

  // ── Wire events ──
  setTimeout(() => {
    // Column picker changes
    section.querySelectorAll<HTMLSelectElement>('.filter-slot-col').forEach(sel => {
      sel.addEventListener('change', () => {
        const idx = Number(sel.dataset.idx);
        cb.onSlotChange(idx, sel.value, '');
      });
    });

    // Value changes (select)
    section.querySelectorAll<HTMLSelectElement>('.filter-slot-val--select').forEach(sel => {
      sel.addEventListener('change', () => {
        const idx = Number(sel.dataset.idx);
        const col = slots[idx]?.column ?? '';
        cb.onSlotChange(idx, col, sel.value);
      });
    });

    // Value changes (text input — debounced)
    section.querySelectorAll<HTMLInputElement>('input.filter-slot-val').forEach(input => {
      let debounceTimer: ReturnType<typeof setTimeout>;
      input.addEventListener('input', () => {
        const idx = Number(input.dataset.idx);
        const col = slots[idx]?.column ?? '';
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => cb.onSlotChange(idx, col, input.value), DEBOUNCE_MS);
      });
    });

    // Remove slot buttons
    section.querySelectorAll<HTMLButtonElement>('.filter-slot-remove[data-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        cb.onRemoveSlot(idx);
      });
    });

    // Add slot
    document.getElementById('filters-add-slot')?.addEventListener('click', cb.onAddSlot);

    // Clear all
    document.getElementById('filters-clear-all')?.addEventListener('click', cb.onClearAll);
  }, 0);

  return section;
}
```

- [ ] **Step 2: TypeScript check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/filter-slots.ts
git commit -m "feat: add filter-slots component with dynamic 1-5 slot filter controls"
```

---

## Task 3: Create `src/ui/analysis-panel.ts` + tests

**Files:**
- Create: `src/ui/analysis-panel.ts`
- Create: `src/ui/__tests__/analysis-panel.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/ui/__tests__/analysis-panel.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeAggregates } from '../analysis-panel';

describe('computeAggregates', () => {
  it('returns zero-state for a column with no non-empty values', () => {
    const agg = computeAggregates([[''], ['']], 0);
    expect(agg.count).toBe(0);
    expect(agg.isNumeric).toBe(false);
    expect(agg.sum).toBeNull();
    expect(agg.avg).toBeNull();
    expect(agg.min).toBe('—');
    expect(agg.max).toBe('—');
  });

  it('computes numeric aggregates correctly', () => {
    const rows = [['10'], ['20'], ['30']];
    const agg = computeAggregates(rows, 0);
    expect(agg.isNumeric).toBe(true);
    expect(agg.sum).toBe(60);
    expect(agg.avg).toBeCloseTo(20);
    expect(agg.count).toBe(3);
    expect(agg.min).toBe('10');
    expect(agg.max).toBe('30');
  });

  it('treats text columns as non-numeric — min/max by string length', () => {
    const rows = [['Alice'], ['Bob'], ['Carol']];
    const agg = computeAggregates(rows, 0);
    expect(agg.isNumeric).toBe(false);
    expect(agg.sum).toBeNull();
    expect(agg.avg).toBeNull();
    expect(agg.count).toBe(3);
    expect(agg.min).toBe('Bob');   // shortest (3 chars)
    expect(agg.max).toBe('Alice'); // longest first-encountered (5 chars)
  });

  it('strips thousands-separator commas before parsing', () => {
    const rows = [['1,000'], ['2,500']];
    const agg = computeAggregates(rows, 0);
    expect(agg.isNumeric).toBe(true);
    expect(agg.sum).toBe(3500);
  });

  it('uses the numeric branch when >= 50% of values parse as numbers', () => {
    // 3 numbers, 1 text — 75% numeric → isNumeric true
    const rows = [['10'], ['20'], ['30'], ['N/A']];
    const agg = computeAggregates(rows, 0);
    expect(agg.isNumeric).toBe(true);
    expect(agg.count).toBe(4); // all non-empty cells counted
  });

  it('uses the text branch when < 50% of values parse as numbers', () => {
    const rows = [['10'], ['foo'], ['bar'], ['baz']];
    const agg = computeAggregates(rows, 0);
    expect(agg.isNumeric).toBe(false);
  });

  it('handles a column index beyond the row length', () => {
    const rows = [['a'], ['b']];
    const agg = computeAggregates(rows, 5); // out of range
    expect(agg.count).toBe(0);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test -- --reporter=verbose
```

Expected: fails with `Cannot find module '../analysis-panel'`.

- [ ] **Step 3: Create `src/ui/analysis-panel.ts`**

```typescript
// src/ui/analysis-panel.ts
/**
 * Analysis panel — column picker dropdown + 5 stat cards (Sum, Avg, Count, Min, Max).
 * Appears below the filter slots section.
 */

import type { Row } from '../types';
import { escapeHtml } from '../lib/format';

/* ── Aggregation (exported for testing) ── */

export interface ColAggregates {
  sum: number | null;
  avg: number | null;
  count: number;
  min: string;
  max: string;
  isNumeric: boolean;
}

export function computeAggregates(rows: Row[], colIndex: number): ColAggregates {
  const values = rows.map(r => (r[colIndex] ?? '').trim()).filter(Boolean);
  if (values.length === 0) {
    return { sum: null, avg: null, count: 0, min: '—', max: '—', isNumeric: false };
  }

  const nums = values.map(v => parseFloat(v.replace(/,/g, '')));
  const validNums = nums.filter(n => !isNaN(n));
  const isNumeric = validNums.length > 0 && validNums.length / values.length >= 0.5;

  if (isNumeric) {
    const sum = validNums.reduce((a, b) => a + b, 0);
    return {
      sum,
      avg: sum / validNums.length,
      count: values.length,
      min: String(Math.min(...validNums)),
      max: String(Math.max(...validNums)),
      isNumeric: true,
    };
  }

  return {
    sum: null,
    avg: null,
    count: values.length,
    min: values.reduce((a, b) => (a.length <= b.length ? a : b)),
    max: values.reduce((a, b) => (a.length >= b.length ? a : b)),
    isNumeric: false,
  };
}

function fmt(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/* ── Component ── */

export function renderAnalysisPanel(
  headers: string[],
  filteredRows: Row[],
  activeColumn: string | null,
  onColumnSelect: (col: string | null) => void
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'analysis-section';

  const colOpts = [
    `<option value="">— Select a column to analyse —</option>`,
    ...headers.map(h =>
      `<option value="${escapeHtml(h)}"${activeColumn === h ? ' selected' : ''}>${escapeHtml(h)}</option>`
    ),
  ].join('');

  let statsHtml = '';
  if (activeColumn !== null) {
    const colIdx = headers.indexOf(activeColumn);
    if (filteredRows.length === 0) {
      statsHtml = `<p class="analysis-empty">No rows to analyse — clear your filters first.</p>`;
    } else if (colIdx === -1) {
      statsHtml = `<p class="analysis-empty">Column not found in current data.</p>`;
    } else {
      const agg = computeAggregates(filteredRows, colIdx);
      const stats = [
        { label: 'Sum', value: agg.isNumeric ? fmt(agg.sum!) : '—' },
        { label: 'Avg', value: agg.isNumeric ? fmt(agg.avg!) : '—' },
        { label: 'Count', value: agg.count.toLocaleString() },
        { label: 'Min', value: escapeHtml(agg.min) },
        { label: 'Max', value: escapeHtml(agg.max) },
      ];
      const cards = stats.map(s => `
        <div class="stat-card">
          <div class="stat-card-label">${s.label}</div>
          <div class="stat-card-value${s.value === '—' ? ' stat-card-value--muted' : ''}">${s.value}</div>
        </div>`).join('');
      const note = filteredRows.length > 0
        ? `<p class="analysis-note">Based on ${filteredRows.length.toLocaleString()} row${filteredRows.length === 1 ? '' : 's'}</p>`
        : '';
      statsHtml = `<div class="analysis-stats">${cards}</div>${note}`;
    }
  }

  section.innerHTML = `
    <h3 class="analysis-title">Analyse a column</h3>
    <select class="analysis-col-picker" id="analysis-col-picker">${colOpts}</select>
    ${statsHtml}
  `;

  setTimeout(() => {
    section.querySelector<HTMLSelectElement>('#analysis-col-picker')
      ?.addEventListener('change', (e) => {
        const val = (e.target as HTMLSelectElement).value;
        onColumnSelect(val === '' ? null : val);
      });
  }, 0);

  return section;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- --reporter=verbose
```

Expected: 7 new analysis-panel tests pass (39 total).

- [ ] **Step 5: TypeScript check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/ui/analysis-panel.ts src/ui/__tests__/analysis-panel.test.ts
git commit -m "feat: add analysis-panel component with computeAggregates and tests"
```

---

## Task 4: Create `src/ui/download-bar.ts`

**Files:**
- Create: `src/ui/download-bar.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/ui/download-bar.ts
/**
 * Download bar — persistent action bar rendered below the analysis panel.
 * Shows export row count, a download button, and a "Revert to original" link.
 */

export function renderDownloadBar(
  filteredCount: number,
  hasResult: boolean,
  hasFilters: boolean,
  onDownload: () => void,
  onRevert: () => void
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'download-bar';

  let noteText: string;
  let downloadDisabled: boolean;

  if (!hasResult) {
    noteText = 'Apply fixes before downloading';
    downloadDisabled = true;
  } else if (filteredCount === 0) {
    noteText = 'No rows to export';
    downloadDisabled = true;
  } else if (hasFilters) {
    noteText = `Exporting ${filteredCount.toLocaleString()} filtered row${filteredCount === 1 ? '' : 's'}`;
    downloadDisabled = false;
  } else {
    noteText = `Exporting ${filteredCount.toLocaleString()} row${filteredCount === 1 ? '' : 's'}`;
    downloadDisabled = false;
  }

  section.innerHTML = `
    <span class="download-bar-note">${noteText}</span>
    <div class="download-bar-actions">
      ${hasResult
        ? `<button class="btn btn-ghost" id="dl-bar-revert" type="button">Revert to original</button>`
        : ''}
      <button
        class="btn btn-primary"
        id="dl-bar-download"
        type="button"
        ${downloadDisabled ? 'disabled' : ''}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Download cleaned CSV
      </button>
    </div>
  `;

  setTimeout(() => {
    document.getElementById('dl-bar-download')?.addEventListener('click', onDownload);
    document.getElementById('dl-bar-revert')?.addEventListener('click', onRevert);
  }, 0);

  return section;
}
```

- [ ] **Step 2: TypeScript check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/download-bar.ts
git commit -m "feat: add download-bar component"
```

---

## Task 5: Simplify `src/ui/preview-table.ts`

Remove the old analysis toolbar integration, `<tfoot>`, column-click handler, and `activeColumn` highlighting. The table becomes a pure data-display component.

**Files:**
- Modify: `src/ui/preview-table.ts`

- [ ] **Step 1: Replace the entire file with the simplified version**

```typescript
/**
 * Preview table — renders the first N rows of the current dataset.
 *
 * Two modes:
 *   • "original" — shows the raw parsed file
 *   • "cleaned"  — shows post-clean rows, with edited cells highlighted in amber
 *
 * For large files only the first 150 rows are painted. A note tells the user
 * how many are hidden.
 */

import type { ParsedFile, Row } from '../types';
import { escapeHtml, truncate } from '../lib/format';

const MAX_PREVIEW_ROWS = 150;

interface PreviewOptions {
  mode: 'original' | 'cleaned';
  changedCells?: Set<string>;        // "row-col" keys for amber highlighting
  removedRowIndices?: Set<number>;
  displayHeaders?: string[];         // overrides file.headers (e.g. after header-issues fix)
}

export function renderPreviewTable(
  file: ParsedFile,
  rows: Row[],
  opts: PreviewOptions
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'preview';

  const headers = opts.displayHeaders ?? file.headers;
  const visibleRows = rows.slice(0, MAX_PREVIEW_ROWS);
  const hidden = rows.length - visibleRows.length;

  // ── Meta bar ──
  const meta = document.createElement('div');
  meta.className = 'preview-meta';
  meta.innerHTML = `
    <span class="preview-mode">${opts.mode === 'cleaned' ? 'After cleaning' : 'Original data'}</span>
    <span class="preview-count">${rows.length.toLocaleString()} row${rows.length === 1 ? '' : 's'} · ${headers.length} column${headers.length === 1 ? '' : 's'}${hidden > 0 ? ` · showing first ${visibleRows.length}` : ''}</span>
  `;
  wrap.appendChild(meta);

  // ── Table ──
  const headerCells = headers.map(h =>
    `<th>${escapeHtml(h || '(blank)')}</th>`
  ).join('');

  let bodyHtml: string;
  if (rows.length === 0) {
    bodyHtml = `<tr><td class="preview-empty-state" colspan="${headers.length}">No rows match the current filters — adjust or clear your filters.</td></tr>`;
  } else {
    bodyHtml = visibleRows.map((row, r) => {
      const cellsHtml = row.map((cell, c) => {
        const changed = opts.changedCells?.has(`${r}-${c}`);
        return `<td class="${changed ? 'cell-changed' : ''}" title="${escapeHtml(cell ?? '')}">${escapeHtml(truncate(cell ?? '', 80))}</td>`;
      }).join('');
      return `<tr>${cellsHtml}</tr>`;
    }).join('');
  }

  const scrollDiv = document.createElement('div');
  scrollDiv.className = 'preview-scroll';
  scrollDiv.innerHTML = `
    <table class="preview-table">
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyHtml}</tbody>
    </table>
  `;
  wrap.appendChild(scrollDiv);

  // ── Footer note ──
  if (hidden > 0) {
    const foot = document.createElement('div');
    foot.className = 'preview-foot';
    foot.textContent = `${hidden.toLocaleString()} more row${hidden === 1 ? '' : 's'} not shown — they'll all be processed when you export.`;
    wrap.appendChild(foot);
  }

  return wrap;
}
```

- [ ] **Step 2: Delete `src/ui/analysis-toolbar.ts`**

```bash
git rm src/ui/analysis-toolbar.ts
```

- [ ] **Step 3: TypeScript check**

```bash
npm run lint
```

Expected: TypeScript will show errors for `main.ts` because it still imports the old API. This is expected — we'll fix `main.ts` in Task 6. The check here is just to confirm `preview-table.ts` itself compiles.

If `npm run lint` reports errors **only** in `main.ts` (not in preview-table.ts or analysis-toolbar.ts), that's acceptable — proceed to commit.

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: 39 tests still pass (preview-table.ts has no unit tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/preview-table.ts
git commit -m "refactor(preview-table): remove analysis tfoot, column-click, and toolbar integration"
```

---

## Task 6: Update `src/ui/issues-panel.ts` + `src/main.ts`

This is the integration task. It wires all new components into the app and cleans up the old state/handlers.

**Files:**
- Modify: `src/ui/issues-panel.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Add `onHide` callback to `src/ui/issues-panel.ts`**

Change the `PanelCallbacks` interface:

```typescript
interface PanelCallbacks {
  onToggle: (issueId: Issue['id'], enabled: boolean) => void;
  onApplyAll: () => void;
  onClean: () => void;
  onHide: () => void;   // NEW — called when the user clicks "Hide ◀"
}
```

Replace the `panel.innerHTML` header section:

```typescript
  panel.innerHTML = `
    <header class="issues-head">
      <div>
        <h3 class="issues-title">Diagnosis</h3>
        <p class="issues-sub">${issues.length} issue${issues.length === 1 ? '' : 's'} found · toggle to choose what to fix</p>
      </div>
      <div class="issues-head-actions">
        <button class="issues-all-btn" type="button" id="issues-all-btn">Apply all</button>
        <button class="issues-hide-btn" type="button" id="issues-hide-btn" title="Hide sidebar" aria-label="Hide diagnosis sidebar">◀</button>
      </div>
    </header>
    <ul class="issues-list">${list}</ul>
    <footer class="issues-foot">
      <button class="issues-clean-btn" type="button" id="issues-clean-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Apply selected fixes
      </button>
    </footer>
  `;
```

After the existing event wiring (after `panel.querySelector('#issues-clean-btn')...`), add:

```typescript
  panel.querySelector<HTMLButtonElement>('#issues-hide-btn')!
    .addEventListener('click', cb.onHide);
```

Also update the empty-state panel to include the hide button. Replace the early-return innerHTML in the `if (issues.length === 0)` block:

```typescript
  if (issues.length === 0) {
    panel.innerHTML = `
      <header class="issues-head">
        <div>
          <h3 class="issues-title">Diagnosis</h3>
        </div>
        <button class="issues-hide-btn" type="button" id="issues-hide-btn-empty" title="Hide sidebar" aria-label="Hide diagnosis sidebar">◀</button>
      </header>
      <div class="issues-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <h3>No issues detected</h3>
        <p>Your CSV looks pristine. You can still re-export it or upload another file.</p>
      </div>
    `;
    panel.querySelector<HTMLButtonElement>('#issues-hide-btn-empty')!
      .addEventListener('click', cb.onHide);
    return panel;
  }
```

- [ ] **Step 2: Replace `src/main.ts` completely**

```typescript
/**
 * CSV Doctor — entry point.
 *
 * Upload → Diagnose → Clean → Filter → Analyse → Download
 * All in a single page, no navigation.
 */

import './styles.css';

import type { ParsedFile, Issue, IssueId, CleanResult, Row, FilterSlot } from './types';
import { parseCsv } from './core/parser';
import { analyze } from './core/analyzer';
import { clean } from './core/cleaner';
import { exportCsv, suggestFilename } from './core/exporter';
import { getFilteredRows } from './lib/filter';
import { createUploadZone } from './ui/upload';
import { createIssuesPanel } from './ui/issues-panel';
import { renderPreviewTable } from './ui/preview-table';
import { renderFilterSlots } from './ui/filter-slots';
import { renderAnalysisPanel } from './ui/analysis-panel';
import { renderDownloadBar } from './ui/download-bar';
import { renderStats } from './ui/stats';
import { bytes } from './lib/format';

/* ───────────────────────────────────────────────────
   State
─────────────────────────────────────────────────── */

interface AppState {
  parsed: ParsedFile | null;
  issues: Issue[];
  result: CleanResult | null;
  toast: { message: string; tone: 'info' | 'error' | 'success' } | null;
  activeColumn: string | null;
  filterSlots: FilterSlot[];
  sidebarOpen: boolean;
}

const EMPTY_SLOTS: FilterSlot[] = [{ column: '', value: '' }];

const state: AppState = {
  parsed: null,
  issues: [],
  result: null,
  toast: null,
  activeColumn: null,
  filterSlots: [...EMPTY_SLOTS],
  sidebarOpen: true,
};

/* ───────────────────────────────────────────────────
   Utilities
─────────────────────────────────────────────────── */

function hasActiveFilters(): boolean {
  return state.filterSlots.some(s => s.column !== '' && s.value !== '');
}

/* ───────────────────────────────────────────────────
   Render
─────────────────────────────────────────────────── */

function render() {
  const app = document.getElementById('app')!;
  app.innerHTML = '';

  app.appendChild(renderHeader());
  app.appendChild(renderToast());

  const main = document.createElement('main');
  main.className = 'main';

  if (!state.parsed) {
    main.appendChild(renderHero());
    main.appendChild(createUploadZone({
      onFile: handleFile,
      onError: (msg) => showToast(msg, 'error'),
    }));
  } else {
    const displayHeaders = state.result?.cleanedHeaders ?? state.parsed.headers;
    const displayRows = state.result ? state.result.rows : state.parsed.rows;
    const filteredRows = getFilteredRows(displayRows, displayHeaders, state.filterSlots);

    main.appendChild(renderFileBar());
    main.appendChild(renderStats(state.parsed, state.result));

    // ── Workspace: sidebar + table ──
    const grid = document.createElement('div');
    grid.className = `workspace${state.sidebarOpen ? '' : ' sidebar-collapsed'}`;

    // Sidebar wrapper
    const sidebarWrap = document.createElement('div');
    sidebarWrap.className = `issues-sidebar${state.sidebarOpen ? '' : ' collapsed'}`;

    if (state.sidebarOpen) {
      sidebarWrap.appendChild(createIssuesPanel(state.issues, {
        onToggle: handleToggleIssue,
        onApplyAll: handleApplyAll,
        onClean: handleClean,
        onHide: handleToggleSidebar,
      }));
    } else {
      const strip = document.createElement('button');
      strip.className = 'sidebar-strip';
      strip.id = 'sidebar-expand';
      strip.type = 'button';
      strip.setAttribute('aria-label', 'Show diagnosis sidebar');
      strip.innerHTML = `<span class="sidebar-strip-label">▶ Diagnosis (${state.issues.length})</span>`;
      sidebarWrap.appendChild(strip);
      setTimeout(() => {
        document.getElementById('sidebar-expand')
          ?.addEventListener('click', handleToggleSidebar);
      }, 0);
    }
    grid.appendChild(sidebarWrap);

    // Build diff highlight set
    const changedCells = new Set<string>();
    let removedRowSet: Set<number> | undefined;
    if (state.result) {
      const originalToCleaned = new Map<number, number>();
      let cleanedIdx = 0;
      removedRowSet = new Set(state.result.removedRowIndices);
      for (let i = 0; i < state.parsed.rows.length; i++) {
        if (!removedRowSet.has(i)) {
          originalToCleaned.set(i, cleanedIdx);
          cleanedIdx++;
        }
      }
      for (const ch of state.result.changes) {
        const newIdx = originalToCleaned.get(ch.rowIndex);
        if (newIdx !== undefined) changedCells.add(`${newIdx}-${ch.colIndex}`);
      }
    }

    grid.appendChild(renderPreviewTable(
      state.parsed,
      filteredRows,
      {
        mode: state.result ? 'cleaned' : 'original',
        changedCells,
        removedRowIndices: removedRowSet,
        displayHeaders,
      }
    ));

    main.appendChild(grid);

    // ── Below workspace ──
    main.appendChild(renderFilterSlots(
      displayHeaders,
      displayRows,
      state.filterSlots,
      filteredRows.length,
      {
        onSlotChange: handleSlotChange,
        onAddSlot: handleAddSlot,
        onRemoveSlot: handleRemoveSlot,
        onClearAll: handleClearAllFilters,
      }
    ));

    main.appendChild(renderAnalysisPanel(
      displayHeaders,
      filteredRows,
      state.activeColumn,
      handleColumnSelect,
    ));

    main.appendChild(renderDownloadBar(
      filteredRows.length,
      state.result !== null,
      hasActiveFilters(),
      handleExport,
      handleRevert,
    ));
  }

  app.appendChild(main);
  app.appendChild(renderFooter());
}

/* ───────────────────────────────────────────────────
   Section renderers
─────────────────────────────────────────────────── */

function renderHeader(): HTMLElement {
  const h = document.createElement('header');
  h.className = 'topbar';
  h.innerHTML = `
    <a class="brand" href="/" aria-label="CSV Doctor home">
      <span class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 4 L8 20 M4 8 L12 8 M8 12 L14 12 M8 16 L12 16"/>
          <circle cx="17" cy="14" r="4"/>
          <path d="M17 12 L17 16 M15 14 L19 14"/>
        </svg>
      </span>
      <span class="brand-text">CSV <span class="brand-text-accent">Doctor</span></span>
    </a>
    <nav class="topbar-actions">
      <a href="https://github.com/Nkuempoofu" target="_blank" rel="noopener noreferrer" class="topbar-link" title="View on GitHub">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>
      </a>
    </nav>
  `;
  return h;
}

function renderHero(): HTMLElement {
  const h = document.createElement('section');
  h.className = 'hero';
  h.innerHTML = `
    <span class="hero-eyebrow">Free · Open source · 100% private</span>
    <h1 class="hero-title">Diagnose &amp; heal<br/><span class="hero-title-accent">your messy CSVs.</span></h1>
    <p class="hero-sub">Drop in a CSV, and CSV Doctor auto-detects empty rows, duplicates, mixed date formats, encoding artifacts, inconsistent capitalisation, and more. Toggle which fixes you want, then export a pristine clean version. All in your browser.</p>
  `;
  return h;
}

function renderFileBar(): HTMLElement {
  const f = document.createElement('div');
  f.className = 'filebar';
  f.innerHTML = `
    <div class="filebar-info">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="filebar-icon"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <div>
        <div class="filebar-name">${state.parsed!.filename}</div>
        <div class="filebar-meta">${bytes(state.parsed!.size)} · ${state.parsed!.rows.length.toLocaleString()} rows · ${state.parsed!.headers.length} columns</div>
      </div>
    </div>
    <div class="filebar-actions">
      <button class="btn btn-ghost" id="filebar-new" type="button">Upload another file</button>
    </div>
  `;
  setTimeout(() => {
    document.getElementById('filebar-new')!.addEventListener('click', handleReset);
  }, 0);
  return f;
}

function renderToast(): HTMLElement {
  const t = document.createElement('div');
  t.className = `toast ${state.toast ? 'toast--show toast--' + state.toast.tone : ''}`;
  t.textContent = state.toast?.message ?? '';
  return t;
}

function renderFooter(): HTMLElement {
  const f = document.createElement('footer');
  f.className = 'footer';
  f.innerHTML = `
    <div>Built by <a href="https://nkululeko-mpofu.dev" target="_blank" rel="noopener noreferrer">Nkululeko Mpofu</a> · <a href="https://github.com/Nkuempoofu/csv-doctor" target="_blank" rel="noopener noreferrer">View source</a></div>
    <div class="footer-tech">Vanilla TypeScript · Vite · Papa Parse</div>
  `;
  return f;
}

/* ───────────────────────────────────────────────────
   Handlers
─────────────────────────────────────────────────── */

function handleFile(text: string, name: string, size: number) {
  try {
    const parsed = parseCsv(text, { filename: name, size });
    const issues = analyze(parsed);
    state.parsed = parsed;
    state.issues = issues;
    state.result = null;
    state.activeColumn = null;
    state.filterSlots = [{ column: '', value: '' }];
    state.sidebarOpen = true;
    showToast(
      `Parsed ${parsed.rows.length.toLocaleString()} rows. ${
        issues.length === 0 ? 'No issues found!' : `${issues.length} issue${issues.length === 1 ? '' : 's'} detected.`
      }`,
      issues.length === 0 ? 'success' : 'info'
    );
    render();
  } catch (err) {
    showToast(err instanceof Error ? err.message : 'Could not parse the file.', 'error');
  }
}

function handleToggleIssue(id: IssueId, enabled: boolean) {
  state.issues = state.issues.map(i => (i.id === id ? { ...i, enabled } : i));
  state.result = null;
  render();
}

function handleApplyAll() {
  state.issues = state.issues.map(i => ({ ...i, enabled: true }));
  render();
}

function handleClean() {
  if (!state.parsed) return;
  const enabled = new Set<IssueId>(state.issues.filter(i => i.enabled).map(i => i.id));
  if (enabled.size === 0) {
    showToast('Toggle at least one fix on first.', 'info');
    return;
  }
  state.result = clean(state.parsed, { enabled });
  // Reset activeColumn if it was removed by sparse-columns fix
  const cleanedHeaders = state.result.cleanedHeaders;
  if (cleanedHeaders && state.activeColumn && !cleanedHeaders.includes(state.activeColumn)) {
    state.activeColumn = null;
  }
  showToast(
    `Cleaned ${state.result.changes.length} cell${state.result.changes.length === 1 ? '' : 's'} and removed ${state.result.removedRowIndices.length} row${state.result.removedRowIndices.length === 1 ? '' : 's'}.`,
    'success'
  );
  render();
}

function handleRevert() {
  state.result = null;
  state.activeColumn = null;
  state.filterSlots = [{ column: '', value: '' }];
  render();
}

function handleExport() {
  if (!state.parsed || !state.result) return;
  const displayHeaders = state.result.cleanedHeaders ?? state.parsed.headers;
  const filteredRows = getFilteredRows(state.result.rows, displayHeaders, state.filterSlots);
  if (filteredRows.length === 0) return;
  const filename = suggestFilename(state.parsed.filename);
  exportCsv(state.parsed, filteredRows, filename, state.parsed.delimiter, displayHeaders);
  const msg = hasActiveFilters()
    ? `Downloaded ${filteredRows.length.toLocaleString()} filtered rows as ${filename}`
    : `Downloaded ${filename}`;
  showToast(msg, 'success');
}

function handleReset() {
  state.parsed = null;
  state.issues = [];
  state.result = null;
  state.activeColumn = null;
  state.filterSlots = [{ column: '', value: '' }];
  state.sidebarOpen = true;
  render();
}

function handleToggleSidebar() {
  state.sidebarOpen = !state.sidebarOpen;
  render();
}

function handleSlotChange(index: number, column: string, value: string) {
  state.filterSlots = state.filterSlots.map((s, i) =>
    i === index ? { column, value } : s
  );
  render();
}

function handleAddSlot() {
  if (state.filterSlots.length >= 5) return;
  state.filterSlots = [...state.filterSlots, { column: '', value: '' }];
  render();
}

function handleRemoveSlot(index: number) {
  if (state.filterSlots.length <= 1) return;
  state.filterSlots = state.filterSlots.filter((_, i) => i !== index);
  render();
}

function handleClearAllFilters() {
  state.filterSlots = [{ column: '', value: '' }];
  render();
}

function handleColumnSelect(col: string | null) {
  state.activeColumn = col;
  render();
}

let toastTimer: number | undefined;
function showToast(message: string, tone: 'info' | 'error' | 'success') {
  state.toast = { message, tone };
  render();
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    state.toast = null;
    render();
  }, 4000);
}

/* ───────────────────────────────────────────────────
   Boot
─────────────────────────────────────────────────── */

render();
```

- [ ] **Step 3: TypeScript check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: 39 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/issues-panel.ts src/main.ts
git commit -m "feat: wire filter-slots, analysis-panel, download-bar, and collapsible sidebar into main"
```

---

## Task 7: Update `src/styles.css`

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Update `.main` — remove max-width**

Find and replace the `.main` rule (lines ~146–152):

```css
/* OLD */
.main {
  flex: 1;
  max-width: 1500px;
  width: 100%;
  margin: 0 auto;
  padding: 2.5rem 4% 3rem;
}
```

Replace with:

```css
.main {
  flex: 1;
  width: 100%;
  padding: 2rem 2% 3rem;
}
```

- [ ] **Step 2: Update `.workspace` — sidebar collapse support**

Find and replace the `.workspace` block and its media query (lines ~436–444):

```css
/* OLD */
.workspace {
  display: grid;
  grid-template-columns: minmax(320px, 380px) 1fr;
  gap: 1.25rem;
  align-items: start;
}
@media (max-width: 1080px) {
  .workspace { grid-template-columns: 1fr; }
}
```

Replace with:

```css
.workspace {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 1.25rem;
  align-items: start;
  transition: grid-template-columns 0.2s ease;
}
.workspace.sidebar-collapsed {
  grid-template-columns: 40px 1fr;
}
@media (max-width: 1080px) {
  .workspace,
  .workspace.sidebar-collapsed { grid-template-columns: 1fr; }
  .issues-sidebar.collapsed { display: none; }
}
```

- [ ] **Step 3: Update `.issues-head` — make room for two action buttons**

Find and replace `.issues-head` (lines ~465–482):

```css
/* OLD */
.issues-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border);
  background: rgba(5, 8, 20, 0.4);
}
```

Replace with:

```css
.issues-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border);
  background: rgba(5, 8, 20, 0.4);
  gap: 0.5rem;
}

.issues-head-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.issues-hide-btn {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--muted);
  border-radius: 6px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.78rem;
  transition: color 0.15s, border-color 0.15s;
  flex-shrink: 0;
}
.issues-hide-btn:hover {
  color: var(--accent-l);
  border-color: var(--accent);
}
```

- [ ] **Step 4: Add sidebar collapsed strip styles**

Append after the `.issues-hide-btn:hover` rule you just added:

```css
/* Collapsed sidebar strip */
.sidebar-strip {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  min-height: 200px;
  height: 100%;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  color: var(--muted);
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  padding: 0;
}
.sidebar-strip:hover {
  background: rgba(6, 182, 212, 0.06);
  color: var(--accent-l);
  border-color: var(--border-h);
}
.sidebar-strip-label {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  transform: rotate(180deg);
  white-space: nowrap;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.05em;
}
```

- [ ] **Step 5: Replace old analysis toolbar CSS block with filter-slots CSS**

Find the large analysis-toolbar block starting at line ~809 (`/* ═══ Analysis toolbar ═══ */`) and ending before `/* ═══ Active column highlight ═══ */`.

Delete that entire block and replace with:

```css
/* ═══════════════════════════════════════════════════
   Filter slots
   ═══════════════════════════════════════════════════ */

.filters-section {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 1rem 1.25rem;
  margin-top: 1.25rem;
}

.filters-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}

.filters-title {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text);
  flex: 1;
}

.filters-count {
  font-size: 0.72rem;
  background: rgba(6, 182, 212, 0.12);
  color: var(--accent-l);
  border: 1px solid rgba(6, 182, 212, 0.25);
  border-radius: 100px;
  padding: 0.15rem 0.55rem;
}

.filters-clear {
  background: none;
  border: none;
  color: var(--muted);
  font-size: 0.78rem;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
  transition: color 0.15s;
}
.filters-clear:hover { color: var(--text); }

.filter-slots-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.filter-slot {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.filter-slot-col,
.filter-slot-val {
  background: var(--card-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font: inherit;
  font-size: 0.82rem;
  padding: 0.4rem 0.6rem;
  outline: none;
  transition: border-color 0.15s;
}
.filter-slot-col { min-width: 160px; }
.filter-slot-val { flex: 1; }
.filter-slot-col:focus,
.filter-slot-val:focus  { border-color: var(--border-h); }
.filter-slot-col:disabled,
.filter-slot-val:disabled { opacity: 0.45; cursor: not-allowed; }

.filter-slot-remove {
  background: none;
  border: 1px solid var(--border);
  color: var(--muted);
  border-radius: 6px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  flex-shrink: 0;
  transition: color 0.15s, border-color 0.15s;
}
.filter-slot-remove[data-idx]:hover {
  color: var(--rose);
  border-color: var(--rose);
}
.filter-slot-remove--placeholder {
  border-color: transparent;
  pointer-events: none;
}

.filters-add {
  margin-top: 0.4rem;
  background: none;
  border: 1px dashed var(--border);
  color: var(--muted);
  border-radius: 6px;
  padding: 0.4rem 0.85rem;
  font-size: 0.82rem;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.filters-add:hover:not(:disabled) {
  color: var(--accent-l);
  border-color: var(--accent);
  border-style: solid;
}
.filters-add:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
```

- [ ] **Step 6: Replace old active-column + aggregation-footer CSS with analysis-panel CSS**

Find the `/* ═══ Active column highlight ═══ */` block through the end of `/* ═══ Empty filter state ═══ */` block (the last section Task 12 added — ending with `.preview-empty-state { ... }`).

Delete those blocks entirely and replace with:

```css
/* ═══════════════════════════════════════════════════
   Analysis panel
   ═══════════════════════════════════════════════════ */

.analysis-section {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 1rem 1.25rem;
  margin-top: 1.25rem;
}

.analysis-title {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 0.75rem;
}

.analysis-col-picker {
  background: var(--card-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font: inherit;
  font-size: 0.82rem;
  padding: 0.4rem 0.6rem;
  outline: none;
  transition: border-color 0.15s;
  min-width: 220px;
  max-width: 400px;
  margin-bottom: 1rem;
  display: block;
}
.analysis-col-picker:focus { border-color: var(--border-h); }

.analysis-stats {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 0.5rem;
}

.stat-card {
  background: var(--card-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.65rem 1rem;
  min-width: 90px;
  flex: 1;
}

.stat-card-label {
  font-size: 0.62rem;
  font-weight: 700;
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 0.3rem;
}

.stat-card-value {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text);
  font-family: var(--mono);
  word-break: break-all;
}

.stat-card-value--muted {
  color: var(--muted);
}

.analysis-note {
  font-size: 0.75rem;
  color: var(--muted);
  margin-top: 0.25rem;
}

.analysis-empty {
  color: var(--muted);
  font-size: 0.85rem;
  padding: 0.25rem 0;
}

/* ═══════════════════════════════════════════════════
   Download bar
   ═══════════════════════════════════════════════════ */

.download-bar {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 1rem 1.25rem;
  margin-top: 1.25rem;
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.download-bar-note {
  font-size: 0.85rem;
  color: var(--muted);
}

.download-bar-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

/* ═══════════════════════════════════════════════════
   Empty filter state in table
   ═══════════════════════════════════════════════════ */

.preview-empty-state {
  text-align: center;
  color: var(--muted);
  padding: 2rem;
  font-size: 0.9rem;
}
```

- [ ] **Step 7: Update the filebar export section CSS**

Find and delete the `.filebar-export-wrap`, `.filebar-export-note`, and `.btn[disabled]` rules that were added by the previous iteration. These are now handled by `.download-bar` and the standard `.btn` disabled state.

Find these rules (they were added in the previous `style:` commit, after the filter-slots section):

```css
.filebar-export-wrap { ... }
.filebar-export-note { ... }
.btn[disabled] { ... }
```

Keep only `.btn[disabled]` — it's still needed for the download-bar button:

```css
.btn[disabled] {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: none;
}
```

Delete `.filebar-export-wrap` and `.filebar-export-note` entirely.

- [ ] **Step 8: Run lint and tests**

```bash
npm run lint && npm test
```

Expected: no TypeScript errors, 39 tests pass.

- [ ] **Step 9: Start the dev server and do a visual check**

```bash
npm run dev
```

Open `http://localhost:5174`. Upload a CSV and verify:

1. Content stretches edge-to-edge with narrow side padding
2. "◀ Hide" button appears in the diagnosis panel header
3. Clicking it collapses the sidebar to a 40px strip; table expands to fill width
4. Clicking the strip re-expands the sidebar
5. "Filter data" section appears below the table with 1 empty slot
6. Column picker in the slot lists all file columns
7. "Select column first" value input becomes active after picking a column
8. "+ Add filter" adds slots (up to 5); "✕" removes them (not shown on last slot)
9. "Analyse a column" section appears below filters; picking a column shows 5 stat cards
10. Cards update immediately when filters change
11. Download bar shows correct row count; button is greyed until fixes are applied; "Revert to original" appears after cleaning

- [ ] **Step 10: Commit**

```bash
git add src/styles.css
git commit -m "style: full-width layout, sidebar collapse, filter slots, analysis panel, download bar"
```

---

## Self-Review

**Spec coverage:**
- ✅ Full-width layout — Task 7 Step 1 removes `max-width`
- ✅ Collapsible sidebar (expanded → 40px strip, table expands) — Tasks 6 + 7 Steps 2–4
- ✅ Hide button in issues-panel header — Task 6 Step 1
- ✅ `sidebarOpen` in AppState, resets on file upload — Task 6 Step 2
- ✅ FilterSlot type — Task 1 Step 1
- ✅ `getFilteredRows` with `FilterSlot[]` — Task 1 Steps 4–5
- ✅ Filter slots component (1–5 dynamic, column picker, value field, remove/add) — Task 2
- ✅ AND logic across slots — Task 1 `getFilteredRows`
- ✅ Column picker select for ≤15 unique values, text input otherwise — Task 2 (filter-slots.ts)
- ✅ Value field disabled when no column selected — Task 2
- ✅ 250ms debounce on text inputs — Task 2
- ✅ Analysis panel with column picker + 5 stat cards — Task 3
- ✅ Stats computed over filtered rows only — Task 3 (`renderAnalysisPanel` receives `filteredRows`)
- ✅ "Based on N rows" note — Task 3
- ✅ Empty state when no filtered rows — Task 3
- ✅ Text columns show `—` for Sum/Avg — Task 3 `computeAggregates`
- ✅ Download bar with row count note — Task 4
- ✅ Download disabled before clean applied — Task 4
- ✅ Download disabled when 0 filtered rows — Task 4
- ✅ Revert in download bar — Task 4
- ✅ Preview table simplified (no tfoot, no column-click) — Task 5
- ✅ `analysis-toolbar.ts` deleted — Task 5 Step 2
- ✅ `activeColumn` reset when removed by sparse-columns fix — Task 6 `handleClean`
- ✅ Filter slots reset on file upload / revert / reset — Task 6 handlers
- ✅ Mobile: sidebar collapsed strip hidden on narrow viewports — Task 7 Step 2
- ✅ CSS for all new components — Task 7 Steps 5–6

**Placeholder scan:** None found.

**Type consistency:**
- `FilterSlot` defined in Task 1, used in Tasks 2, 3, 4, 6 — consistent
- `getFilteredRows` signature `(Row[], string[], FilterSlot[])` — used correctly in Task 6
- `renderFilterSlots` callback interface `FilterSlotsCallbacks` defined in Task 2, matched in Task 6
- `renderAnalysisPanel` signature matches usage in Task 6
- `renderDownloadBar` signature matches usage in Task 6
- `onHide` added to `PanelCallbacks` in Task 6 Step 1, passed in Task 6 Step 2 — consistent
