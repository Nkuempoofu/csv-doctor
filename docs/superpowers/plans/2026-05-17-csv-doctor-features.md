# CSV Doctor — Feature Expansion Plan (Groups A→B→C→E→D)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 7 features to CSV Doctor across five groups: export as JSON/XLSX, EU number format normalisation, duplicate-column detection, Find & Replace, a data-quality report, and a one-level undo.

**Architecture:** Each group extends the existing analyzer → cleaner → exporter → UI pipeline with no new frameworks. New logic lives in isolated files (`find-replace.ts`, `report.ts`); existing files receive targeted additions. The download bar is refactored to an options-object signature so it can carry all new callbacks cleanly. All changes are browser-only, no server required.

**Tech Stack:** TypeScript 5, Vite 5, Vitest, Papa Parse, SheetJS (`xlsx` package for XLSX export), vanilla DOM.

---

## File Structure

### New files
| Path | Purpose |
|---|---|
| `src/lib/find-replace.ts` | `FindReplaceRule` type, pure `applyFindReplace()` |
| `src/lib/__tests__/find-replace.test.ts` | Unit tests for find-replace logic |
| `src/ui/find-replace-panel.ts` | Find & Replace UI panel component |
| `src/core/report.ts` | `generateReport()` → HTML string; `downloadReport()` |

### Modified files
| Path | What changes |
|---|---|
| `src/types.ts` | Add `'number-format' \| 'duplicate-columns' \| 'find-replace'` to IssueId; add `FindReplaceRule` interface |
| `src/core/exporter.ts` | Add `buildJsonObjects()`, `exportJson()`, `exportXlsx()`, `suggestJsonFilename()`, `suggestXlsxFilename()` |
| `src/core/__tests__/exporter.test.ts` | Create: tests for `buildJsonObjects` |
| `src/core/analyzer.ts` | Add `detectNumberFormat()`, `detectDuplicateColumns()` |
| `src/core/__tests__/analyzer.test.ts` | Add tests for two new detectors |
| `src/core/cleaner.ts` | Add EU-number fix pass; add `fixEuropeanNumber()` |
| `src/core/__tests__/cleaner.test.ts` | Add test for `number-format` fix |
| `src/ui/download-bar.ts` | Refactor signature to `DownloadBarOptions`; add CSV/JSON/XLSX buttons, Undo button, Report button |
| `src/main.ts` | New state fields; new handlers for all features; updated `renderDownloadBar` call |
| `src/styles.css` | Styles for format button group, find-replace panel, report button |
| `package.json` | Add `xlsx` dependency |

---

## Group A — Export Suite

### Task 1: JSON export

**Files:**
- Modify: `src/core/exporter.ts`
- Create: `src/core/__tests__/exporter.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/core/__tests__/exporter.test.ts
import { describe, it, expect } from 'vitest';
import { buildJsonObjects, suggestJsonFilename, suggestXlsxFilename } from '../exporter';

describe('buildJsonObjects', () => {
  it('maps rows to objects keyed by header', () => {
    const rows = [['Alice', '30'], ['Bob', '25']];
    const headers = ['Name', 'Age'];
    expect(buildJsonObjects(rows, headers)).toEqual([
      { Name: 'Alice', Age: '30' },
      { Name: 'Bob', Age: '25' },
    ]);
  });

  it('fills missing cells with empty string', () => {
    const rows = [['Alice']];
    const headers = ['Name', 'Age'];
    expect(buildJsonObjects(rows, headers)[0]).toEqual({ Name: 'Alice', Age: '' });
  });

  it('handles empty rows array', () => {
    expect(buildJsonObjects([], ['Name'])).toEqual([]);
  });
});

describe('suggestJsonFilename', () => {
  it('replaces csv extension with json', () => {
    expect(suggestJsonFilename('data.csv')).toBe('data-cleaned.json');
  });
});

describe('suggestXlsxFilename', () => {
  it('replaces csv extension with xlsx', () => {
    expect(suggestXlsxFilename('data.csv')).toBe('data-cleaned.xlsx');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npm test -- --reporter=verbose 2>&1 | grep -E "FAIL|buildJson|suggestJson|suggestXlsx"
```

Expected: FAIL — `buildJsonObjects` not found.

- [ ] **Step 3: Add `buildJsonObjects` and filename helpers to `exporter.ts`**

Add these exports after the existing `suggestFilename` function:

```typescript
/** Pure: convert rows → array of {header: value} objects for JSON export. */
export function buildJsonObjects(
  rows: Row[],
  headers: string[]
): Record<string, string>[] {
  return rows.map(row => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
    return obj;
  });
}

export function suggestJsonFilename(originalName: string): string {
  const base = originalName.replace(/\.(csv|tsv|txt)$/i, '');
  return `${base}-cleaned.json`;
}

export function suggestXlsxFilename(originalName: string): string {
  const base = originalName.replace(/\.(csv|tsv|txt)$/i, '');
  return `${base}-cleaned.xlsx`;
}

export function exportJson(
  file: ParsedFile,
  rows: Row[],
  filename: string,
  headers: string[] = file.headers
): void {
  const json = JSON.stringify(buildJsonObjects(rows, headers), null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 250);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npm test -- --reporter=verbose 2>&1 | grep -E "buildJson|suggestJson|suggestXlsx|PASS|FAIL"
```

Expected: all three `buildJsonObjects` + filename tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/exporter.ts src/core/__tests__/exporter.test.ts
git commit -m "feat: add JSON export (buildJsonObjects + exportJson)"
```

---

### Task 2: Excel export

**Files:**
- Modify: `package.json`, `src/core/exporter.ts`

- [ ] **Step 1: Install SheetJS**

```
npm install xlsx
```

Verify it appeared in `package.json` under `dependencies`.

- [ ] **Step 2: Add `exportXlsx` to `exporter.ts`**

Add at the top of the file (with the existing Papa import):

```typescript
import * as XLSX from 'xlsx';
```

Then add the function after `exportJson`:

```typescript
export function exportXlsx(
  file: ParsedFile,
  rows: Row[],
  filename: string,
  headers: string[] = file.headers
): void {
  const data = [headers, ...rows];
  const ws   = XLSX.utils.aoa_to_sheet(data);
  const wb   = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cleaned');

  const buf  = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 250);
}
```

- [ ] **Step 3: Run full test suite and build**

```
npm test && npm run build
```

Expected: all tests pass; build succeeds (bundle size will increase ~50 KB gzip due to SheetJS).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/core/exporter.ts
git commit -m "feat: add Excel (.xlsx) export via SheetJS"
```

---

