// src/ui/filter-slots.ts
/**
 * Filter slots — 1 to 5 dynamic filter rows, each with a column picker
 * and a value field. Replaces the old per-column analysis-toolbar.
 */

import type { Row, FilterSlot } from '../types';
import { escapeHtml } from '../lib/format';

export interface FilterSlotsCallbacks {
  onSlotChange: (index: number, column: string, value: string | string[]) => void;
  onSlotModeToggle: (index: number) => void;
  onAddSlot: () => void;
  onRemoveSlot: (index: number) => void;
  onClearAll: () => void;
}

const MAX_SLOTS = 5;
const DEBOUNCE_MS = 250;
const MAX_UNIQUE_FOR_SELECT = 15;

export function renderFilterSlots(
  headers: string[],
  allRows: Row[],
  slots: FilterSlot[],
  _filteredCount: number,
  cb: FilterSlotsCallbacks
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'filters-section';

  const activeCount = slots.filter(s => {
    if (!s.column) return false;
    if (Array.isArray(s.value)) return s.value.length > 0;
    return s.value !== '';
  }).length;
  const hasActive = activeCount > 0;

  // ── Header ──
  const headerHtml = `
    <div class="filters-header">
      <h3 class="filters-title">Filter data</h3>
      ${hasActive ? `<span class="filters-count">${activeCount} active</span>` : ''}
      ${hasActive ? `<button class="filters-clear" type="button" id="filters-clear-all">Clear all</button>` : ''}
    </div>
  `;

  // ── Slots ──
  const slotsHtml = slots.map((slot, idx) => {
    const colOpts = [
      `<option value="">— Select column —</option>`,
      ...headers.map(h =>
        `<option value="${escapeHtml(h)}"${slot.column === h ? ' selected' : ''}>${escapeHtml(h)}</option>`
      ),
    ].join('');

    // Value field: chips if chosen column has ≤ 15 unique values; text input otherwise
    let valueHtml: string;
    if (slot.column === '') {
      valueHtml = `<input type="text" class="filter-slot-val" data-idx="${idx}" placeholder="Select a column first" disabled />`;
    } else {
      const colIdx = headers.indexOf(slot.column);
      const uniq = [...new Set(
        allRows.map(r => (r[colIdx] ?? '').trim()).filter(Boolean)
      )].sort();

      if (uniq.length <= MAX_UNIQUE_FOR_SELECT) {
        // Multi-select chips — slot.value is string[] when in chip mode
        const selected: string[] = Array.isArray(slot.value) ? slot.value : [];
        const chips = uniq.map(v => {
          const isSelected = selected.includes(v);
          return `<button
            class="filter-chip${isSelected ? ' filter-chip--selected' : ''}"
            type="button"
            data-idx="${idx}"
            data-val="${escapeHtml(v)}"
          >${escapeHtml(v)}</button>`;
        }).join('');
        valueHtml = `<div class="filter-chips" data-idx="${idx}">${chips}</div>`;
      } else {
        const textVal = typeof slot.value === 'string' ? slot.value : '';
        valueHtml = `<input type="text" class="filter-slot-val" data-idx="${idx}" value="${escapeHtml(textVal)}" placeholder="Filter…" />`;
      }
    }

    const canRemove = slots.length > 1;
    const mode = slot.mode ?? 'include';
    const modeLabel = mode === 'include' ? 'Include' : 'Exclude';
    const modeTitle = mode === 'include'
      ? 'Showing rows that match — click to exclude instead'
      : 'Hiding rows that match — click to include instead';

    return `
      <div class="filter-slot" data-slot="${idx}">
        <select class="filter-slot-col" data-idx="${idx}">${colOpts}</select>
        ${valueHtml}
        <button
          class="filter-mode-toggle filter-mode-toggle--${mode}"
          type="button"
          data-idx="${idx}"
          title="${modeTitle}"
          aria-label="${modeLabel} filter"
        >${modeLabel}</button>
        ${canRemove
          ? `<button class="filter-slot-remove" data-idx="${idx}" type="button" title="Remove filter" aria-label="Remove filter">✕</button>`
          : `<span class="filter-slot-remove filter-slot-remove--placeholder"></span>`}
      </div>
    `;
  }).join('');

  const canAdd = slots.length < MAX_SLOTS;

  section.innerHTML = `
    ${headerHtml}
    <div class="filter-slots-list">${slotsHtml}</div>
    <button class="filters-add" type="button" id="filters-add-slot"${canAdd ? '' : ' disabled'}>+ Add filter</button>
  `;

  // ── Wire events ──
  setTimeout(() => {
    // Column picker changes
    section.querySelectorAll<HTMLSelectElement>('.filter-slot-col').forEach(sel => {
      sel.addEventListener('change', () => {
        const idx = Number(sel.dataset.idx);
        cb.onSlotChange(idx, sel.value, '');
      });
    });

    // Chip clicks (multi-select toggle)
    section.querySelectorAll<HTMLButtonElement>('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const idx = Number(chip.dataset.idx);
        const val = chip.dataset.val ?? '';
        const col = slots[idx]?.column ?? '';
        const current: string[] = Array.isArray(slots[idx]?.value) ? (slots[idx].value as string[]) : [];
        const next = current.includes(val)
          ? current.filter(v => v !== val)   // deselect
          : [...current, val];               // select
        cb.onSlotChange(idx, col, next);
      });
    });

    // Value changes (text input — debounced)
    section.querySelectorAll<HTMLInputElement>('input.filter-slot-val').forEach(input => {
      let debounceTimer: ReturnType<typeof setTimeout>;
      input.addEventListener('input', () => {
        const idx = Number(input.dataset.idx);
        const col = slots[idx]?.column ?? '';
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => cb.onSlotChange(idx, col, input.value), DEBOUNCE_MS);
      });
    });

    // Mode toggle buttons (include ↔ exclude)
    section.querySelectorAll<HTMLButtonElement>('.filter-mode-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        cb.onSlotModeToggle(idx);
      });
    });

    // Remove slot buttons
    section.querySelectorAll<HTMLButtonElement>('.filter-slot-remove[data-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        cb.onRemoveSlot(idx);
      });
    });

    // Add slot
    document.getElementById('filters-add-slot')?.addEventListener('click', cb.onAddSlot);

    // Clear all
    document.getElementById('filters-clear-all')?.addEventListener('click', cb.onClearAll);
  }, 0);

  return section;
}
