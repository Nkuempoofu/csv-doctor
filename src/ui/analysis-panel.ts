// src/ui/analysis-panel.ts
/**
 * Analysis panel — column picker dropdown + 5 stat cards (Sum, Avg, Count, Min, Max).
 * Appears below the filter slots section.
 */

import type { Row } from '../types';
import { escapeHtml } from '../lib/format';

/* ── Aggregation (exported for testing) ── */

export interface ColAggregates {
  sum: number | null;
  avg: number | null;
  count: number;
  min: string;
  max: string;
  isNumeric: boolean;
}

export function computeAggregates(rows: Row[], colIndex: number): ColAggregates {
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

/* ── Component ── */

export function renderAnalysisPanel(
  headers: string[],
  filteredRows: Row[],
  activeColumn: string | null,
  onColumnSelect: (col: string | null) => void
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'analysis-section';

  const colOpts = [
    `<option value="">— Select a column to analyse —</option>`,
    ...headers.map(h =>
      `<option value="${escapeHtml(h)}"${activeColumn === h ? ' selected' : ''}>${escapeHtml(h)}</option>`
    ),
  ].join('');

  let statsHtml = '';
  if (activeColumn !== null) {
    const colIdx = headers.indexOf(activeColumn);
    if (filteredRows.length === 0) {
      statsHtml = `<p class="analysis-empty">No rows to analyse — clear your filters first.</p>`;
    } else if (colIdx === -1) {
      statsHtml = `<p class="analysis-empty">Column not found in current data.</p>`;
    } else {
      const agg = computeAggregates(filteredRows, colIdx);
      const stats = [
        { label: 'Sum', value: agg.isNumeric ? fmt(agg.sum!) : '—' },
        { label: 'Avg', value: agg.isNumeric ? fmt(agg.avg!) : '—' },
        { label: 'Count', value: agg.count.toLocaleString() },
        { label: 'Min', value: escapeHtml(agg.min) },
        { label: 'Max', value: escapeHtml(agg.max) },
      ];
      const cards = stats.map(s => `
        <div class="stat-card">
          <div class="stat-card-label">${s.label}</div>
          <div class="stat-card-value${s.value === '—' ? ' stat-card-value--muted' : ''}">${s.value}</div>
        </div>`).join('');
      const note = filteredRows.length > 0
        ? `<p class="analysis-note">Based on ${filteredRows.length.toLocaleString()} row${filteredRows.length === 1 ? '' : 's'}</p>`
        : '';
      statsHtml = `<div class="analysis-stats">${cards}</div>${note}`;
    }
  }

  section.innerHTML = `
    <h3 class="analysis-title">Analyse a column</h3>
    <select class="analysis-col-picker" id="analysis-col-picker">${colOpts}</select>
    ${statsHtml}
  `;

  setTimeout(() => {
    section.querySelector<HTMLSelectElement>('#analysis-col-picker')
      ?.addEventListener('change', (e) => {
        const val = (e.target as HTMLSelectElement).value;
        onColumnSelect(val === '' ? null : val);
      });
  }, 0);

  return section;
}