### Task 3: Update download bar

**Files:**
- Modify: `src/ui/download-bar.ts`

The current function takes individual parameters. We'll refactor to an options object and add format buttons, Undo, and Report.

- [ ] **Step 1: Replace `download-bar.ts` with the new implementation**

```typescript
// src/ui/download-bar.ts
/**
 * Download bar — persistent action bar rendered below the analysis panel.
 * Shows export row count, format download buttons, undo, revert, and report.
 */

export interface DownloadBarOptions {
  filteredCount:    number;
  hasResult:        boolean;
  hasFilters:       boolean;
  hasPrevResult:    boolean;    // true → show Undo button
  onDownloadCsv:  () => void;
  onDownloadJson: () => void;
  onDownloadXlsx: () => void;
  onDownloadReport: () => void;
  onRevert:       () => void;
  onUndo:         () => void;
}

export function renderDownloadBar(opts: DownloadBarOptions): HTMLElement {
  const {
    filteredCount, hasResult, hasFilters, hasPrevResult,
    onDownloadCsv, onDownloadJson, onDownloadXlsx,
    onDownloadReport, onRevert, onUndo,
  } = opts;

  const downloadDisabled = !hasResult || filteredCount === 0;

  let noteText: string;
  if (!hasResult) {
    noteText = 'Apply fixes before downloading';
  } else if (filteredCount === 0) {
    noteText = 'No rows to export';
  } else if (hasFilters) {
    noteText = `Exporting ${filteredCount.toLocaleString()} filtered row${filteredCount === 1 ? '' : 's'}`;
  } else {
    noteText = `Exporting ${filteredCount.toLocaleString()} row${filteredCount === 1 ? '' : 's'}`;
  }

  const section = document.createElement('section');
  section.className = 'download-bar';

  section.innerHTML = `
    <span class="download-bar-note">${noteText}</span>
    <div class="download-bar-actions">
      ${hasPrevResult
        ? `<button class="btn btn-ghost" id="dl-bar-undo" type="button">↩ Undo</button>`
        : ''}
      ${hasResult
        ? `<button class="btn btn-ghost" id="dl-bar-revert" type="button">Revert to original</button>`
        : ''}
      ${hasResult
        ? `<button class="btn btn-ghost" id="dl-bar-report" type="button">
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
             Report
           </button>`
        : ''}
      <div class="dl-format-group">
        <button class="btn btn-primary" id="dl-bar-csv"  type="button" ${downloadDisabled ? 'disabled' : ''}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          CSV
        </button>
        <button class="btn btn-secondary" id="dl-bar-json" type="button" ${downloadDisabled ? 'disabled' : ''}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          JSON
        </button>
        <button class="btn btn-secondary" id="dl-bar-xlsx" type="button" ${downloadDisabled ? 'disabled' : ''}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          XLSX
        </button>
      </div>
    </div>
  `;

  setTimeout(() => {
    document.getElementById('dl-bar-csv')?.addEventListener('click', onDownloadCsv);
    document.getElementById('dl-bar-json')?.addEventListener('click', onDownloadJson);
    document.getElementById('dl-bar-xlsx')?.addEventListener('click', onDownloadXlsx);
    document.getElementById('dl-bar-report')?.addEventListener('click', onDownloadReport);
    document.getElementById('dl-bar-revert')?.addEventListener('click', onRevert);
    document.getElementById('dl-bar-undo')?.addEventListener('click', onUndo);
  }, 0);

  return section;
}
```

- [ ] **Step 2: Run build to catch TypeScript errors**

```
npm run build 2>&1 | head -30
```

Expected: TypeScript errors in `main.ts` only (because the old `renderDownloadBar` call signature is now wrong). We fix that in the next task.

- [ ] **Step 3: Commit**

```bash
git add src/ui/download-bar.ts
git commit -m "refactor: download bar uses DownloadBarOptions; add CSV/JSON/XLSX/Report/Undo buttons"
```

---

### Task 4: Wire exports + undo + report into `main.ts`

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add new imports and extend AppState**

At the top of `main.ts`, update imports:

```typescript
import {
  exportCsv, suggestFilename,
  exportJson, suggestJsonFilename,
  exportXlsx, suggestXlsxFilename,
} from './core/exporter';
import type { DownloadBarOptions } from './ui/download-bar';
```

Extend `AppState`:

```typescript
interface AppState {
  parsed:       ParsedFile | null;
  issues:       Issue[];
  result:       CleanResult | null;
  prevResult:   CleanResult | null;   // one-level undo
  toast:        { message: string; tone: 'info' | 'error' | 'success' } | null;
  activeColumn: string | null;
  filterSlots:  FilterSlot[];
  sidebarOpen:  boolean;
}

const state: AppState = {
  parsed:       null,
  issues:       [],
  result:       null,
  prevResult:   null,
  toast:        null,
  activeColumn: null,
  filterSlots:  [{ column: '', value: '' }],
  sidebarOpen:  true,
};
```

- [ ] **Step 2: Update `handleClean` to save undo snapshot**

```typescript
function handleClean() {
  if (!state.parsed) return;
  const enabled = new Set<IssueId>(state.issues.filter(i => i.enabled).map(i => i.id));
  if (enabled.size === 0) {
    showToast('Toggle at least one fix on first.', 'info');
    return;
  }
  state.prevResult = state.result;   // ← save snapshot before overwriting
  state.result = clean(state.parsed, { enabled });
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
```

- [ ] **Step 3: Add three export handlers and undo + report handlers**

```typescript
function handleExportCsv() {
  if (!state.parsed || !state.result) return;
  const displayHeaders = state.result.cleanedHeaders ?? state.parsed.headers;
  const filteredRows   = getFilteredRows(state.result.rows, displayHeaders, state.filterSlots);
  if (filteredRows.length === 0) return;
  const filename = suggestFilename(state.parsed.filename);
  exportCsv(state.parsed, filteredRows, filename, state.parsed.delimiter, displayHeaders);
  showToast(hasActiveFilters()
    ? `Downloaded ${filteredRows.length.toLocaleString()} filtered rows as ${filename}`
    : `Downloaded ${filename}`, 'success');
}

function handleExportJson() {
  if (!state.parsed || !state.result) return;
  const displayHeaders = state.result.cleanedHeaders ?? state.parsed.headers;
  const filteredRows   = getFilteredRows(state.result.rows, displayHeaders, state.filterSlots);
  if (filteredRows.length === 0) return;
  const filename = suggestJsonFilename(state.parsed.filename);
  exportJson(state.parsed, filteredRows, filename, displayHeaders);
  showToast(`Downloaded ${filename}`, 'success');
}

function handleExportXlsx() {
  if (!state.parsed || !state.result) return;
  const displayHeaders = state.result.cleanedHeaders ?? state.parsed.headers;
  const filteredRows   = getFilteredRows(state.result.rows, displayHeaders, state.filterSlots);
  if (filteredRows.length === 0) return;
  const filename = suggestXlsxFilename(state.parsed.filename);
  exportXlsx(state.parsed, filteredRows, filename, displayHeaders);
  showToast(`Downloaded ${filename}`, 'success');
}

function handleUndo() {
  state.result     = state.prevResult;
  state.prevResult = null;
  showToast('Last fix reverted.', 'info');
  render();
}

function handleDownloadReport() {
  // Stub — wired up in Group E Task 11
  showToast('Report coming in Group E.', 'info');
}
```

