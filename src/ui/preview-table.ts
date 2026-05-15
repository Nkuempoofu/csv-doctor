/**
 * Preview table — renders the first N rows of the current dataset.
 *
 * Two modes:
 *   • "original" — shows the raw parsed file
 *   • "cleaned"  — shows the post-clean rows, with edited cells highlighted
 *
 * For files with thousands of rows we only paint the first ~150 to keep
 * the DOM light. A footer note tells the user how many rows are hidden.
 */

import type { ParsedFile, Row } from '../types';
import { escapeHtml, truncate } from '../lib/format';

const MAX_PREVIEW_ROWS = 150;

interface PreviewOptions {
  mode: 'original' | 'cleaned';
  changedCells?: Set<string>; // "row-col" keys for highlighting
  removedRowIndices?: Set<number>;
  displayHeaders?: string[];   // NEW: overrides file.headers when set
}

export function renderPreviewTable(
  file: ParsedFile,
  rows: Row[],
  opts: PreviewOptions
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'preview';

  const visibleRows = rows.slice(0, MAX_PREVIEW_ROWS);
  const hidden = rows.length - visibleRows.length;

  const headers = opts.displayHeaders ?? file.headers;
  const headerCells = headers.map((h) =>
    `<th>${escapeHtml(h || '(blank)')}</th>`
  ).join('');

  const bodyHtml = visibleRows.map((row, r) => {
    const originalIdx = opts.mode === 'original' ? r : r; // not yet remapped
    const cellsHtml = row.map((cell, c) => {
      const key = `${originalIdx}-${c}`;
      const changed = opts.changedCells?.has(key);
      return `<td class="${changed ? 'cell-changed' : ''}" title="${escapeHtml(cell ?? '')}">${escapeHtml(truncate(cell ?? '', 80))}</td>`;
    }).join('');
    return `<tr>${cellsHtml}</tr>`;
  }).join('');

  wrap.innerHTML = `
    <div class="preview-meta">
      <span class="preview-mode">${opts.mode === 'cleaned' ? 'After cleaning' : 'Original data'}</span>
      <span class="preview-count">${rows.length.toLocaleString()} row${rows.length === 1 ? '' : 's'} · ${headers.length} column${headers.length === 1 ? '' : 's'}${hidden > 0 ? ` · showing first ${visibleRows.length}` : ''}</span>
    </div>
    <div class="preview-scroll">
      <table class="preview-table">
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${bodyHtml}</tbody>
      </table>
    </div>
    ${hidden > 0
      ? `<div class="preview-foot">${hidden.toLocaleString()} more row${hidden === 1 ? '' : 's'} not shown, they'll all be processed when you export.</div>`
      : ''}
  `;

  return wrap;
}
