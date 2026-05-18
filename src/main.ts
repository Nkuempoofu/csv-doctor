/**
 * CSV Doctor — entry point.
 *
 * Upload → Diagnose → Clean → Filter → Analyse → Download
 * All in a single page, no navigation.
 */

import './styles.css';

import type { ParsedFile, Issue, IssueId, CleanResult, FindReplaceRule, FileEntry } from './types';
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

/** Builds a stub FileEntry for a file that failed to parse. */
function makeErrorEntry(name: string, size: number, errMsg: string): FileEntry {
  return {
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
    const entry  = makeFileEntry(parsed, issues);
    state.files = [...state.files, entry];
    if (state.activeFileId === null) state.activeFileId = entry.id;
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
    const errMsg  = err instanceof Error ? err.message : 'Could not parse the file.';
    const errEntry = makeErrorEntry(name, size, errMsg);
    state.files        = [...state.files, errEntry];
    if (state.activeFileId === null) state.activeFileId = errEntry.id;
    showToast(errMsg, 'error');
    render();
  }
}

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

function showDownloadConfirm(format: string, rowCount: number, onConfirm: () => void) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-modal">
      <p class="confirm-title">Download as ${format}</p>
      <p class="confirm-body">
        Export ${rowCount.toLocaleString()} row${rowCount === 1 ? '' : 's'} as a ${format} file?
      </p>
      <div class="confirm-actions">
        <button class="btn btn-ghost" id="confirm-cancel" type="button">Cancel</button>
        <button class="btn btn-primary" id="confirm-ok" type="button">Download</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => document.body.removeChild(overlay);
  setTimeout(() => {
    document.getElementById('confirm-cancel')?.addEventListener('click', close);
    document.getElementById('confirm-ok')?.addEventListener('click', () => { close(); onConfirm(); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  }, 0);
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