- [ ] **Step 4: Replace the old `handleExport` call and update `renderDownloadBar` call**

Remove the old `handleExport` function entirely.

Find the `renderDownloadBar(...)` call in `render()` and replace it:

```typescript
// OLD:
main.appendChild(renderDownloadBar(
  filteredRows.length,
  state.result !== null,
  hasActiveFilters(),
  handleExport,
  handleRevert,
));

// NEW:
const dlOpts: DownloadBarOptions = {
  filteredCount:    filteredRows.length,
  hasResult:        state.result !== null,
  hasFilters:       hasActiveFilters(),
  hasPrevResult:    state.prevResult !== null,
  onDownloadCsv:    handleExportCsv,
  onDownloadJson:   handleExportJson,
  onDownloadXlsx:   handleExportXlsx,
  onDownloadReport: handleDownloadReport,
  onRevert:         handleRevert,
  onUndo:           handleUndo,
};
main.appendChild(renderDownloadBar(dlOpts));
```

- [ ] **Step 5: Add CSS for the format button group to `styles.css`**

Append at the end:

```css
/* ── Download bar format buttons ─────────────────── */
.dl-format-group {
  display: flex;
  gap: 0.25rem;
}

.dl-format-group .btn {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0.85rem;
  font-size: 0.8rem;
}

.btn.btn-secondary {
  background: var(--surface-2, #1e293b);
  color: var(--text-2, #94a3b8);
  border: 1px solid var(--border, #334155);
}

.btn.btn-secondary:hover:not(:disabled) {
  background: var(--surface-3, #273549);
  color: var(--text-1, #e2e8f0);
}

.btn.btn-secondary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
```

- [ ] **Step 6: Run full test suite and build**

```
npm test && npm run build
```

Expected: 99 tests pass; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/main.ts src/styles.css
git commit -m "feat: wire JSON/XLSX export, undo stub, and report stub into main.ts"
```

---

## Group B — Data Cleaning Additions

### Task 5: EU number format normalisation

**Files:**
- Modify: `src/types.ts`, `src/core/analyzer.ts`, `src/core/cleaner.ts`, `src/core/__tests__/cleaner.test.ts`, `src/core/__tests__/analyzer.test.ts`

- [ ] **Step 1: Add `'number-format'` to `IssueId` in `types.ts`**

```typescript
export type IssueId =
  | 'empty-rows'
  | 'duplicate-rows'
  | 'whitespace'
  | 'mixed-case'
  | 'mixed-types'
  | 'mixed-dates'
  | 'mixed-booleans'
  | 'special-chars'
  | 'currency-numbers'
  | 'header-issues'
  | 'contact-formats'
  | 'sparse-columns'
  | 'fuzzy-values'
  | 'number-format'       // ← new
  | 'duplicate-columns'   // ← new (used in Task 6)
  | 'find-replace';       // ← new (used in Task 7)
