// src/ui/analysis-toolbar.ts
/**
 * Analysis toolbar — per-column filter controls rendered above the preview table.
 *
 * Columns with ≤ 15 unique values get a <select> dropdown; others get a
 * debounced text <input>. An active filter shows a "Showing X of Y rows" pill
 * and a "Clear filters" link.
 */

import type { Row } from '../types';
import { escapeHtml } from '../lib/format';

export interface ToolbarCallbacks {
  onFilterChange: (column: string, value: string) => void;
  onClearAll: () => void;
}

const MAX_SELECT_OPTIONS = 15;
const DEBOUNCE_MS = 250;

export function renderAnalysisToolbar(
  headers: string[],
  allRows: Row[],        // used to compute dropdown options
  filteredRows: Row[],   // used for "Showing X of Y" count
  columnFilters: Map<string, string>,
  cb: ToolbarCallbacks
): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'analysis-bar';

  const hasFilters = Array.from(columnFilters.values()).some(Boolean);
  const totalRows = allRows.length;
  const filteredCount = filteredRows.length;

  const controls = headers.map((header, colIdx) => {
    const filterValue = columnFilters.get(header) ?? '';
    const isActive = Boolean(filterValue);

    const uniqueValues = [
      ...new Set(allRows.map(r => (r[colIdx] ?? '').trim()).filter(Boolean)),
    ].sort();

    let inputHtml: string;
    if (uniqueValues.length <= MAX_SELECT_OPTIONS) {
      const opts = [
        `<option value="">All</option>`,
        ...uniqueValues.map(v =>
          `<option value="${escapeHtml(v)}"${filterValue === v ? ' selected' : ''}>${escapeHtml(v)}</option>`
        ),
      ].join('');
      inputHtml = `<select class="ab-select" data-col="${escapeHtml(header)}">${opts}</select>`;
    } else {
      inputHtml = `<input type="text" class="ab-input" data-col="${escapeHtml(header)}" value="${escapeHtml(filterValue)}" placeholder="Filter…" />`;
    }

    return `
      <div class="ab-control${isActive ? ' ab-control--active' : ''}">
        <label class="ab-label" title="${escapeHtml(header)}">${escapeHtml(header)}</label>
        ${inputHtml}
      </div>`;
  }).join('');

  bar.innerHTML = `
    <div class="ab-controls">${controls}</div>
    ${hasFilters ? `
      <div class="ab-status">
        <span class="ab-pill">Showing ${filteredCount.toLocaleString()} of ${totalRows.toLocaleString()} rows</span>
        <button class="ab-clear" type="button">Clear filters</button>
      </div>` : ''}
  `;

  // Wire events after innerHTML is set
  setTimeout(() => {
    bar.querySelectorAll<HTMLSelectElement>('.ab-select').forEach(sel => {
      sel.addEventListener('change', () => {
        const col = sel.dataset.col;
        if (!col) return;
        cb.onFilterChange(col, sel.value);
      });
    });

    bar.querySelectorAll<HTMLInputElement>('.ab-input').forEach(input => {
      let debounceTimer: ReturnType<typeof setTimeout>;
      input.addEventListener('input', () => {
        const col = input.dataset.col;
        if (!col) return;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => cb.onFilterChange(col, input.value), DEBOUNCE_MS);
      });
    });

    bar.querySelector<HTMLButtonElement>('.ab-clear')?.addEventListener('click', cb.onClearAll);
  }, 0);

  return bar;
}
