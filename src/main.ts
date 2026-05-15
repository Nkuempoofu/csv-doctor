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

const state: AppState = {
  parsed: null,
  issues: [],
  result: null,
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

function handleSlotChange(index: number, column: string, value: string | string[]) {
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
