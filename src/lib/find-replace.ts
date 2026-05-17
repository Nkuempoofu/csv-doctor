/**
 * Find & Replace — pure transformation.
 *
 * Applies a sequence of FindReplaceRules to a row array and returns
 * the modified rows plus a CellChange list (reason: 'find-replace').
 * Rules are applied in order; each rule sees the output of the previous one.
 */

import type { Row, CellChange, FindReplaceRule } from '../types';

export function applyFindReplace(
  rows:    Row[],
  headers: string[],
  rules:   FindReplaceRule[]
): { rows: Row[]; changes: CellChange[] } {
  if (rules.length === 0) return { rows, changes: [] };

  const changes: CellChange[] = [];

  const newRows = rows.map((row, rowIdx) =>
    row.map((cell, colIdx) => {
      let value      = cell ?? '';
      const original = value;
      const colName  = headers[colIdx] ?? '';

      for (const rule of rules) {
        if (rule.find === '') continue;
        if (rule.column !== '' && rule.column !== colName) continue;

        if (rule.wholeCell) {
          const matches = rule.caseSensitive
            ? value === rule.find
            : value.toLowerCase() === rule.find.toLowerCase();
          if (matches) value = rule.replace;
        } else {
          const flags   = rule.caseSensitive ? 'g' : 'gi';
          const escaped = rule.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          value = value.replace(new RegExp(escaped, flags), rule.replace);
        }
      }

      if (value !== original) {
        changes.push({
          rowIndex: rowIdx,
          colIndex: colIdx,
          before:   original,
          after:    value,
          reason:   'find-replace',
        });
      }

      return value;
    })
  );

  return { rows: newRows, changes };
}
