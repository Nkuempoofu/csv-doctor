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
 */
export function getFilteredRows(
  rows: Row[],
  headers: string[],
  slots: FilterSlot[]
): Row[] {
  const active = slots.filter(isActive);
  if (active.length === 0) return rows;
  return rows.filter(row =>
    active.every(({ column, value }) => {
      const idx = headers.indexOf(column);
      if (idx === -1) return true;
      const cell = (row[idx] ?? '').trim();
      if (Array.isArray(value)) {
        return value.includes(cell);
      }
      return cell.toLowerCase().includes(value.toLowerCase());
    })
  );
}
