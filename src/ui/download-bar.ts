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
