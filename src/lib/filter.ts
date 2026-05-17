import type { Row, FilterSlot } from '../types';

/** Returns true when a slot has a non-empty filter set. */
function isActive(s: FilterSlot): boolean {
  if (!s.column) return false;
  if (Array.isArray(s.value)) return s.value.length > 0;
  return s.value !== '';
}

/**
 * Filter rows using an array of FilterSlots.
 * Only active slots are applied; multiple active slots use AND logic.
 *
 * value: string   → case-insensitive substring match
 * value: string[] → exact OR match (cell must equal one of the selected values)
 * mode: 'include' → keep rows that match (default)
 * mode: 'exclude' → keep rows that do NOT match
 */
export function getFilteredRows(
  rows: Row[],
  headers: string[],
  slots: FilterSlot[]
): Row[] {
  const active = slots.filter(isActive);
  if (active.length === 0) return rows;
  return rows.filter(row =>
    active.every(({ column, value, mode }) => {
      const idx = headers.indexOf(column);
      if (idx === -1) return true;
      const cell = (row[idx] ?? '').trim();

      let matches: boolean;
      if (Array.isArray(value)) {
        matches = value.includes(cell);
      } else {
        matches = cell.toLowerCase().includes(value.toLowerCase());
      }

      // exclude mode inverts the match: row survives only when it does NOT match
      return mode === 'exclude' ? !matches : matches;
    })
  );
}
