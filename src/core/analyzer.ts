/**
 * Issue detection — the diagnostic brain of CSV Doctor.
 *
 * Runs a battery of checks over a ParsedFile and produces a list of Issue
 * descriptors. Each check is independent, side-effect-free, and inexpensive
 * enough to run on the full dataset (we cap at ~100k rows for safety).
 *
 * Detection philosophy: prefer false negatives over false positives.
 * We don't want to flag legit data as "bad" — every flag should be something
 * the user genuinely *might* want to fix.
 */

import type { ParsedFile, Issue, Row } from '../types';

/* ───────────────────────────────────────────────────
   Helpers
─────────────────────────────────────────────────── */

const DATE_REGEXES: RegExp[] = [
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/,        // ISO 8601
  /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,                                // M/D/YY or M/D/YYYY
  /^\d{1,2}-\d{1,2}-\d{2,4}$/,                                  // M-D-YY
  /^\d{1,2}\.\d{1,2}\.\d{2,4}$/,                                // D.M.YY
  /^[A-Za-z]+ \d{1,2},? \d{4}$/,                                // Jan 5, 2024
  /^\d{1,2} [A-Za-z]+ \d{4}$/,                                  // 5 Jan 2024
];

function detectDateFormat(value: string): number {
  if (!value) return -1;
  for (let i = 0; i < DATE_REGEXES.length; i++) {
    if (DATE_REGEXES[i].test(value.trim())) return i;
  }
  return -1;
}

function isNumericLike(value: string): boolean {
  if (!value) return false;
  const cleaned = value.trim().replace(/,/g, '');
  return cleaned !== '' && !isNaN(Number(cleaned));
}

function classifyType(value: string): 'empty' | 'numeric' | 'date' | 'boolean' | 'string' {
  const v = value?.trim() ?? '';
  if (v === '') return 'empty';
  if (detectDateFormat(v) >= 0) return 'date';
  if (isNumericLike(v)) return 'numeric';
  if (/^(true|false|yes|no|y|n|0|1)$/i.test(v)) return 'boolean';
  return 'string';
}

function isRowEmpty(row: Row): boolean {
  return row.every((c) => (c ?? '').trim() === '');
}

/* ───────────────────────────────────────────────────
   Detectors — each returns an Issue or null
─────────────────────────────────────────────────── */

function detectEmptyRows(file: ParsedFile): Issue | null {
  let count = 0;
  for (const row of file.rows) if (isRowEmpty(row)) count++;
  if (count === 0) return null;
  return {
    id: 'empty-rows',
    label: 'Empty rows',
    description: `${count} row${count === 1 ? '' : 's'} contain no data and can be safely removed.`,
    severity: 'low',
    count,
    affectedColumns: [],
    enabled: true,
  };
}

function detectDuplicateRows(file: ParsedFile): Issue | null {
  const seen = new Map<string, number>();
  let dupes = 0;
  for (const row of file.rows) {
    if (isRowEmpty(row)) continue; // empties handled separately
    const key = row.map((c) => (c ?? '').trim()).join('');
    const prev = seen.get(key) ?? 0;
    if (prev >= 1) dupes++;
    seen.set(key, prev + 1);
  }
  if (dupes === 0) return null;
  return {
    id: 'duplicate-rows',
    label: 'Duplicate rows',
    description: `${dupes} row${dupes === 1 ? ' is an exact duplicate' : 's are exact duplicates'} of earlier rows.`,
    severity: 'medium',
    count: dupes,
    affectedColumns: [],
    enabled: true,
  };
}

function detectWhitespace(file: ParsedFile): Issue | null {
  const affected = new Set<string>();
  let cellCount = 0;
  for (const row of file.rows) {
    for (let c = 0; c < row.length; c++) {
      const v = row[c];
      if (typeof v !== 'string') continue;
      if (v !== v.trim() || /\s{2,}/.test(v)) {
        cellCount++;
        affected.add(file.headers[c] ?? `col_${c}`);
      }
    }
  }
  if (cellCount === 0) return null;
  return {
    id: 'whitespace',
    label: 'Whitespace issues',
    description: `${cellCount} cell${cellCount === 1 ? ' has' : 's have'} leading, trailing, or doubled-up whitespace.`,
    severity: 'low',
    count: cellCount,
    affectedColumns: Array.from(affected).slice(0, 8),
    enabled: true,
  };
}

