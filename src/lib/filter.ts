import type { Row, FilterSlot } from '../types';

/**
 * Filter rows using an array of FilterSlots.
 * Only slots where both `column` and `value` are non-empty are applied.
 * Multiple active slots are combined with AND logic.
 */
export function getFilteredRows(
  rows: Row[],
  headers: string[],
  slots: FilterSlot[]
): Row[] {
  const active = slots.filter(s => s.column !== '' && s.value !== '');
  if (active.length === 0) return rows;
  return rows.filter(row =>
    active.every(({ column, value }) => {
      const idx = headers.indexOf(column);
      if (idx === -1) return true;
      return (row[idx] ?? '').toLowerCase().includes(value.toLowerCase());
    })
  );
}
