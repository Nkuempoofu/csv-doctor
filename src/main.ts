/**
 * CSV Doctor — entry point.
 *
 * Owns the application state and orchestrates the four UI sections:
 * upload zone → diagnosis (issues panel + stats) → preview table → export.
 *
 * State machine is intentionally simple:
 *   • idle      — no file loaded, show upload zone
 *   • analyzed  — file parsed and analyzed, showing issues + original preview
 *   • cleaned   — fixes applied, showing cleaned preview + export button
 */

import './styles.css';

import type { ParsedFile, Issue, IssueId, CleanResult, Row } from './types';
import { parseCsv } from './core/parser';
import { analyze } from './core/analyzer';
import { clean } from './core/cleaner';
import { exportCsv, suggestFilename } from './core/exporter';
import { createUploadZone } from './ui/upload';
import { createIssuesPanel } from './ui/issues-panel';
import { renderPreviewTable } from './ui/preview-table';
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
  columnFilters: Map<string, string>;
}

const state: AppState = {
  parsed: null,
  issues: [],
  result: null,
  toast: null,
  activeColumn: null,
  columnFilters: new Map(),
};

/* ───────────────────────────────────────────────────
   Utilities
─────────────────────────────────────────────────── */

function getFilteredRows(rows: Row[], headers: string[], filters: Map<string, string>): Row[] {
  if (filters.size === 0) return rows;
  return rows.filter(row =>
    Array.from(filters.entries()).every(([col, val]) => {
      if (!val) return true;
      const idx = headers.indexOf(col);
      if (idx === -1) return true;
      return (row[idx] ?? '').toLowerCase().includes(val.toLowerCase());
    })
  );
}

function hasActiveFilters(): boolean {
  return Array.from(state.columnFilters.values()).some(Boolean);
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
    const displayHeaders = state.result?.cleanedHeaders ?? state.parsed!.headers;
    const displayRows = state.result ? state.result.rows : state.parsed!.rows;
    const filteredRows = getFilteredRows(displayRows, displayHeaders, state.columnFilters);

    main.appendChild(renderFileBar(filteredRows));
    main.appendChild(renderStats(state.parsed, state.result));

    const grid = document.createElement('div');
    grid.className = 'workspace';

    grid.appendChild(createIssuesPanel(state.issues, {
      onToggle: handleToggleIssue,
      onApplyAll: handleApplyAll,
      onClean: handleClean,
    }));

    /* Build the diff highlight set if we have a clean result */
    const changedCells = new Set<string>();
    let removedRowSet: Set<number> | undefined;
    if (state.result) {
      // Map original row indices → new positions in cleaned rows. Since rows
      // can be removed, we need to translate "rowIndex in original" to "rowIndex
      // in cleaned" for highlighting purposes.
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
      state.parsed!,
      filteredRows,
      {
        mode: state.result ? 'cleaned' : 'original',
        changedCells,
        removedRowIndices: removedRowSet,
        displayHeaders,
        activeColumn: state.activeColumn,
        onColumnClick: handleColumnClick,
        columnFilters: state.columnFilters,
        allRows: displayRows,
        onFilterChange: handleFilterChange,
        onClearFilters: handleClearFilters,
      }
    ));

    main.appendChild(grid);
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

function renderFileBar(filteredRows: Row[]): HTMLElement {
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
      ${state.result ? (() => {
  const exportNote = hasActiveFilters()
    ? `Exporting ${filteredRows.length.toLocaleString()} rows (filtered)`
    : `Exporting ${filteredRows.length.toLocaleString()} rows`;
  const downloadDisabled = filteredRows.length === 0;
  return `
    <button class="btn btn-ghost" id="filebar-revert" type="button">Revert to original</button>
    <div class="filebar-export-wrap">
      <span class="filebar-export-note">${exportNote}</span>
      <button class="btn btn-primary" id="filebar-export" type="button"${downloadDisabled ? ' disabled' : ''}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Download cleaned CSV
      </button>
    </div>
  `;
})() : ''}
      <button class="btn btn-ghost" id="filebar-new" type="button">Upload another file</button>
    </div>
  `;
  setTimeout(() => {
    const exp = document.getElementById('filebar-export');
    if (exp) exp.addEventListener('click', handleExport);
    const rev = document.getElementById('filebar-revert');
    if (rev) rev.addEventListener('click', handleRevert);
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
    state.columnFilters = new Map();
    showToast(`Parsed ${parsed.rows.length.toLocaleString()} rows. ${issues.length === 0 ? 'No issues found!' : `${issues.length} issue${issues.length === 1 ? '' : 's'} detected.`}`, issues.length === 0 ? 'success' : 'info');
    render();
  } catch (err) {
    showToast(err instanceof Error ? err.message : 'Could not parse the file.', 'error');
  }
}

function handleToggleIssue(id: IssueId, enabled: boolean) {
  state.issues = state.issues.map((i) => (i.id === id ? { ...i, enabled } : i));
  // Re-running clean automatically would be nice, but it can be slow on big
  // files. Wait for explicit "Apply" click.
  state.result = null;
  render();
}

function handleApplyAll() {
  state.issues = state.issues.map((i) => ({ ...i, enabled: true }));
  render();
}

function handleClean() {
  if (!state.parsed) return;
  const enabled = new Set<IssueId>(state.issues.filter((i) => i.enabled).map((i) => i.id));
  if (enabled.size === 0) {
    showToast('Toggle at least one fix on first.', 'info');
    return;
  }
  state.result = clean(state.parsed, { enabled });
  showToast(`Cleaned ${state.result.changes.length} cell${state.result.changes.length === 1 ? '' : 's'} and removed ${state.result.removedRowIndices.length} row${state.result.removedRowIndices.length === 1 ? '' : 's'}.`, 'success');
  render();
}

function handleRevert() {
  state.result = null;
  state.activeColumn = null;
  state.columnFilters = new Map();
  render();
}

function handleExport() {
  if (!state.parsed || !state.result) return;
  const displayHeaders = state.result.cleanedHeaders ?? state.parsed.headers;
  const filteredRows = getFilteredRows(state.result.rows, displayHeaders, state.columnFilters);
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
  state.columnFilters = new Map();
  render();
}

function handleColumnClick(header: string) {
  state.activeColumn = state.activeColumn === header ? null : header;
  render();
}

function handleFilterChange(column: string, value: string) {
  if (value) {
    state.columnFilters.set(column, value);
  } else {
    state.columnFilters.delete(column);
  }
  render();
}

function handleClearFilters() {
  state.columnFilters = new Map();
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