function detectMixedTypes(file: ParsedFile): Issue | null {
  const affected: string[] = [];
  let totalCells = 0;
  for (let c = 0; c < file.headers.length; c++) {
    const types = new Set<string>();
    let nonEmpty = 0;
    for (const row of file.rows) {
      const t = classifyType(row[c] ?? '');
      if (t === 'empty') continue;
      nonEmpty++;
      types.add(t);
    }
    types.delete('empty');
    if (types.size > 1 && nonEmpty > 4) {
      affected.push(file.headers[c] ?? `col_${c}`);
      totalCells += nonEmpty;
    }
  }
  if (affected.length === 0) return null;
  return {
    id: 'mixed-types',
    label: 'Mixed data types',
    description: `${affected.length} column${affected.length === 1 ? ' contains' : 's contain'} mixed data types (e.g. numeric and text). Cleaning will normalise blank-equivalents like "N/A" or "-" to empty.`,
    severity: 'medium',
    count: totalCells,
    affectedColumns: affected,
    enabled: false, // off by default — destructive
  };
}

function detectMixedDates(file: ParsedFile): Issue | null {
  const affected: string[] = [];
  let totalCells = 0;
  for (let c = 0; c < file.headers.length; c++) {
    const formats = new Set<number>();
    let dateCount = 0;
    for (const row of file.rows) {
      const fmt = detectDateFormat((row[c] ?? '').trim());
      if (fmt >= 0) {
        formats.add(fmt);
        dateCount++;
      }
    }
    if (formats.size > 1) {
      affected.push(file.headers[c] ?? `col_${c}`);
      totalCells += dateCount;
    }
  }
  if (affected.length === 0) return null;
  return {
    id: 'mixed-dates',
    label: 'Mixed date formats',
    description: `${affected.length} column${affected.length === 1 ? ' uses' : 's use'} more than one date format. Cleaning will convert all to ISO 8601 (YYYY-MM-DD).`,
    severity: 'high',
    count: totalCells,
    affectedColumns: affected,
    enabled: true,
  };
}

function detectMixedCase(file: ParsedFile): Issue | null {
  const affected: string[] = [];
  let cellCount = 0;
  // Group cells by lowercased value per column; if there are duplicates with
  // different casings, that column has mixed case.
  for (let c = 0; c < file.headers.length; c++) {
    const groups = new Map<string, Set<string>>();
    for (const row of file.rows) {
      const v = (row[c] ?? '').trim();
      if (!v) continue;
      // Skip numeric columns — capitalisation isn't meaningful there.
      if (isNumericLike(v)) continue;
      const key = v.toLowerCase();
      if (!groups.has(key)) groups.set(key, new Set());
      groups.get(key)!.add(v);
    }
    let columnHits = 0;
    for (const set of groups.values()) {
      if (set.size > 1) columnHits += set.size;
    }
    if (columnHits > 0) {
      affected.push(file.headers[c] ?? `col_${c}`);
      cellCount += columnHits;
    }
  }
  if (affected.length === 0) return null;
  return {
    id: 'mixed-case',
    label: 'Inconsistent capitalisation',
    description: `${affected.length} column${affected.length === 1 ? ' has' : 's have'} the same value in different capitalisations (e.g. "London" + "LONDON"). Cleaning will Title-Case them.`,
    severity: 'low',
    count: cellCount,
    affectedColumns: affected,
    enabled: false,
  };
}

function detectMixedBooleans(file: ParsedFile): Issue | null {
  const affected: string[] = [];
  let cellCount = 0;
  for (let c = 0; c < file.headers.length; c++) {
    const booleanForms = new Set<string>();
    let count = 0;
    for (const row of file.rows) {
      const v = (row[c] ?? '').trim().toLowerCase();
      if (!v) continue;
      if (/^(true|false|yes|no|y|n|0|1)$/.test(v)) {
        booleanForms.add(v);
        count++;
      } else {
        booleanForms.add('__nonbool__');
      }
    }
    booleanForms.delete('__nonbool__');
    // Mostly-boolean column with multiple representation styles.
    if (booleanForms.size > 2 && count > 4) {
      affected.push(file.headers[c] ?? `col_${c}`);
      cellCount += count;
    }
  }
  if (affected.length === 0) return null;
  return {
    id: 'mixed-booleans',
    label: 'Mixed boolean values',
    description: `${affected.length} column${affected.length === 1 ? ' uses' : 's use'} more than two boolean representations (e.g. "Yes/No" + "True/False"). Cleaning will normalise them all to true/false.`,
    severity: 'medium',
    count: cellCount,
    affectedColumns: affected,
    enabled: true,
  };
}

