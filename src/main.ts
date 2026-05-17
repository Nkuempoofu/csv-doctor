/**
 * CSV Doctor — entry point.
 *
 * Upload → Diagnose → Clean → Filter → Analyse → Download
 * All in a single page, no navigation.
 */

import './styles.css';

import type { ParsedFile, Issue, IssueId, CleanResult, FilterSlot } from './types';
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
import { bytes } from './lib/format';

/* ───────────────────────────────────────────────────
   State
─────────────────────────────────────────────────── */

interface AppState {
  parsed: ParsedFile | null;
  issues: Issue[];
  result: CleanResult | null;
  prevResult: CleanResult | null;   // one-level undo
  toast: { message: string; tone: 'info' | 'error' | 'success' } | null;
  activeColumn: string | null;
  filterSlots: FilterSlot[];
  sidebarOpen: boolean;
}

const state: AppState = {
  parsed: null,
  issues: [],
  result: null,
  prevResult: null,
  toast: null,
  activeColumn: null,
  filterSlots: [{ column: '', value: '' }],
  sidebarOpen: true,
};

/* ───────────────────────────────────────────────────
   Utilities
─────────────────────────────────────────────────── */

function hasActiveFilters(): boolean {
  return state.filterSlots.some(s => {
    if (!s.column) return false;
    if (Array.isArray(s.value)) return s.value.length > 0;
    return s.value !== '';
  });
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
        onSlotModeToggle: handleSlotModeToggle,
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
    <div class="hero-eyebrow-row">
      <span class="hero-badge hero-badge--green">Free</span>
      <span class="hero-badge hero-badge--blue">Open source</span>
      <span class="hero-badge hero-badge--violet">100% private</span>
    </div>

    <h1 class="hero-title">
      Messy CSV?<br>
      <span class="hero-title-accent">Fixed in seconds.</span>
    </h1>

    <p class="hero-sub">
      Drop in any CSV file and CSV Doctor instantly diagnoses data quality problems,
      lets you pick the fixes you want, then exports a clean version,
      entirely in your browser. Nothing ever leaves your machine.
    </p>

    <div class="hero-features">
      <span class="hero-feat">Empty rows</span>
      <span class="hero-feat">Duplicate rows</span>
      <span class="hero-feat">Mixed date formats</span>
      <span class="hero-feat">Whitespace noise</span>
      <span class="hero-feat">Inconsistent casing</span>
      <span class="hero-feat">Encoding artifacts</span>
      <span class="hero-feat">Currency values</span>
      <span class="hero-feat">Sparse columns</span>
      <span class="hero-feat">Contact formats</span>
    </div>

    <div class="hero-workflow">
      <div class="hero-step">
        <div class="hero-step-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        </div>
        <span class="hero-step-label">Upload</span>
      </div>
      <span class="hero-step-sep">,</span>
      <div class="hero-step">
        <div class="hero-step-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </div>
        <span class="hero-step-label">Diagnose</span>
      </div>
      <span class="hero-step-sep">,</span>
      <div class="hero-step">
        <div class="hero-step-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <span class="hero-step-label">Clean</span>
      </div>
      <span class="hero-step-sep">,</span>
      <div class="hero-step">
        <div class="hero-step-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="20" y2="12"/><line x1="12" y1="18" x2="20" y2="18"/></svg>
        </div>
        <span class="hero-step-label">Filter</span>
      </div>
      <span class="hero-step-sep">,</span>
      <div class="hero-step">
        <div class="hero-step-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
        </div>
        <span class="hero-step-label">Analyse</span>
      </div>
      <span class="hero-step-sep">,</span>
      <div class="hero-step">
        <div class="hero-step-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </div>
        <span class="hero-step-label">Download</span>
      </div>
    </div>
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
    state.filterSlots = [{ column: '', value: '', mode: 'include' }];
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
  state.prevResult = state.result;   // save snapshot before overwriting
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

function handleRevert() {
  state.result = null;
  state.activeColumn = null;
  state.filterSlots = [{ column: '', value: '', mode: 'include' }];
  render();
}

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
  // Stub — wired up in Task 11
  showToast('Report coming soon.', 'info');
}

function handleReset() {
  state.parsed = null;
  state.issues = [];
  state.result = null;
  state.activeColumn = null;
  state.filterSlots = [{ column: '', value: '', mode: 'include' }];
  state.sidebarOpen = true;
  render();
}

function handleToggleSidebar() {
  state.sidebarOpen = !state.sidebarOpen;
  render();
}

function handleSlotChange(index: number, column: string, value: string | string[]) {
  state.filterSlots = state.filterSlots.map((s, i) =>
    i === index ? { ...s, column, value } : s
  );
  render();
}

function handleSlotModeToggle(index: number) {
  state.filterSlots = state.filterSlots.map((s, i) => {
    if (i !== index) return s;
    return { ...s, mode: (s.mode ?? 'include') === 'include' ? 'exclude' : 'include' };
  });
  render();
}

function handleAddSlot() {
  if (state.filterSlots.length >= 5) return;
  state.filterSlots = [...state.filterSlots, { column: '', value: '', mode: 'include' }];
  render();
}

function handleRemoveSlot(index: number) {
  if (state.filterSlots.length <= 1) return;
  state.filterSlots = state.filterSlots.filter((_, i) => i !== index);
  render();
}

function handleClearAllFilters() {
  state.filterSlots = [{ column: '', value: '', mode: 'include' }];
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
