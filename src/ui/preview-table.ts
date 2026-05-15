/**
 * Preview table — renders the current dataset with optional analysis overlay.
 *
 * Enhancements over the original:
 *   • displayHeaders  — shows cleaned headers when header-issues / sparse-columns ran
 *   • activeColumn    — highlights the selected column + shows aggregation footer
 *   • onColumnClick   — callback for column header clicks
 *   • columnFilters / onFilterChange / onClearFilters — passed through to toolbar
 *   • allRows         — unfiltered rows for computing dropdown options
 */

import type { ParsedFile, Row } from '../types';
import { escapeHtml, truncate } from '../lib/format';
import { renderAnalysisToolbar, type ToolbarCallbacks } from './analysis-toolbar';

const MAX_PREVIEW_ROWS = 150;

interface PreviewOptions {
  mode: 'original' | 'cleaned';
  changedCells?: Set<string>;
  removedRowIndices?: Set<number>;
  displayHeaders?: string[];
  activeColumn?: string | null;
  onColumnClick?: (header: string) => void;
  columnFilters?: Map<string, string>;
  allRows?: Row[];
  onFilterChange?: (column: string, value: string) => void;
  onClearFilters?: () => void;
}

/* ── Aggregation ── */

interface ColAggregates {
  sum: number | null;
  avg: number | null;
  count: number;
  min: string;
  max: string;
  isNumeric: boolean;
}

function computeAggregates(rows: Row[], colIndex: number): ColAggregates {
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

function buildTfoot(headers: string[], rows: Row[], activeColumn: string): string {
  const colIndex = headers.indexOf(activeColumn);
  if (colIndex === -1) return '';

  const agg = computeAggregates(rows, colIndex);

  const cells = headers.map((_, i) => {
    if (i !== colIndex) return `<td class="agg-cell"></td>`;
    return `
      <td class="agg-cell agg-cell--active">
        <div class="agg-stats">
          <span class="agg-stat"><span class="agg-label">Sum</span>${agg.isNumeric ? fmt(agg.sum!) : '—'}</span>
          <span class="agg-stat"><span class="agg-label">Avg</span>${agg.isNumeric ? fmt(agg.avg!) : '—'}</span>
          <span class="agg-stat"><span class="agg-label">Count</span>${agg.count.toLocaleString()}</span>
          <span class="agg-stat"><span class="agg-label">Min</span>${escapeHtml(agg.min)}</span>
          <span class="agg-stat"><span class="agg-label">Max</span>${escapeHtml(agg.max)}</span>
        </div>
      </td>`;
  }).join('');

  return `<tfoot class="preview-tfoot"><tr>${cells}</tr></tfoot>`;
}

/* ── Public ── */

export function renderPreviewTable(
  file: ParsedFile,
  rows: Row[],
  opts: PreviewOptions
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'preview';

  const headers = opts.displayHeaders ?? file.headers;
  const activeColumn = opts.activeColumn ?? null;
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

  // ── Analysis toolbar ──
  if (opts.onFilterChange) {
    const toolbar = renderAnalysisToolbar(
      headers,
      opts.allRows ?? rows,
      rows,
      opts.columnFilters ?? new Map(),
      {
        onFilterChange: opts.onFilterChange,
        onClearAll: opts.onClearFilters ?? (() => {}),
      } satisfies ToolbarCallbacks
    );
    wrap.appendChild(toolbar);
  }

  // ── Table ──
  const headerCells = headers.map((h) => {
    const isActive = activeColumn === h;
    return `<th class="${isActive ? 'th-active' : ''}" data-col="${escapeHtml(h)}">${escapeHtml(h || '(blank)')}</th>`;
  }).join('');

  // Empty-state row when filters produce zero results
  let bodyHtml: string;
  if (rows.length === 0) {
    bodyHtml = `<tr><td class="preview-empty-state" colspan="${headers.length}">No rows match the current filters.</td></tr>`;
  } else {
    bodyHtml = visibleRows.map((row, r) => {
      const cellsHtml = row.map((cell, c) => {
        const key = `${r}-${c}`;
        // Note: changedCells keys are relative to cleaned (post-filter) row positions.
        // When column filters are active, highlighting may appear on incorrect rows —
        // this is a known limitation; the remapping is handled in main.ts (Task 11).
        const changed = opts.changedCells?.has(key);
        const isActiveCol = activeColumn === headers[c];
        const classes = [changed ? 'cell-changed' : '', isActiveCol ? 'col-active' : ''].filter(Boolean).join(' ');
        return `<td class="${classes}" title="${escapeHtml(cell ?? '')}">${escapeHtml(truncate(cell ?? '', 80))}</td>`;
      }).join('');
      return `<tr>${cellsHtml}</tr>`;
    }).join('');
  }

  const tfootHtml = activeColumn ? buildTfoot(headers, rows, activeColumn) : '';

  const scrollDiv = document.createElement('div');
  scrollDiv.className = 'preview-scroll';
  scrollDiv.innerHTML = `
    <table class="preview-table">
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyHtml}</tbody>
      ${tfootHtml}
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

  // ── Wire column header clicks ──
  if (opts.onColumnClick) {
    setTimeout(() => {
      wrap.querySelectorAll<HTMLElement>('thead th[data-col]').forEach(th => {
        th.addEventListener('click', () => {
          const col = th.dataset.col;
          if (!col) return;
          opts.onColumnClick!(col);
        });
        th.style.cursor = 'pointer';
      });
    }, 0);
  }

  return wrap;
}
