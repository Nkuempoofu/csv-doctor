/**
 * Stats strip — small KPI cards shown above the preview table.
 */

import type { ParsedFile, CleanResult } from '../types';
import { compact, bytes } from '../lib/format';

export function renderStats(file: ParsedFile, result: CleanResult | null): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'stats';

  const items = result
    ? [
        { num: compact(file.rows.length),                  label: 'Original rows' },
        { num: compact(result.rows.length),                label: 'After cleaning', highlight: true },
        { num: compact(result.removedRowIndices.length),   label: 'Rows removed' },
        { num: compact(result.changes.length),             label: 'Cells modified' },
      ]
    : [
        { num: compact(file.rows.length),                  label: 'Rows' },
        { num: compact(file.headers.length),               label: 'Columns' },
        { num: bytes(file.size),                           label: 'File size' },
        { num: file.delimiter === '\t' ? '\\t' : file.delimiter, label: 'Delimiter' },
      ];

  wrap.innerHTML = items.map((it) => `
    <div class="stat ${(it as any).highlight ? 'stat--accent' : ''}">
      <div class="stat-num">${it.num}</div>
      <div class="stat-label">${it.label}</div>
    </div>
  `).join('');

  return wrap;
}
