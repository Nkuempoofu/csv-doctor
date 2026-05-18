# Batch Processing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a file queue sidebar so users can load multiple CSV files and process them one at a time, with each file's full state (issues, cleaned result, filters, find-replace rules) preserved when switching between files.

**Architecture:** All per-file state moves from the flat `AppState` into a `FileEntry` object. `AppState` becomes a `files: FileEntry[]` array plus an `activeFileId` pointer. A new `renderFileQueue` sidebar component handles file selection and removal. The sidebar appears automatically when 2+ files are loaded — single-file use is unchanged.

**Tech Stack:** TypeScript 5, Vite 5, Vitest 4, vanilla DOM — no new dependencies.

---

## File structure

| File | Change |
|---|---|
| `src/types.ts` | Add `FileStatus` type and `FileEntry` interface |
| `src/ui/file-queue.ts` | **New** — purely presentational queue sidebar component |
| `src/ui/__tests__/file-queue.test.ts` | **New** — component tests |
| `src/styles.css` | Add queue sidebar styles and batch layout wrapper |
| `src/main.ts` | Restructure `AppState`; add helpers; update all handlers and `render()` |

Unchanged: `parser.ts`, `analyzer.ts`, `cleaner.ts`, `exporter.ts`, `report.ts`, `find-replace.ts`, `levenshtein.ts`.

---

## Task 1: Add FileStatus and FileEntry types

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add the new types after the existing `FilterSlot` interface**

Open `src/types.ts` and append these two exports at the end of the file (after the `FindReplaceRule` interface):

```typescript
/** Status of a file in the batch queue. */
export type FileStatus = 'pending' | 'cleaned' | 'downloaded' | 'error';

/**
 * One entry in the batch file queue — holds the complete state for a single
 * file so switching between files preserves all work.
 */
export interface FileEntry {
  id:               string;           // unique key: `${Date.now()}-${Math.random().toString(36).slice(2)}`
  parsed:           ParsedFile;       // always present (stub used for error entries)
  issues:           Issue[];
  result:           CleanResult | null;
  prevResult:       CleanResult | null;
  activeColumn:     string | null;
  filterSlots:      FilterSlot[];
  findReplaceRules: FindReplaceRule[];
  findReplaceOpen:  boolean;
  status:           FileStatus;
  errorMessage?:    string;           // only present when status === 'error'
}
```

- [ ] **Step 2: Verify TypeScript is happy**

Run:
```bash
npm run lint
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add FileStatus and FileEntry for batch queue"
```

---

## Task 2: Create the file queue sidebar component

**Files:**
- Create: `src/ui/file-queue.ts`
- Create: `src/ui/__tests__/file-queue.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/ui/__tests__/file-queue.test.ts`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderFileQueue } from '../file-queue';
import type { FileEntry } from '../../types';

function makeEntry(
  id: string,
  filename: string,
  status: FileEntry['status'] = 'pending',
): FileEntry {
  return {
    id,
    parsed: {
      filename,
      size: 1000,
      delimiter: ',',
      encoding: 'utf-8',
      headers: ['A'],
      rows:    [['1']],
      rawText: '',
    },
    issues:           [],
    result:           null,
    prevResult:       null,
    activeColumn:     null,
    filterSlots:      [{ column: '', value: '', mode: 'include' }],
    findReplaceRules: [],
    findReplaceOpen:  false,
    status,
  };
}

