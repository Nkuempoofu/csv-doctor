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