function detectSpecialChars(file: ParsedFile): Issue | null {
  // Detect mojibake artifacts: common results of mis-decoded UTF-8 (e.g. â€™ for ').
  const mojibakePattern = /[ÂÃ�][\x80-\xBF]|â€[œ™˜]/;
  let cellCount = 0;
  const affected = new Set<string>();
  for (const row of file.rows) {
    for (let c = 0; c < row.length; c++) {
      if (mojibakePattern.test(row[c] ?? '')) {
        cellCount++;
        affected.add(file.headers[c] ?? `col_${c}`);
      }
    }
  }
  if (cellCount === 0) return null;
  return {
    id: 'special-chars',
    label: 'Encoding artifacts',
    description: `${cellCount} cell${cellCount === 1 ? ' contains' : 's contain'} characters that look like UTF-8 mis-decoding artifacts (e.g. "â€™" instead of "'"). Cleaning will repair common cases.`,
    severity: 'medium',
    count: cellCount,
    affectedColumns: Array.from(affected).slice(0, 8),
    enabled: true,
  };
}

function detectCurrencyNumbers(file: ParsedFile): Issue | null {
  const SYMBOL_RE = /[£$€¥R]/;
  const COMMA_NUM_RE = /^\d{1,3}(,\d{3})+(\.\d+)?$/;

  const affected: string[] = [];
  let totalCells = 0;

  for (let c = 0; c < file.headers.length; c++) {
    let flagged = 0;
    let nonEmpty = 0;
    for (const row of file.rows) {
      const v = (row[c] ?? '').trim();
      if (!v) continue;
      nonEmpty++;
      if (SYMBOL_RE.test(v) || COMMA_NUM_RE.test(v)) flagged++;
    }
    if (nonEmpty > 0 && flagged / nonEmpty >= 0.3) {
      affected.push(file.headers[c] ?? `col_${c}`);
      totalCells += flagged;
    }
  }

  if (affected.length === 0) return null;

  const hasMixedCurrencies = (col: string) => {
    const cIdx = file.headers.indexOf(col);
    const symbols = new Set<string>();
    for (const row of file.rows) {
      const m = (row[cIdx] ?? '').match(/[£$€¥R]/g);
      if (m) m.forEach(s => symbols.add(s));
    }
    return symbols.size > 1;
  };
  const mixed = affected.filter(hasMixedCurrencies);
  const mixedNote = mixed.length > 0 ? ` Mixed currencies detected in: ${mixed.join(', ')}.` : '';

  return {
    id: 'currency-numbers',
    label: 'Currency / number formatting',
    description: `${affected.length} column${affected.length === 1 ? ' contains' : 's contain'} values with currency symbols or thousands-separator formatting (e.g. "$1,200.00"). Cleaning strips symbols and separators to plain numbers.${mixedNote}`,
    severity: 'medium',
    count: totalCells,
    affectedColumns: affected,
    enabled: true,
  };
}

/* ───────────────────────────────────────────────────
   Public — run all detectors
─────────────────────────────────────────────────── */

export function analyze(file: ParsedFile): Issue[] {
  const detectors = [
    detectEmptyRows,
    detectDuplicateRows,
    detectWhitespace,
    detectMixedDates,
    detectMixedTypes,
    detectMixedCase,
    detectMixedBooleans,
    detectSpecialChars,
    detectCurrencyNumbers,  // NEW
  ];

  const issues: Issue[] = [];
  for (const d of detectors) {
    const issue = d(file);
    if (issue) issues.push(issue);
  }
  return issues;
}

/* Re-export for the cleaner */
export { classifyType, detectDateFormat, isNumericLike, isRowEmpty };