describe('renderFileQueue', () => {
  it('renders one list item per file', () => {
    const el = renderFileQueue({
      files:        [makeEntry('1', 'a.csv'), makeEntry('2', 'b.csv')],
      activeFileId: '1',
      onSelect:     vi.fn(),
      onRemove:     vi.fn(),
      onAddFiles:   vi.fn(),
    });
    expect(el.querySelectorAll('.fq-item').length).toBe(2);
  });

  it('marks only the active item with fq-item--active', () => {
    const el = renderFileQueue({
      files:        [makeEntry('1', 'a.csv'), makeEntry('2', 'b.csv')],
      activeFileId: '2',
      onSelect:     vi.fn(),
      onRemove:     vi.fn(),
      onAddFiles:   vi.fn(),
    });
    const items = Array.from(el.querySelectorAll('.fq-item'));
    expect(items[0].classList.contains('fq-item--active')).toBe(false);
    expect(items[1].classList.contains('fq-item--active')).toBe(true);
  });

  it('shows the correct status badge class for each status', () => {
    const statuses: FileEntry['status'][] = ['pending', 'cleaned', 'downloaded', 'error'];
    for (const status of statuses) {
      const el = renderFileQueue({
        files:        [makeEntry('1', 'a.csv', status)],
        activeFileId: '1',
        onSelect:     vi.fn(),
        onRemove:     vi.fn(),
        onAddFiles:   vi.fn(),
      });
      expect(el.querySelector(`.fq-status--${status}`)).not.toBeNull();
    }
  });

  it('displays the filename in the item', () => {
    const el = renderFileQueue({
      files:        [makeEntry('1', 'customers.csv')],
      activeFileId: '1',
      onSelect:     vi.fn(),
      onRemove:     vi.fn(),
      onAddFiles:   vi.fn(),
    });
    expect(el.querySelector('.fq-name')!.textContent).toContain('customers.csv');
  });

  it('calls onSelect with the file id when a non-active item is clicked', () => {
    const onSelect = vi.fn();
    const el = renderFileQueue({
      files:        [makeEntry('1', 'a.csv'), makeEntry('2', 'b.csv')],
      activeFileId: '1',
      onSelect,
      onRemove:     vi.fn(),
      onAddFiles:   vi.fn(),
    });
    (el.querySelectorAll('.fq-item')[1] as HTMLElement).click();
    expect(onSelect).toHaveBeenCalledWith('2');
  });

  it('calls onRemove with the file id when the × button is clicked', () => {
    const onRemove = vi.fn();
    const el = renderFileQueue({
      files:        [makeEntry('1', 'a.csv'), makeEntry('2', 'b.csv')],
      activeFileId: '1',
      onSelect:     vi.fn(),
      onRemove,
      onAddFiles:   vi.fn(),
    });
    (el.querySelectorAll('.fq-remove')[0] as HTMLButtonElement).click();
    expect(onRemove).toHaveBeenCalledWith('1');
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('does not call onSelect when the × button is clicked', () => {
    const onSelect = vi.fn();
    const el = renderFileQueue({
      files:        [makeEntry('1', 'a.csv')],
      activeFileId: '1',
      onSelect,
      onRemove:     vi.fn(),
      onAddFiles:   vi.fn(),
    });
    (el.querySelector('.fq-remove') as HTMLButtonElement).click();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders an "+ Add more files" button', () => {
    const el = renderFileQueue({
      files:        [makeEntry('1', 'a.csv')],
      activeFileId: '1',
      onSelect:     vi.fn(),
      onRemove:     vi.fn(),
      onAddFiles:   vi.fn(),
    });
    expect(el.querySelector('.fq-add-btn')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- --reporter=verbose 2>&1 | grep "file-queue"
```
Expected: FAIL — `Cannot find module '../file-queue'`

- [ ] **Step 3: Implement the component**

Create `src/ui/file-queue.ts`:

```typescript
/**
 * File queue sidebar — lists all loaded files in batch mode.
 * Purely presentational: no business logic, all events via callbacks.
 */

import type { FileEntry } from '../types';
import { escapeHtml } from '../lib/format';

const STATUS_LABELS: Record<FileEntry['status'], string> = {
  pending:    'Pending',
  cleaned:    'Cleaned',
  downloaded: 'Downloaded',
  error:      'Error',
};

export interface FileQueueProps {
  files:        FileEntry[];
  activeFileId: string | null;
  onSelect:     (id: string) => void;
  onRemove:     (id: string) => void;
  onAddFiles:   (files: FileList) => void;
}

export function renderFileQueue(props: FileQueueProps): HTMLElement {
  const { files, activeFileId, onSelect, onRemove, onAddFiles } = props;

  const aside = document.createElement('aside');
  aside.className = 'file-queue';

  // ── File list ──
  const list = document.createElement('ul');
  list.className = 'fq-list';

  for (const file of files) {
    const li = document.createElement('li');
    li.className = `fq-item${file.id === activeFileId ? ' fq-item--active' : ''}`;
    li.dataset.id = file.id;

    const name      = file.parsed.filename;
    const truncated = name.length > 22 ? name.slice(0, 19) + '…' : name;

    li.innerHTML = `
      <svg class="fq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <span class="fq-name" title="${escapeHtml(name)}">${escapeHtml(truncated)}</span>
      <span class="fq-status fq-status--${file.status}">${STATUS_LABELS[file.status]}</span>
      <button class="fq-remove" type="button"
              aria-label="Remove ${escapeHtml(name)}">×</button>
    `;

    // Click on the item (not the remove button) → select
    li.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.fq-remove')) return;
      onSelect(file.id);
    });

    // Remove button
    li.querySelector<HTMLButtonElement>('.fq-remove')!
      .addEventListener('click', (e) => {
        e.stopPropagation();
        onRemove(file.id);
      });

    list.appendChild(li);
  }

  // ── Hidden file input ──
  const input = document.createElement('input');
  input.type     = 'file';
  input.accept   = '.csv,.tsv,.txt,text/csv';
  input.multiple = true;
  input.hidden   = true;
  input.addEventListener('change', () => {
    if (input.files && input.files.length > 0) {
      onAddFiles(input.files);
      input.value = ''; // allow re-adding the same file
    }
  });

  // ── Add button ──
  const addBtn = document.createElement('button');
  addBtn.className   = 'fq-add-btn';
  addBtn.type        = 'button';
  addBtn.textContent = '+ Add more files';
  addBtn.addEventListener('click', () => input.click());

  aside.appendChild(list);
  aside.appendChild(addBtn);
  aside.appendChild(input);

  return aside;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A2 "file-queue"
```
Expected: 8 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/ui/file-queue.ts src/ui/__tests__/file-queue.test.ts
git commit -m "feat(ui): add file queue sidebar component with tests"
```

---

## Task 3: Add CSS for the file queue sidebar

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Add queue + batch layout styles**

Append the following CSS block at the end of `src/styles.css` (before the last closing brace if any, or just at the very end):

```css
/* ═══════════════════════════════════════════════════
   Batch mode — file queue sidebar
═══════════════════════════════════════════════════ */

.batch-layout {
  display: flex;
  align-items: flex-start;
  gap: 0;
}

.batch-content {
  flex: 1;
  min-width: 0;
}

/* ── Sidebar shell ──────────────────────────────── */
.file-queue {
  width: 220px;
  flex-shrink: 0;
  background: #f8fafc;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  padding: 0.75rem 0 0.75rem;
  min-height: 300px;
  position: sticky;
  top: 0;
  max-height: 100vh;
  overflow: hidden;
}

/* ── File list ──────────────────────────────────── */
.fq-list {
  list-style: none;
  margin: 0;
  padding: 0;
  flex: 1;
  overflow-y: auto;
}

.fq-item {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  transition: background 0.1s;
  border-left: 3px solid transparent;
  user-select: none;
}

.fq-item:hover { background: #f1f5f9; }

.fq-item--active {
  background: #f1f5f9;
  border-left-color: #6366f1;
}

.fq-icon {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  color: #94a3b8;
}

.fq-name {
  flex: 1;
  font-size: 0.775rem;
  color: #334155;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

/* ── Status badges ──────────────────────────────── */
.fq-status {
  font-size: 0.67rem;
  font-weight: 600;
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  white-space: nowrap;
  flex-shrink: 0;
}

.fq-status--pending    { background: #f1f5f9; color: #64748b; }
.fq-status--cleaned    { background: #dcfce7; color: #15803d; }
.fq-status--downloaded { background: #dbeafe; color: #1d4ed8; }
.fq-status--error      { background: #fee2e2; color: #dc2626; }

/* ── Remove button ──────────────────────────────── */
.fq-remove {
  background: none;
  border: none;
  cursor: pointer;
  color: #94a3b8;
  font-size: 1rem;
  line-height: 1;
  padding: 0.1rem 0.2rem;
  border-radius: 3px;
  flex-shrink: 0;
  transition: color 0.1s, background 0.1s;
}

.fq-remove:hover { color: #ef4444; background: #fee2e2; }

/* ── Add more files button ──────────────────────── */
.fq-add-btn {
  margin: 0.6rem 0.75rem 0;
  padding: 0.4rem 0.5rem;
  font-size: 0.775rem;
  color: #6366f1;
  background: none;
  border: 1px dashed #c7d2fe;
  border-radius: 6px;
  cursor: pointer;
  width: calc(100% - 1.5rem);
  text-align: center;
  transition: background 0.1s, border-color 0.1s;
}

.fq-add-btn:hover { background: #eef2ff; border-color: #6366f1; }

/* ── Error state in main content ───────────────── */
.batch-error {
  padding: 2rem 1.5rem;
}

.batch-error-inner {
  background: #fff5f5;
  border: 1px solid #fecaca;
  border-radius: 10px;
  padding: 1.5rem;
  max-width: 480px;
}

.batch-error-title {
  font-weight: 600;
  color: #dc2626;
  margin-bottom: 0.5rem;
}

.batch-error-msg {
  font-size: 0.875rem;
  color: #7f1d1d;
}

/* ── Mobile: queue becomes a horizontal chip bar ── */
@media (max-width: 640px) {
  .batch-layout   { flex-direction: column; }

  .file-queue {
    width: 100%;
    min-height: auto;
    border-right: none;
    border-bottom: 1px solid #e2e8f0;
    padding: 0.5rem;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 0.4rem;
    position: static;
    max-height: none;
  }

  .fq-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    overflow-y: visible;
    flex: none;
  }

  .fq-item {
    padding: 0.3rem 0.5rem;
    border-left: none;
    border-radius: 6px;
    background: #f1f5f9;
    border-bottom: 2px solid transparent;
  }

  .fq-item--active { border-bottom-color: #6366f1; }

  .fq-add-btn { margin: 0; width: auto; }
}
```

- [ ] **Step 2: Start the dev server and verify styles render**

```bash
npm run dev
```
Load `http://localhost:5174`. The existing UI should look unchanged (no regression). We cannot test the queue visually yet — that happens in Task 4.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "feat(styles): add file queue sidebar and batch layout CSS"
```

---

## Task 4: Restructure AppState and wire everything in main.ts

**Files:**
- Modify: `src/main.ts`

This task rewrites the state management in `main.ts`. The core algorithms (parser, analyzer, cleaner, exporter) are untouched. The change is: every handler that read `state.parsed` / `state.result` / etc. now reads from `activeFile()`, and writes go through `updateActiveFile()`.

- [ ] **Step 1: Update imports at the top of main.ts**

Replace the existing import block (lines 1–33) with:

```typescript
/**
 * CSV Doctor — entry point.
 *
 * Upload → Diagnose → Clean → Filter → Analyse → Download
 * All in a single page, no navigation.
 */

import './styles.css';

import type { ParsedFile, Issue, IssueId, CleanResult, FilterSlot, FindReplaceRule, FileEntry } from './types';
import { parseCsv } from './core/parser';
import { analyze } from './core/analyzer';
import { clean } from './core/cleaner';
import {
  exportCsv, suggestFilename,
  exportJson, suggestJsonFilename,
  exportXlsx, suggestXlsxFilename,
} from './core/exporter';
import type { DownloadBarOptions } from './ui/download-bar';
import { getFilteredRows } from './lib/filter';
import { createUploadZone } from './ui/upload';
import { createIssuesPanel } from './ui/issues-panel';
import { renderPreviewTable } from './ui/preview-table';
import { renderFilterSlots } from './ui/filter-slots';
import { renderAnalysisPanel } from './ui/analysis-panel';
import { renderDownloadBar } from './ui/download-bar';
import { renderStats } from './ui/stats';
import { bytes, escapeHtml } from './lib/format';
import { applyFindReplace } from './lib/find-replace';
import { generateReport, downloadReport, suggestReportFilename } from './core/report';
import { renderFindReplacePanel } from './ui/find-replace-panel';
import type { FindReplacePanelCallbacks } from './ui/find-replace-panel';
import { renderFileQueue } from './ui/file-queue';
```

- [ ] **Step 2: Replace the AppState interface, state object, and add helpers**

Replace the entire `/* State */` section (lines 34–62 in the original) with:

```typescript
/* ───────────────────────────────────────────────────
   State
─────────────────────────────────────────────────── */

interface AppState {
  files:        FileEntry[];
  activeFileId: string | null;
  toast:        { message: string; tone: 'info' | 'error' | 'success' } | null;
  sidebarOpen:  boolean;
}

const state: AppState = {
  files:        [],
  activeFileId: null,
  toast:        null,
  sidebarOpen:  true,
};

/* ── State helpers ────────────────────────────────── */

/** Returns the currently-active FileEntry, or null when no file is loaded. */
function activeFile(): FileEntry | null {
  return state.files.find(f => f.id === state.activeFileId) ?? null;
}

/** Merges `updates` into the active FileEntry (immutably). No-op when no active file. */
function updateActiveFile(updates: Partial<Omit<FileEntry, 'id'>>): void {
  state.files = state.files.map(f =>
    f.id === state.activeFileId ? { ...f, ...updates } : f
  );
}

/** Builds a fresh FileEntry from a successfully-parsed file. */
function makeFileEntry(parsed: ParsedFile, issues: Issue[]): FileEntry {
  return {
    id:               `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    parsed,
    issues,
    result:           null,
    prevResult:       null,
    activeColumn:     null,
    filterSlots:      [{ column: '', value: '', mode: 'include' }],
    findReplaceRules: [],
    findReplaceOpen:  false,
    status:           'pending',
  };
}

/** Returns true if the active file has any non-empty filter slots. */
function hasActiveFilters(): boolean {
  const file = activeFile();
  if (!file) return false;
  return file.filterSlots.some(s => {
    if (!s.column) return false;
    if (Array.isArray(s.value)) return s.value.length > 0;
    return s.value !== '';
  });
}
```

- [ ] **Step 3: Replace handleFile with queue-aware version**

Find and replace the existing `handleFile` function with:

```typescript
function handleFile(text: string, name: string, size: number) {
  try {
    const parsed = parseCsv(text, { filename: name, size });
    const issues = analyze(parsed);
    const entry  = makeFileEntry(parsed, issues);
    state.files        = [...state.files, entry];
    state.activeFileId = entry.id;
    state.sidebarOpen  = true;
    showToast(
      `Parsed ${parsed.rows.length.toLocaleString()} rows. ${
        issues.length === 0
          ? 'No issues found!'
          : `${issues.length} issue${issues.length === 1 ? '' : 's'} detected.`
      }`,
      issues.length === 0 ? 'success' : 'info'
    );
    render();
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Could not parse the file.';
    if (state.files.length > 0) {
      // Add an error entry to the queue so the user can see which file failed
      const errEntry: FileEntry = {
        id:               `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        parsed:           { filename: name, size, delimiter: ',', encoding: 'utf-8', headers: [], rows: [], rawText: '' },
        issues:           [],
        result:           null,
        prevResult:       null,
        activeColumn:     null,
        filterSlots:      [{ column: '', value: '', mode: 'include' }],
        findReplaceRules: [],
        findReplaceOpen:  false,
        status:           'error',
        errorMessage:     errMsg,
      };
      state.files        = [...state.files, errEntry];
      state.activeFileId = errEntry.id;
      render();
    }
    showToast(errMsg, 'error');
  }
}
```

- [ ] **Step 4: Add three new handlers (select, remove, add-multiple)**

Add these functions after `handleFile`:

```typescript
function handleSelectFile(id: string) {
  state.activeFileId = id;
  render();
}

function handleRemoveFile(id: string) {
  const idx      = state.files.findIndex(f => f.id === id);
  if (idx === -1) return;
  const newFiles = state.files.filter(f => f.id !== id);

  if (newFiles.length === 0) {
    // Removed the last file — go back to the upload screen
    state.files        = [];
    state.activeFileId = null;
  } else if (id === state.activeFileId) {
    // Removed the active file — activate nearest neighbour
    const newActive    = newFiles[Math.min(idx, newFiles.length - 1)];
    state.files        = newFiles;
    state.activeFileId = newActive.id;
  } else {
    state.files = newFiles;
    // activeFileId is unaffected
  }
  render();
}

function handleAddFiles(fileList: FileList) {
  for (const file of Array.from(fileList)) {
    const ok = /\.(csv|tsv|txt)$/i.test(file.name) || file.type === 'text/csv';
    if (!ok) {
      showToast(`"${file.name}" doesn't look like a CSV / TSV file.`, 'error');
      continue;
    }
    if (file.size > 50 * 1024 * 1024) {
      showToast(`"${file.name}" is too large (max 50 MB).`, 'error');
      continue;
    }
    const reader   = new FileReader();
    reader.onload  = () => handleFile(reader.result as string, file.name, file.size);
    reader.onerror = () => showToast(`Could not read "${file.name}".`, 'error');
    reader.readAsText(file, 'utf-8');
  }
}
```

- [ ] **Step 5: Update per-file handlers to read/write via activeFile()**

Replace the following handlers with their updated versions (each now reads from `activeFile()` and writes via `updateActiveFile()`):

```typescript
function handleToggleIssue(id: IssueId, enabled: boolean) {
  const file = activeFile();
  if (!file) return;
  updateActiveFile({
    issues: file.issues.map(i => (i.id === id ? { ...i, enabled } : i)),
    result: null,
  });
  render();
}

function handleApplyAll() {
  const file = activeFile();
  if (!file) return;
  updateActiveFile({ issues: file.issues.map(i => ({ ...i, enabled: true })) });
  render();
}

function handleClean() {
  const file = activeFile();
  if (!file) return;
  const enabled = new Set<IssueId>(file.issues.filter(i => i.enabled).map(i => i.id));
  if (enabled.size === 0) {
    showToast('Toggle at least one fix on first.', 'info');
    return;
  }
  const newResult      = clean(file.parsed, { enabled });
  const newHeaders     = newResult.cleanedHeaders;
  const newActiveCol   = file.activeColumn && newHeaders && !newHeaders.includes(file.activeColumn)
    ? null
    : file.activeColumn;
  updateActiveFile({
    prevResult:   file.result,
    result:       newResult,
    activeColumn: newActiveCol,
    status:       'cleaned',
  });
  showToast(
    `Cleaned ${newResult.changes.length} cell${newResult.changes.length === 1 ? '' : 's'} and removed ${newResult.removedRowIndices.length} row${newResult.removedRowIndices.length === 1 ? '' : 's'}.`,
    'success'
  );
  render();
}

function handleRevert() {
  updateActiveFile({
    result:           null,
    prevResult:       null,
    activeColumn:     null,
    filterSlots:      [{ column: '', value: '', mode: 'include' }],
    findReplaceRules: [],
    findReplaceOpen:  false,
    status:           'pending',
  });
  render();
}

function handleUndo() {
  const file = activeFile();
  if (!file) return;
  const undoneHeaders = file.prevResult?.cleanedHeaders ?? file.parsed.headers;
  updateActiveFile({
    result:       file.prevResult,
    prevResult:   null,
    activeColumn: file.activeColumn && !undoneHeaders.includes(file.activeColumn)
      ? null
      : file.activeColumn,
  });
  showToast('Last fix reverted.', 'info');
  render();
}

function handleFRToggle() {
  const file = activeFile();
  if (!file) return;
  updateActiveFile({ findReplaceOpen: !file.findReplaceOpen });
  render();
}

function handleFRAddRule(rule: Omit<FindReplaceRule, 'id'>) {
  const file = activeFile();
  if (!file) return;
  updateActiveFile({
    findReplaceRules: [...file.findReplaceRules, { ...rule, id: String(Date.now()) }],
  });
  render();
}

function handleFRRemoveRule(id: string) {
  const file = activeFile();
  if (!file) return;
  updateActiveFile({
    findReplaceRules: file.findReplaceRules.filter(r => r.id !== id),
  });
  render();
}

function handleFRApply() {
  const file = activeFile();
  if (!file) return;
  if (file.findReplaceRules.length === 0) {
    showToast('Add at least one rule first.', 'info');
    return;
  }
  const sourceRows    = file.result?.rows    ?? file.parsed.rows;
  const sourceHeaders = file.result?.cleanedHeaders ?? file.parsed.headers;
  const { rows: newRows, changes } = applyFindReplace(sourceRows, sourceHeaders, file.findReplaceRules);

  if (changes.length === 0) {
    showToast('No matches found.', 'info');
    return;
  }

  const newResult: CleanResult = file.result
    ? {
        ...file.result,
        rows:         newRows,
        changes:      [...file.result.changes, ...changes],
        appliedFixes: [...new Set([...file.result.appliedFixes, 'find-replace' as IssueId])],
      }
    : {
        rows:              newRows,
        removedRowIndices: [],
        changes,
        appliedFixes:      ['find-replace'],
        cleanedHeaders:    undefined,
      };

  updateActiveFile({ prevResult: file.result, result: newResult });
  showToast(`Applied ${changes.length} replacement${changes.length === 1 ? '' : 's'}.`, 'success');
  render();
}

function handleReset() {
  // Clear the entire queue and return to the upload screen
  state.files        = [];
  state.activeFileId = null;
  state.sidebarOpen  = true;
  render();
}

function handleToggleSidebar() {
  state.sidebarOpen = !state.sidebarOpen;
  render();
}

function handleSlotChange(index: number, column: string, value: string | string[]) {
  const file = activeFile();
  if (!file) return;
  updateActiveFile({
    filterSlots: file.filterSlots.map((s, i) => i === index ? { ...s, column, value } : s),
  });
  render();
}

function handleSlotModeToggle(index: number) {
  const file = activeFile();
  if (!file) return;
  updateActiveFile({
    filterSlots: file.filterSlots.map((s, i) => {
      if (i !== index) return s;
      return { ...s, mode: (s.mode ?? 'include') === 'include' ? 'exclude' : 'include' };
    }),
  });
  render();
}

function handleAddSlot() {
  const file = activeFile();
  if (!file || file.filterSlots.length >= 5) return;
  updateActiveFile({
    filterSlots: [...file.filterSlots, { column: '', value: '', mode: 'include' }],
  });
  render();
}

function handleRemoveSlot(index: number) {
  const file = activeFile();
  if (!file || file.filterSlots.length <= 1) return;
  updateActiveFile({
    filterSlots: file.filterSlots.filter((_, i) => i !== index),
  });
  render();
}

function handleClearAllFilters() {
  updateActiveFile({ filterSlots: [{ column: '', value: '', mode: 'include' }] });
  render();
}

function handleColumnSelect(col: string | null) {
  updateActiveFile({ activeColumn: col });
  render();
}
```

- [ ] **Step 6: Update download handlers to mark status as 'downloaded'**

Replace the four download handlers with:

```typescript
function handleExportCsv() {
  const file = activeFile();
  if (!file?.result) return;
  const displayHeaders = file.result.cleanedHeaders ?? file.parsed.headers;
  const filteredRows   = getFilteredRows(file.result.rows, displayHeaders, file.filterSlots);
  if (filteredRows.length === 0) return;
  showDownloadConfirm('CSV', filteredRows.length, () => {
    const filename = suggestFilename(file.parsed.filename);
    exportCsv(file.parsed, filteredRows, filename, file.parsed.delimiter, displayHeaders);
    updateActiveFile({ status: 'downloaded' });
    showToast(hasActiveFilters()
      ? `Downloaded ${filteredRows.length.toLocaleString()} filtered rows as ${filename}`
      : `Downloaded ${filename}`, 'success');
  });
}

function handleExportJson() {
  const file = activeFile();
  if (!file?.result) return;
  const displayHeaders = file.result.cleanedHeaders ?? file.parsed.headers;
  const filteredRows   = getFilteredRows(file.result.rows, displayHeaders, file.filterSlots);
  if (filteredRows.length === 0) return;
  showDownloadConfirm('JSON', filteredRows.length, () => {
    const filename = suggestJsonFilename(file.parsed.filename);
    exportJson(file.parsed, filteredRows, filename, displayHeaders);
    updateActiveFile({ status: 'downloaded' });
    showToast(`Downloaded ${filename}`, 'success');
  });
}

function handleExportXlsx() {
  const file = activeFile();
  if (!file?.result) return;
  const displayHeaders = file.result.cleanedHeaders ?? file.parsed.headers;
  const filteredRows   = getFilteredRows(file.result.rows, displayHeaders, file.filterSlots);
  if (filteredRows.length === 0) return;
  showDownloadConfirm('XLSX', filteredRows.length, () => {
    const filename = suggestXlsxFilename(file.parsed.filename);
    exportXlsx(file.parsed, filteredRows, filename, displayHeaders);
    updateActiveFile({ status: 'downloaded' });
    showToast(`Downloaded ${filename}`, 'success');
  });
}

function handleDownloadReport() {
  const file = activeFile();
  if (!file?.result) return;
  const displayHeaders = file.result.cleanedHeaders ?? file.parsed.headers;
  const filteredRows   = getFilteredRows(file.result.rows, displayHeaders, file.filterSlots);
  showDownloadConfirm('HTML Report', filteredRows.length, () => {
    const html     = generateReport(file.parsed, file.result!, displayHeaders, filteredRows.length);
    const filename = suggestReportFilename(file.parsed.filename);
    downloadReport(html, filename);
    updateActiveFile({ status: 'downloaded' });
    showToast(`Downloaded ${filename}`, 'success');
  });
}
```

- [ ] **Step 7: Replace render() and renderFileBar()**

Replace the entire `render()` function with:

```typescript
function render() {
  const app = document.getElementById('app')!;
  app.innerHTML = '';

  app.appendChild(renderHeader());
  app.appendChild(renderToast());

  const main = document.createElement('main');
  main.className = 'main';

  const file = activeFile();

  if (!file) {
    // ── Upload screen ──────────────────────────────
    main.appendChild(renderHero());
    main.appendChild(createUploadZone({
      onFile:  handleFile,
      onError: (msg) => showToast(msg, 'error'),
    }));
  } else {
    // ── File loaded ────────────────────────────────
    main.appendChild(renderFileBar());

    const hasBatch = state.files.length >= 2;

    // In batch mode, wrap content in a flex row: sidebar + content column
    const contentHost = hasBatch
      ? (() => {
          const wrapper = document.createElement('div');
          wrapper.className = 'batch-layout';
          wrapper.appendChild(renderFileQueue({
            files:        state.files,
            activeFileId: state.activeFileId,
            onSelect:     handleSelectFile,
            onRemove:     handleRemoveFile,
            onAddFiles:   handleAddFiles,
          }));
          const col = document.createElement('div');
          col.className = 'batch-content';
          wrapper.appendChild(col);
          main.appendChild(wrapper);
          return col;
        })()
      : main;

    if (file.status === 'error') {
      // ── Parse-error state ──────────────────────
      const errDiv = document.createElement('div');
      errDiv.className = 'batch-error';
      errDiv.innerHTML = `
        <div class="batch-error-inner">
          <p class="batch-error-title">⚠ Could not parse this file</p>
          <p class="batch-error-msg">${escapeHtml(file.errorMessage ?? 'Unknown error.')}</p>
        </div>
      `;
      contentHost.appendChild(errDiv);
    } else {
      // ── Normal working state ────────────────────
      const displayHeaders = file.result?.cleanedHeaders ?? file.parsed.headers;
      const displayRows    = file.result ? file.result.rows : file.parsed.rows;
      const filteredRows   = getFilteredRows(displayRows, displayHeaders, file.filterSlots);

      contentHost.appendChild(renderStats(file.parsed, file.result));

      // Workspace: diagnosis sidebar + preview table
      const grid = document.createElement('div');
      grid.className = `workspace${state.sidebarOpen ? '' : ' sidebar-collapsed'}`;

      const sidebarWrap = document.createElement('div');
      sidebarWrap.className = `issues-sidebar${state.sidebarOpen ? '' : ' collapsed'}`;

      if (state.sidebarOpen) {
        sidebarWrap.appendChild(createIssuesPanel(file.issues, {
          onToggle:   handleToggleIssue,
          onApplyAll: handleApplyAll,
          onClean:    handleClean,
          onHide:     handleToggleSidebar,
        }));
      } else {
        const strip = document.createElement('button');
        strip.className = 'sidebar-strip';
        strip.id        = 'sidebar-expand';
        strip.type      = 'button';
        strip.setAttribute('aria-label', 'Show diagnosis sidebar');
        strip.innerHTML = `<span class="sidebar-strip-label">▶ Diagnosis (${file.issues.length})</span>`;
        sidebarWrap.appendChild(strip);
        setTimeout(() => {
          document.getElementById('sidebar-expand')
            ?.addEventListener('click', handleToggleSidebar);
        }, 0);
      }
      grid.appendChild(sidebarWrap);

      // Build diff highlight set
      const changedCells   = new Set<string>();
      let removedRowSet: Set<number> | undefined;
      if (file.result) {
        const originalToCleaned = new Map<number, number>();
        let cleanedIdx = 0;
        removedRowSet  = new Set(file.result.removedRowIndices);
        for (let i = 0; i < file.parsed.rows.length; i++) {
          if (!removedRowSet.has(i)) {
            originalToCleaned.set(i, cleanedIdx++);
          }
        }
        for (const ch of file.result.changes) {
          const newIdx = originalToCleaned.get(ch.rowIndex);
          if (newIdx !== undefined) changedCells.add(`${newIdx}-${ch.colIndex}`);
        }
      }

      grid.appendChild(renderPreviewTable(
        file.parsed,
        filteredRows,
        {
          mode:               file.result ? 'cleaned' : 'original',
          changedCells,
          removedRowIndices:  removedRowSet,
          displayHeaders,
        }
      ));

      contentHost.appendChild(grid);

      contentHost.appendChild(renderFilterSlots(
        displayHeaders,
        displayRows,
        file.filterSlots,
        filteredRows.length,
        {
          onSlotChange:      handleSlotChange,
          onSlotModeToggle:  handleSlotModeToggle,
          onAddSlot:         handleAddSlot,
          onRemoveSlot:      handleRemoveSlot,
          onClearAll:        handleClearAllFilters,
        }
      ));

      const frCallbacks: FindReplacePanelCallbacks = {
        onAddRule:    handleFRAddRule,
        onRemoveRule: handleFRRemoveRule,
        onApply:      handleFRApply,
      };
      contentHost.appendChild(renderFindReplacePanel(
        displayHeaders,
        file.findReplaceRules,
        file.findReplaceOpen,
        handleFRToggle,
        frCallbacks,
      ));

      contentHost.appendChild(renderAnalysisPanel(
        displayHeaders,
        filteredRows,
        file.activeColumn,
        handleColumnSelect,
      ));

      const dlOpts: DownloadBarOptions = {
        filteredCount:    filteredRows.length,
        hasResult:        file.result !== null,
        hasFilters:       hasActiveFilters(),
        hasPrevResult:    file.prevResult !== null,
        onDownloadCsv:    handleExportCsv,
        onDownloadJson:   handleExportJson,
        onDownloadXlsx:   handleExportXlsx,
        onDownloadReport: handleDownloadReport,
        onRevert:         handleRevert,
        onUndo:           handleUndo,
      };
      contentHost.appendChild(renderDownloadBar(dlOpts));
    }
  }

  app.appendChild(main);
  app.appendChild(renderFooter());
}
```

Replace the existing `renderFileBar()` function with:

```typescript
function renderFileBar(): HTMLElement {
  const file = activeFile()!;
  const f    = document.createElement('div');
  f.className = 'filebar';
  f.innerHTML = `
    <div class="filebar-info">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
           stroke-linecap="round" stroke-linejoin="round" class="filebar-icon">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <div>
        <div class="filebar-name">${escapeHtml(file.parsed.filename)}</div>
        ${file.status !== 'error'
          ? `<div class="filebar-meta">${bytes(file.parsed.size)} · ${file.parsed.rows.length.toLocaleString()} rows · ${file.parsed.headers.length} columns</div>`
          : ''}
      </div>
    </div>
    <div class="filebar-actions">
      <button class="btn btn-ghost" id="filebar-add" type="button">Add another file</button>
      <button class="btn btn-ghost" id="filebar-reset" type="button">Start over</button>
    </div>
  `;

  // Hidden input for "Add another file"
  const input = document.createElement('input');
  input.type   = 'file';
  input.accept = '.csv,.tsv,.txt,text/csv';
  input.hidden = true;
  input.addEventListener('change', () => {
    const picked = input.files?.[0];
    if (picked) {
      const reader   = new FileReader();
      reader.onload  = () => handleFile(reader.result as string, picked.name, picked.size);
      reader.onerror = () => showToast('Could not read the file.', 'error');
      reader.readAsText(picked, 'utf-8');
    }
    input.value = '';
  });
  f.appendChild(input);

  setTimeout(() => {
    document.getElementById('filebar-add')!
      .addEventListener('click', () => input.click());
    document.getElementById('filebar-reset')!
      .addEventListener('click', handleReset);
  }, 0);

  return f;
}
```

- [ ] **Step 8: Run the full test suite**

```bash
npm test -- --reporter=verbose
```
Expected: all tests pass (132 existing + 8 file-queue = 140 total).

- [ ] **Step 9: Verify in the browser**

```bash
npm run dev
```

Check these scenarios manually:

1. **Single file** — upload one file, everything works exactly as before. No sidebar visible.
2. **Add second file** — click "Add another file" in the file bar. Queue sidebar appears. Both files shown.
3. **Switch files** — click between files in sidebar. Active file highlighted, content switches, state preserved.
4. **Remove a file** — click × next to a file. If it was active, app switches to nearest neighbour. If last file removed, upload screen returns.
5. **Status badges** — clean a file → badge becomes "Cleaned". Download → badge becomes "Downloaded". Revert → badge returns to "Pending".
6. **Error file** — add a non-CSV file (e.g. a `.png`). Error entry appears in sidebar with red badge. Clicking it shows the error message.
7. **Mobile** — resize to 375px. Queue becomes a horizontal chip bar above the content.

- [ ] **Step 10: Commit**

```bash
git add src/main.ts
git commit -m "feat: batch file queue — multi-file state management and queue sidebar"
```

---

## Self-review checklist

**Spec coverage:**
- ✅ Auto-appearing sidebar when 2+ files loaded
- ✅ Single-file mode unchanged
- ✅ State fully preserved per file (FileEntry holds all per-file state)
- ✅ Switching files updates activeFileId — no state loss
- ✅ Remove active file → nearest neighbour becomes active
- ✅ Remove last file → upload screen
- ✅ Status transitions: pending → cleaned → downloaded, revert → pending
- ✅ Parse errors → error entry in queue, error UI in content area
- ✅ "+ Add more files" in sidebar and "Add another file" in filebar

**Placeholder scan:** None found.

**Type consistency:**
- `FileEntry` defined in Task 1, used consistently throughout Tasks 2 and 4
- `FileQueueProps.onAddFiles: (files: FileList) => void` matches `handleAddFiles(fileList: FileList)` in Task 4
- `updateActiveFile(updates: Partial<Omit<FileEntry, 'id'>>)` — all call sites pass valid `FileEntry` fields only