```

- [ ] **Step 2: Write failing tests for the detector and cleaner**

Add to `src/core/__tests__/analyzer.test.ts`:

```typescript
describe('detectNumberFormat', () => {
  it('flags a column with EU thousands/decimal formatting', () => {
    const file = makeFile(
      ['Revenue'],
      [['1.234,56'], ['2.000,00'], ['10.500,75'], ['3.100,00']]
    );
    const issues = analyze(file);
    const issue = issues.find(i => i.id === 'number-format');
    expect(issue).toBeDefined();
    expect(issue!.affectedColumns).toContain('Revenue');
  });

  it('does not flag a column with US/plain numbers', () => {
    const file = makeFile(
      ['Revenue'],
      [['1234.56'], ['2000.00'], ['10500.75']]
    );
    const issues = analyze(file);
    expect(issues.find(i => i.id === 'number-format')).toBeUndefined();
  });

  it('does not flag a column with fewer than 3 non-empty values', () => {
    const file = makeFile(['Revenue'], [['1.234,56'], ['']]);
    const issues = analyze(file);
    expect(issues.find(i => i.id === 'number-format')).toBeUndefined();
  });
});
```

Add to `src/core/__tests__/cleaner.test.ts`:

```typescript
describe('clean — number-format', () => {
  it('converts EU thousands+decimal format to plain number', () => {
    const file = makeFile(['Amount'], [['1.234,56'], ['2.000,00'], ['10.500,75']]);
    const result = clean(file, { enabled: new Set(['number-format']) });
    expect(result.rows[0][0]).toBe('1234.56');
    expect(result.rows[1][0]).toBe('2000.00');
    expect(result.rows[2][0]).toBe('10500.75');
  });

  it('converts EU thousands-only format (no decimal)', () => {
    const file = makeFile(['Count'], [['1.000'], ['20.000'], ['300.000']]);
    const result = clean(file, { enabled: new Set(['number-format']) });
    expect(result.rows[0][0]).toBe('1000');
    expect(result.rows[1][0]).toBe('20000');
    expect(result.rows[2][0]).toBe('300000');
  });

  it('leaves plain numbers and US-format numbers untouched', () => {
    const file = makeFile(['Amount'], [['1,234.56'], ['3.14'], ['100']]);
    const result = clean(file, { enabled: new Set(['number-format']) });
    expect(result.rows[0][0]).toBe('1,234.56');
    expect(result.rows[1][0]).toBe('3.14');
    expect(result.rows[2][0]).toBe('100');
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```
npm test -- --reporter=verbose 2>&1 | grep -E "number-format|FAIL"
```

Expected: FAIL on all new tests.

- [ ] **Step 4: Add `detectNumberFormat` to `analyzer.ts`**

Add this function before the `analyze()` export, and add it to the detectors array:

```typescript
function detectNumberFormat(file: ParsedFile): Issue | null {
  // EU format: dot as thousands separator, comma as decimal separator.
  // Strict pattern: must have both dots-as-thousands AND comma-as-decimal (e.g. "1.234,56")
  const EU_STRICT_RE = /^\d{1,3}(\.\d{3})+,\d+$/;
  // Broad pattern: also matches thousands-only (e.g. "1.234")
  const EU_BROAD_RE  = /^\d{1,3}(\.\d{3})+(,\d+)?$/;

  const affected: string[] = [];
  let totalCells = 0;

  for (let c = 0; c < file.headers.length; c++) {
    const nonEmpty = file.rows.map(r => (r[c] ?? '').trim()).filter(Boolean);
    if (nonEmpty.length < 3) continue;

    // Require at least 20% of values to have the explicit decimal comma (strict pattern).
    // This prevents false-positives on values like "3.141" (regular decimals).
    const strictMatches = nonEmpty.filter(v => EU_STRICT_RE.test(v)).length;
    if (strictMatches / nonEmpty.length >= 0.2) {
      const broadMatches = nonEmpty.filter(v => EU_BROAD_RE.test(v)).length;
      affected.push(file.headers[c] ?? `col_${c}`);
      totalCells += broadMatches;
    }
  }

  if (affected.length === 0) return null;

  return {
    id: 'number-format',
    label: 'EU number format',
    description: `${affected.length} column${affected.length === 1 ? ' uses' : 's use'} European number formatting (e.g. "1.234,56"). Cleaning will convert to standard decimal notation (1234.56).`,
    severity: 'medium',
    count: totalCells,
    affectedColumns: affected,
    enabled: true,
  };
}
```

In the `analyze()` function, add `detectNumberFormat` to the detectors array (after `detectCurrencyNumbers`):

```typescript
const detectors = [
  detectEmptyRows,
  detectDuplicateRows,
  detectWhitespace,
  detectMixedDates,
  detectMixedTypes,
  detectMixedCase,
  detectMixedBooleans,
  detectSpecialChars,
  detectCurrencyNumbers,
  detectNumberFormat,       // ← add here
  detectHeaderIssues,
  detectContactFormats,
  detectSparseColumns,
  detectFuzzyValues,
];
```

- [ ] **Step 5: Add `fixEuropeanNumber` and its application in `cleaner.ts`**

Add the constant and helper near the top of `cleaner.ts` (alongside the other regex constants):

```typescript
const EU_NUMBER_RE = /^\d{1,3}(\.\d{3})+(,\d+)?$/;

function fixEuropeanNumber(value: string): string {
  const v = value.trim();
  if (!EU_NUMBER_RE.test(v)) return value;
  // Remove thousands dots; replace decimal comma with dot.
  return v.replace(/\./g, '').replace(',', '.');
}
```

In the cell-level transform loop (after the `currency-numbers` block), add:

```typescript
if (enabled.has('number-format')) {
  const fixed = fixEuropeanNumber(next);
  if (fixed !== next) next = fixed;
}
```

In `pickReason`, add before the final `return 'special-chars'`:

```typescript
if (EU_NUMBER_RE.test(before) && /^\d+(\.\d+)?$/.test(after)) return 'number-format';
```

- [ ] **Step 6: Run tests**

```
npm test
```

Expected: all tests pass (was 99, now 99 + 6 new = 105).

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/core/analyzer.ts src/core/cleaner.ts \
        src/core/__tests__/analyzer.test.ts src/core/__tests__/cleaner.test.ts
git commit -m "feat: EU number format detection and normalisation"
```

---

### Task 6: Duplicate column detection

**Files:**
- Modify: `src/core/analyzer.ts`, `src/core/__tests__/analyzer.test.ts`

Note: `'duplicate-columns'` was already added to `IssueId` in Task 5.

- [ ] **Step 1: Write failing tests**

Add to `src/core/__tests__/analyzer.test.ts`:

```typescript
describe('detectDuplicateColumns', () => {
  it('flags two columns with ≥90% identical non-empty values', () => {
    const file = makeFile(
      ['Region', 'Territory'],
      [
        ['North', 'North'],
        ['South', 'South'],
        ['East',  'East'],
        ['West',  'West'],
        ['North', 'North'],
      ]
    );
    const issues = analyze(file);
    const issue = issues.find(i => i.id === 'duplicate-columns');
    expect(issue).toBeDefined();
    expect(issue!.count).toBe(1); // 1 duplicate pair
  });

  it('does not flag columns with different content', () => {
    const file = makeFile(
      ['Region', 'Country'],
      [['North', 'South Africa'], ['South', 'Nigeria'], ['East', 'Kenya']]
    );
    const issues = analyze(file);
    expect(issues.find(i => i.id === 'duplicate-columns')).toBeUndefined();
  });

  it('does not flag when fewer than 5 non-empty rows exist', () => {
    const file = makeFile(
      ['A', 'B'],
      [['x', 'x'], ['y', 'y'], ['z', 'z']]
    );
    const issues = analyze(file);
    expect(issues.find(i => i.id === 'duplicate-columns')).toBeUndefined();
  });

  it('is case-insensitive when comparing', () => {
    const file = makeFile(
      ['Col1', 'Col2'],
      [['North', 'north'], ['South', 'SOUTH'], ['East', 'east'],
       ['West', 'WEST'], ['Central', 'central']]
    );
    const issues = analyze(file);
    expect(issues.find(i => i.id === 'duplicate-columns')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```
npm test -- --reporter=verbose 2>&1 | grep -E "duplicate-columns|FAIL"
```

- [ ] **Step 3: Add `detectDuplicateColumns` to `analyzer.ts`**

Add before `analyze()`:

```typescript
function detectDuplicateColumns(file: ParsedFile): Issue | null {
  if (file.rows.length < 5) return null;
  const SIMILARITY = 0.9;
  const pairs: string[] = [];

  for (let i = 0; i < file.headers.length; i++) {
    for (let j = i + 1; j < file.headers.length; j++) {
      let matches = 0;
      let total   = 0;
      for (const row of file.rows) {
        const vi = (row[i] ?? '').trim().toLowerCase();
        const vj = (row[j] ?? '').trim().toLowerCase();
        if (vi === '' && vj === '') continue; // skip both-empty rows
        total++;
        if (vi === vj) matches++;
      }
      if (total >= 5 && matches / total >= SIMILARITY) {
        pairs.push(`"${file.headers[i]}" ≈ "${file.headers[j]}"`);
      }
    }
  }

  if (pairs.length === 0) return null;

  return {
    id: 'duplicate-columns',
    label: 'Duplicate columns',
    description: `${pairs.length} pair${pairs.length === 1 ? '' : 's'} of columns appear to contain identical data: ${pairs.slice(0, 3).join('; ')}. Review and remove one manually.`,
    severity: 'medium',
    count: pairs.length,
    affectedColumns: [],
    enabled: false, // detection-only — no auto-clean
  };
}
```

Add `detectDuplicateColumns` to the detectors array in `analyze()` (after `detectSparseColumns`):

```typescript
const detectors = [
  // ... existing detectors ...
  detectSparseColumns,
  detectDuplicateColumns,  // ← add here
  detectFuzzyValues,
];
```

- [ ] **Step 4: Run tests**

```
npm test
```

Expected: all tests pass (105 + 4 new = 109).

- [ ] **Step 5: Commit**

```bash
git add src/core/analyzer.ts src/core/__tests__/analyzer.test.ts
git commit -m "feat: duplicate column detection"
```

---

## Group C — Find & Replace

### Task 7: `FindReplaceRule` type and pure `applyFindReplace` function

**Files:**
- Modify: `src/types.ts`
- Create: `src/lib/find-replace.ts`, `src/lib/__tests__/find-replace.test.ts`

- [ ] **Step 1: Add `FindReplaceRule` to `types.ts`**

```typescript
/** A single find-and-replace rule applied via the Find & Replace panel. */
export interface FindReplaceRule {
  id:            string;   // unique key for list rendering
  column:        string;   // header name to restrict to; '' = all columns
  find:          string;
  replace:       string;
  caseSensitive: boolean;
  wholeCell:     boolean;  // true = whole cell must equal `find`; false = substring
}
```

- [ ] **Step 2: Write failing tests**

```typescript
// src/lib/__tests__/find-replace.test.ts
import { describe, it, expect } from 'vitest';
import { applyFindReplace } from '../find-replace';
import type { FindReplaceRule } from '../../types';

describe('applyFindReplace', () => {
  it('replaces a whole-cell match (case-insensitive)', () => {
    const rows    = [['Jhb'], ['Cape Town']];
    const headers = ['City'];
    const rules: FindReplaceRule[] = [
      { id: '1', column: '', find: 'Jhb', replace: 'Johannesburg',
        caseSensitive: false, wholeCell: true },
    ];
    const { rows: result, changes } = applyFindReplace(rows, headers, rules);
    expect(result[0][0]).toBe('Johannesburg');
    expect(result[1][0]).toBe('Cape Town');
    expect(changes).toHaveLength(1);
  });

  it('replaces a substring match', () => {
    const rows    = [['Mr. Smith'], ['Dr. Jones']];
    const headers = ['Name'];
    const rules: FindReplaceRule[] = [
      { id: '1', column: '', find: 'Mr. ', replace: 'Mr ',
        caseSensitive: false, wholeCell: false },
    ];
    const { rows: result } = applyFindReplace(rows, headers, rules);
    expect(result[0][0]).toBe('Mr Smith');
    expect(result[1][0]).toBe('Dr. Jones');
  });

  it('respects case sensitivity', () => {
    const rows    = [['hello'], ['HELLO']];
    const headers = ['Greeting'];
    const rules: FindReplaceRule[] = [
      { id: '1', column: '', find: 'hello', replace: 'hi',
        caseSensitive: true, wholeCell: false },
    ];
    const { rows: result } = applyFindReplace(rows, headers, rules);
    expect(result[0][0]).toBe('hi');
    expect(result[1][0]).toBe('HELLO');
  });

  it('restricts replacement to the specified column', () => {
    const rows    = [['London', 'London']];
    const headers = ['City', 'Country'];
    const rules: FindReplaceRule[] = [
      { id: '1', column: 'City', find: 'London', replace: 'NYC',
        caseSensitive: false, wholeCell: true },
    ];
    const { rows: result } = applyFindReplace(rows, headers, rules);
    expect(result[0][0]).toBe('NYC');
    expect(result[0][1]).toBe('London');
  });

  it('applies rules in order (second rule sees output of first)', () => {
    const rows    = [['foo']];
    const headers = ['X'];
    const rules: FindReplaceRule[] = [
      { id: '1', column: '', find: 'foo', replace: 'bar', caseSensitive: false, wholeCell: false },
      { id: '2', column: '', find: 'bar', replace: 'baz', caseSensitive: false, wholeCell: false },
    ];
    const { rows: result } = applyFindReplace(rows, headers, rules);
    expect(result[0][0]).toBe('baz');
  });

  it('returns original rows and empty changes when rules array is empty', () => {
    const rows    = [['test']];
    const headers = ['Col'];
    const { rows: result, changes } = applyFindReplace(rows, headers, []);
    expect(result).toEqual(rows);
    expect(changes).toHaveLength(0);
  });

  it('skips rules with empty find string', () => {
    const rows    = [['test']];
    const headers = ['Col'];
    const rules: FindReplaceRule[] = [
      { id: '1', column: '', find: '', replace: 'NOPE', caseSensitive: false, wholeCell: false },
    ];
    const { rows: result } = applyFindReplace(rows, headers, rules);
    expect(result[0][0]).toBe('test');
  });
});
```

- [ ] **Step 3: Run tests to confirm failure**

```
npm test -- --reporter=verbose 2>&1 | grep -E "applyFindReplace|FAIL"
```

- [ ] **Step 4: Create `src/lib/find-replace.ts`**

```typescript
/**
 * Find & Replace — pure transformation.
 *
 * Applies a sequence of FindReplaceRules to a row array and returns
 * the modified rows plus a CellChange list (reason: 'find-replace').
 * Rules are applied in order; each rule sees the output of the previous one.
 */

import type { Row, CellChange, FindReplaceRule } from '../types';

export function applyFindReplace(
  rows:    Row[],
  headers: string[],
  rules:   FindReplaceRule[]
): { rows: Row[]; changes: CellChange[] } {
  if (rules.length === 0) return { rows, changes: [] };

  const changes: CellChange[] = [];

  const newRows = rows.map((row, rowIdx) =>
    row.map((cell, colIdx) => {
      let value   = cell ?? '';
      const original = value;
      const colName  = headers[colIdx] ?? '';

      for (const rule of rules) {
        if (rule.find === '') continue;
        if (rule.column !== '' && rule.column !== colName) continue;

        const before = value;

        if (rule.wholeCell) {
          const matches = rule.caseSensitive
            ? value === rule.find
            : value.toLowerCase() === rule.find.toLowerCase();
          if (matches) value = rule.replace;
        } else {
          const flags   = rule.caseSensitive ? 'g' : 'gi';
          const escaped = rule.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          value = value.replace(new RegExp(escaped, flags), rule.replace);
        }

        // Record a change only for the first rule that modifies this cell.
        if (value !== before && value !== original) {
          // (already recorded below — track only the net change per cell)
        }
      }

      if (value !== original) {
        changes.push({
          rowIndex: rowIdx,
          colIndex: colIdx,
          before:   original,
          after:    value,
          reason:   'find-replace',
        });
      }

      return value;
    })
  );

  return { rows: newRows, changes };
}
```

- [ ] **Step 5: Run tests**

```
npm test
```

Expected: all tests pass (109 + 7 new = 116).

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/lib/find-replace.ts src/lib/__tests__/find-replace.test.ts
git commit -m "feat: FindReplaceRule type and applyFindReplace pure function"
```

---

### Task 8: Find & Replace panel UI

**Files:**
- Create: `src/ui/find-replace-panel.ts`

- [ ] **Step 1: Create `src/ui/find-replace-panel.ts`**

```typescript
// src/ui/find-replace-panel.ts
/**
 * Find & Replace panel.
 *
 * Renders a collapsible panel with a rule builder (column selector, find/replace
 * inputs, checkboxes) and a list of active rules.  All state lives in main.ts —
 * the panel is purely presentational and fires callbacks.
 */

import type { FindReplaceRule } from '../types';

export interface FindReplacePanelCallbacks {
  onAddRule:    (rule: Omit<FindReplaceRule, 'id'>) => void;
  onRemoveRule: (id: string) => void;
  onApply:      () => void;
}

export function renderFindReplacePanel(
  headers:   string[],
  rules:     FindReplaceRule[],
  isOpen:    boolean,
  onToggle:  () => void,
  cb:        FindReplacePanelCallbacks
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'find-replace-panel';

  const headerOptions = ['', ...headers]
    .map(h => `<option value="${h}">${h === '' ? 'All columns' : h}</option>`)
    .join('');

  section.innerHTML = `
    <div class="find-replace-header">
      <button class="find-replace-toggle btn btn-ghost" id="fr-toggle" type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
        </svg>
        Find &amp; Replace
        ${rules.length > 0 ? `<span class="fr-badge">${rules.length}</span>` : ''}
      </button>
    </div>
    ${isOpen ? `
    <div class="find-replace-body">
      <div class="fr-builder">
        <select class="fr-select" id="fr-column">${headerOptions}</select>
        <input class="fr-input" id="fr-find"    type="text" placeholder="Find…"        />
        <input class="fr-input" id="fr-replace" type="text" placeholder="Replace with…"/>
        <label class="fr-checkbox-label">
          <input type="checkbox" id="fr-case"> Case-sensitive
        </label>
        <label class="fr-checkbox-label">
          <input type="checkbox" id="fr-whole"> Whole cell
        </label>
        <button class="btn btn-ghost fr-add-btn" id="fr-add" type="button">+ Add Rule</button>
      </div>
      ${rules.length > 0 ? `
      <ul class="fr-rules-list">
        ${rules.map(r => `
          <li class="fr-rule" data-id="${r.id}">
            <span class="fr-rule-col">${r.column || 'All'}</span>
            <span class="fr-rule-find">${escHtml(r.find)}</span>
            <span class="fr-rule-arrow">→</span>
            <span class="fr-rule-replace">${escHtml(r.replace)}</span>
            <span class="fr-rule-flags">${r.caseSensitive ? 'Cs' : ''}${r.wholeCell ? ' ⊡' : ''}</span>
            <button class="fr-rule-remove btn btn-ghost" data-id="${r.id}" type="button">✕</button>
          </li>`).join('')}
      </ul>
      <button class="btn btn-primary fr-apply-btn" id="fr-apply" type="button">
        Apply ${rules.length} rule${rules.length === 1 ? '' : 's'}
      </button>` : ''}
    </div>` : ''}
  `;

  // Wire events after DOM is available
  setTimeout(() => {
    document.getElementById('fr-toggle')?.addEventListener('click', onToggle);

    document.getElementById('fr-add')?.addEventListener('click', () => {
      const find    = (document.getElementById('fr-find')    as HTMLInputElement)?.value ?? '';
      if (!find) return;
      const rule: Omit<FindReplaceRule, 'id'> = {
        column:        (document.getElementById('fr-column') as HTMLSelectElement)?.value ?? '',
        find,
        replace:       (document.getElementById('fr-replace') as HTMLInputElement)?.value ?? '',
        caseSensitive: (document.getElementById('fr-case')   as HTMLInputElement)?.checked ?? false,
        wholeCell:     (document.getElementById('fr-whole')  as HTMLInputElement)?.checked ?? false,
      };
      cb.onAddRule(rule);
    });

    document.getElementById('fr-apply')?.addEventListener('click', cb.onApply);

    document.querySelectorAll<HTMLButtonElement>('.fr-rule-remove').forEach(btn => {
      btn.addEventListener('click', () => cb.onRemoveRule(btn.dataset.id!));
    });
  }, 0);

  return section;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```
npm run build 2>&1 | grep -E "error|Error"
```

Expected: no errors (main.ts will error until wired in next task).

- [ ] **Step 3: Commit**

```bash
git add src/ui/find-replace-panel.ts
git commit -m "feat: Find & Replace panel UI component"
```

---

### Task 9: Wire Find & Replace into `main.ts` and add styles

**Files:**
- Modify: `src/main.ts`, `src/styles.css`

- [ ] **Step 1: Add state fields and imports to `main.ts`**

New imports at the top:

```typescript
import { applyFindReplace }           from './lib/find-replace';
import { renderFindReplacePanel }     from './ui/find-replace-panel';
import type { FindReplacePanelCallbacks } from './ui/find-replace-panel';
```

Add to `AppState`:

```typescript
findReplaceRules: FindReplaceRule[];
findReplaceOpen:  boolean;
```

Add to the initial `state`:

```typescript
findReplaceRules: [],
findReplaceOpen:  false,
```

Add `FindReplaceRule` to the import from `'./types'`.

- [ ] **Step 2: Add Find & Replace handlers**

```typescript
function handleFRToggle() {
  state.findReplaceOpen = !state.findReplaceOpen;
  render();
}

function handleFRAddRule(rule: Omit<FindReplaceRule, 'id'>) {
  state.findReplaceRules = [
    ...state.findReplaceRules,
    { ...rule, id: String(Date.now()) },
  ];
  render();
}

function handleFRRemoveRule(id: string) {
  state.findReplaceRules = state.findReplaceRules.filter(r => r.id !== id);
  render();
}

function handleFRApply() {
  if (!state.parsed) return;
  if (state.findReplaceRules.length === 0) {
    showToast('Add at least one rule first.', 'info');
    return;
  }
  const sourceRows    = state.result?.rows ?? state.parsed.rows;
  const sourceHeaders = state.result?.cleanedHeaders ?? state.parsed.headers;
  const { rows: newRows, changes } = applyFindReplace(sourceRows, sourceHeaders, state.findReplaceRules);

  if (changes.length === 0) {
    showToast('No matches found.', 'info');
    return;
  }

  state.prevResult = state.result;
  if (state.result) {
    state.result = {
      ...state.result,
      rows:         newRows,
      changes:      [...state.result.changes, ...changes],
      appliedFixes: [...new Set([...state.result.appliedFixes, 'find-replace' as IssueId])],
    };
  } else {
    state.result = {
      rows:              newRows,
      removedRowIndices: [],
      changes,
      appliedFixes:      ['find-replace'],
      cleanedHeaders:    undefined,
    };
  }
  showToast(`Applied ${changes.length} replacement${changes.length === 1 ? '' : 's'}.`, 'success');
  render();
}
```

- [ ] **Step 3: Add panel to `render()` function**

In the `render()` function, in the "below workspace" block, add the Find & Replace panel just before `renderAnalysisPanel`:

```typescript
const frCallbacks: FindReplacePanelCallbacks = {
  onAddRule:    handleFRAddRule,
  onRemoveRule: handleFRRemoveRule,
  onApply:      handleFRApply,
};
main.appendChild(renderFindReplacePanel(
  displayHeaders,
  state.findReplaceRules,
  state.findReplaceOpen,
  handleFRToggle,
  frCallbacks,
));
```

Also reset `findReplaceRules` and `findReplaceOpen` in `handleReset()` and `handleRevert()`:

```typescript
// In handleReset():
state.findReplaceRules = [];
state.findReplaceOpen  = false;

// In handleRevert():
state.findReplaceRules = [];
state.findReplaceOpen  = false;
```

- [ ] **Step 4: Add CSS for Find & Replace panel to `styles.css`**

```css
/* ── Find & Replace panel ────────────────────────── */
.find-replace-panel {
  margin: 0 0 1rem;
  border: 1px solid var(--border, #334155);
  border-radius: 0.5rem;
  background: var(--surface-1, #0f172a);
  overflow: hidden;
}

.find-replace-header {
  padding: 0.5rem 1rem;
}

.find-replace-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  font-weight: 600;
}

.fr-badge {
  background: var(--accent, #6366f1);
  color: #fff;
  border-radius: 9999px;
  font-size: 0.7rem;
  padding: 0.1rem 0.45rem;
  font-weight: 700;
}

.find-replace-body {
  padding: 0.75rem 1rem 1rem;
  border-top: 1px solid var(--border, #334155);
}

.fr-builder {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.75rem;
}

.fr-select,
.fr-input {
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--border, #334155);
  border-radius: 0.35rem;
  background: var(--surface-2, #1e293b);
  color: var(--text-1, #e2e8f0);
  font-size: 0.82rem;
  min-width: 120px;
}

.fr-input { flex: 1 1 140px; }

.fr-checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.8rem;
  color: var(--text-2, #94a3b8);
  white-space: nowrap;
  cursor: pointer;
}

.fr-add-btn { font-size: 0.8rem; }

.fr-rules-list {
  list-style: none;
  padding: 0;
  margin: 0 0 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.fr-rule {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.6rem;
  background: var(--surface-2, #1e293b);
  border-radius: 0.3rem;
  font-size: 0.8rem;
}

.fr-rule-col    { color: var(--text-3, #64748b); font-size: 0.72rem; min-width: 60px; }
.fr-rule-find   { color: #f87171; font-family: monospace; }
.fr-rule-arrow  { color: var(--text-3, #64748b); }
.fr-rule-replace{ color: #4ade80; font-family: monospace; }
.fr-rule-flags  { color: var(--text-3, #64748b); font-size: 0.7rem; margin-left: auto; }
.fr-rule-remove { padding: 0.1rem 0.35rem; font-size: 0.75rem; margin-left: 0.25rem; }

.fr-apply-btn { width: 100%; justify-content: center; }
```

- [ ] **Step 5: Run tests and build**

```
npm test && npm run build
```

Expected: all 116 tests pass; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts src/styles.css
git commit -m "feat: wire Find & Replace panel into main.ts with state and handlers"
```

---

## Group E — Data Quality Report

### Task 10: `generateReport` function

**Files:**
- Create: `src/core/report.ts`

- [ ] **Step 1: Create `src/core/report.ts`**

```typescript
// src/core/report.ts
/**
 * Data quality report — generates a self-contained HTML file summarising
 * every fix applied during a cleaning session.
 *
 * The report includes:
 *   1. Summary table  — file metadata + totals
 *   2. Changes by fix — count per IssueId
 *   3. Before/after   — up to 5 examples per fix type
 */

import type { ParsedFile, CleanResult, CellChange, IssueId } from '../types';

const ISSUE_LABELS: Partial<Record<IssueId, string>> = {
  'empty-rows':       'Empty rows removed',
  'duplicate-rows':   'Duplicate rows removed',
  'whitespace':       'Whitespace fixed',
  'mixed-case':       'Capitalisation normalised',
  'mixed-types':      'Blank equivalents cleared',
  'mixed-dates':      'Dates normalised to ISO 8601',
  'mixed-booleans':   'Boolean values normalised',
  'special-chars':    'Encoding artifacts repaired',
  'currency-numbers': 'Currency formatting stripped',
  'header-issues':    'Headers normalised',
  'contact-formats':  'Contact formats normalised',
  'sparse-columns':   'Sparse columns removed',
  'fuzzy-values':     'Near-duplicate values merged',
  'number-format':    'EU number format normalised',
  'duplicate-columns':'Duplicate columns flagged',
  'find-replace':     'Find & Replace applied',
};

export function generateReport(
  file:            ParsedFile,
  result:          CleanResult,
  displayHeaders:  string[],
  filteredRowCount: number
): string {
  const byReason = new Map<IssueId, CellChange[]>();
  for (const ch of result.changes) {
    if (!byReason.has(ch.reason)) byReason.set(ch.reason, []);
    byReason.get(ch.reason)!.push(ch);
  }

  const changesRows = Array.from(byReason.entries())
    .map(([id, chs]) => {
      const label = ISSUE_LABELS[id] ?? id;
      const examples = chs.slice(0, 5).map(c =>
        `<tr>
           <td>${esc(displayHeaders[c.colIndex] ?? `col_${c.colIndex}`)}</td>
           <td class="before">${esc(c.before)}</td>
           <td class="after">${esc(c.after)}</td>
         </tr>`
      ).join('');
      return `
        <tr class="reason-row">
          <td><strong>${esc(label)}</strong></td>
          <td class="num">${chs.length.toLocaleString()}</td>
        </tr>
        ${examples
          ? `<tr class="examples-row">
               <td colspan="2">
                 <table class="examples">
                   <thead><tr><th>Column</th><th>Before</th><th>After</th></tr></thead>
                   <tbody>${examples}</tbody>
                 </table>
               </td>
             </tr>`
          : ''}`;
    }).join('');

  const removedCount = result.removedRowIndices.length;
  const changedCount = result.changes.length;
  const now          = new Date().toLocaleString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>CSV Doctor Report — ${esc(file.filename)}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 860px; margin: 2rem auto; color: #1e293b; }
  h1   { font-size: 1.4rem; margin-bottom: 0.25rem; }
  .subtitle { color: #64748b; font-size: 0.85rem; margin-bottom: 2rem; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 1.5rem; }
  th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid #e2e8f0; font-size: 0.85rem; }
  th { background: #f1f5f9; font-weight: 600; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .reason-row td { background: #f8fafc; font-size: 0.9rem; padding-top: 0.75rem; }
  .examples { margin: 0.5rem 0; }
  .examples th { background: none; font-size: 0.78rem; }
  .examples td { font-size: 0.78rem; font-family: monospace; }
  .before { color: #ef4444; }
  .after  { color: #16a34a; }
  .footer { margin-top: 2rem; font-size: 0.78rem; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 1rem; }
</style>
</head>
<body>
<h1>CSV Doctor — Data Quality Report</h1>
<div class="subtitle">Generated ${now}</div>

<h2>Summary</h2>
<table>
  <tbody>
    <tr><td>File</td><td>${esc(file.filename)}</td></tr>
    <tr><td>Original rows</td><td class="num">${file.rows.length.toLocaleString()}</td></tr>
    <tr><td>Rows after cleaning</td><td class="num">${filteredRowCount.toLocaleString()}</td></tr>
    <tr><td>Rows removed</td><td class="num">${removedCount.toLocaleString()}</td></tr>
    <tr><td>Columns</td><td class="num">${displayHeaders.length.toLocaleString()}</td></tr>
    <tr><td>Cells changed</td><td class="num">${changedCount.toLocaleString()}</td></tr>
    <tr><td>Fixes applied</td><td>${result.appliedFixes.map(id => ISSUE_LABELS[id] ?? id).join(', ')}</td></tr>
  </tbody>
</table>

<h2>Changes by Fix</h2>
<table>
  <thead><tr><th>Fix</th><th class="num">Cells changed</th></tr></thead>
  <tbody>${changesRows || '<tr><td colspan="2">No cell-level changes recorded.</td></tr>'}</tbody>
</table>

<div class="footer">Generated by <a href="https://csv-doctor.dev">CSV Doctor</a></div>
</body>
</html>`;
}

export function downloadReport(html: string, filename: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 250);
}

export function suggestReportFilename(originalName: string): string {
  const base = originalName.replace(/\.(csv|tsv|txt)$/i, '');
  return `${base}-report.html`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
```

- [ ] **Step 2: Build to verify no type errors**

```
npm run build 2>&1 | grep -E "error TS|Error"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/report.ts
git commit -m "feat: data quality report generator (generateReport → HTML)"
```

---

### Task 11: Wire report download into `main.ts`

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add report imports to `main.ts`**

```typescript
import { generateReport, downloadReport, suggestReportFilename } from './core/report';
```

- [ ] **Step 2: Replace the stub `handleDownloadReport` with the real implementation**

Find the stub added in Task 4 and replace it:

```typescript
function handleDownloadReport() {
  if (!state.parsed || !state.result) return;
  const displayHeaders  = state.result.cleanedHeaders ?? state.parsed.headers;
  const displayRows     = state.result.rows;
  const filteredRows    = getFilteredRows(displayRows, displayHeaders, state.filterSlots);
  const html            = generateReport(state.parsed, state.result, displayHeaders, filteredRows.length);
  const filename        = suggestReportFilename(state.parsed.filename);
  downloadReport(html, filename);
  showToast(`Downloaded ${filename}`, 'success');
}
```

- [ ] **Step 3: Run tests and build**

```
npm test && npm run build
```

Expected: all 116 tests pass; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire data quality report download into main.ts"
```

---

## Group D — Undo

The undo state (`prevResult`) and the `handleUndo` handler were already added in Task 4. This task wires the remaining edge cases.

### Task 12: Undo edge cases and reset

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Ensure `prevResult` is cleared on full reset**

In `handleReset()`:

```typescript
function handleReset() {
  state.parsed           = null;
  state.issues           = [];
  state.result           = null;
  state.prevResult       = null;   // ← clear undo history
  state.activeColumn     = null;
  state.filterSlots      = [{ column: '', value: '', mode: 'include' }];
  state.findReplaceRules = [];
  state.findReplaceOpen  = false;
  state.sidebarOpen      = true;
  render();
}
```

In `handleRevert()`:

```typescript
function handleRevert() {
  state.result           = null;
  state.prevResult       = null;   // ← clear undo history
  state.activeColumn     = null;
  state.filterSlots      = [{ column: '', value: '', mode: 'include' }];
  state.findReplaceRules = [];
  state.findReplaceOpen  = false;
  render();
}
```

- [ ] **Step 2: Ensure `handleUndo` also resets `activeColumn` if needed**

```typescript
function handleUndo() {
  state.result = state.prevResult;
  state.prevResult = null;
  // If the undone result has different headers, reset active column
  const undoneHeaders = state.result?.cleanedHeaders ?? state.parsed?.headers ?? [];
  if (state.activeColumn && !undoneHeaders.includes(state.activeColumn)) {
    state.activeColumn = null;
  }
  showToast('Last fix reverted.', 'info');
  render();
}
```

- [ ] **Step 3: Run tests and build**

```
npm test && npm run build
```

Expected: all 116 tests pass; clean build.

- [ ] **Step 4: Final commit**

```bash
git add src/main.ts
git commit -m "feat: complete undo — clear prevResult on reset/revert, guard activeColumn"
```

---

## Done

All five groups are implemented. Run the full suite one final time:

```
npm test && npm run build
```

Expected output:
```
Tests  116 passed (116)
✓ built in ~700ms
```
