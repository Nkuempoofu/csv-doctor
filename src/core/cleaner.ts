/**
 * Cleaner — applies the user's selected fixes to a ParsedFile and produces
 * a CleanResult: the new rows, which rows were dropped, and a list of
 * cell-level changes for the diff view.
 *
 * Order of operations matters: we drop rows first (so cell counts are
 * accurate downstream), then walk the remaining cells once to apply
 * cell-level fixes in a single pass.
 */

import type { ParsedFile, CleanResult, Row, IssueId, CellChange } from '../types';
import { detectDateFormat, isRowEmpty } from './analyzer';
import { buildFuzzyReplacements } from '../lib/levenshtein';

const PHONE_DETECT_RE = /^[\+\d][\d\s\-\(\)\.]{6,}$/;
const EMAIL_BASIC_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EU_NUMBER_RE = /^\d{1,3}(\.\d{3})+(,\d+)?$/;

function fixEuropeanNumber(value: string): string {
  const v = value.trim();
  if (!EU_NUMBER_RE.test(v)) return value;
  // Remove thousands dots; replace decimal comma with dot.
  return v.replace(/\./g, '').replace(',', '.');
}

interface CleanOptions {
  enabled: Set<IssueId>;
}

/* ───────────────────────────────────────────────────
   Cell-level transforms
─────────────────────────────────────────────────── */

function fixWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function fixMojibake(value: string): string {
  // Common UTF-8 → cp1252 → re-decoded-as-UTF-8 artifacts:
  return value
    .replace(/â€™/g, '’')   // right single quote
    .replace(/â€˜/g, '‘')   // left single quote
    .replace(/â€œ/g, '“')   // left double quote
    .replace(/â€[]/g, '”')  // right double quote
    .replace(/â€"/g, '—')   // em dash
    .replace(/â€"/g, '–')   // en dash
    .replace(/â€¦/g, '…')   // ellipsis
    .replace(/Ã©/g, 'é')    // é
    .replace(/Ã¨/g, 'è')    // è
    .replace(/Ã /g, 'à')    // à
    .replace(/Ã¶/g, 'ö')    // ö
    .replace(/Ã¼/g, 'ü')    // ü
    .replace(/Ã±/g, 'ñ');   // ñ
}

function normaliseDate(value: string): string {
  const v = value.trim();
  const fmt = detectDateFormat(v);
  if (fmt < 0) return value;

  // Parse and reformat to ISO 8601 (YYYY-MM-DD).
  let date: Date;
  if (fmt === 0) {
    date = new Date(v);
  } else if (fmt === 1 || fmt === 2) {
    // M/D/YY or M-D-YY — assume US format. Two-digit years map to 2000s.
    const [m, d, y] = v.split(/[\/-]/).map((s) => parseInt(s, 10));
    const fullYear = y < 100 ? (y < 50 ? 2000 + y : 1900 + y) : y;
    date = new Date(fullYear, m - 1, d);
  } else if (fmt === 3) {
    // D.M.YY (European)
    const [d, m, y] = v.split('.').map((s) => parseInt(s, 10));
    const fullYear = y < 100 ? (y < 50 ? 2000 + y : 1900 + y) : y;
    date = new Date(fullYear, m - 1, d);
  } else {
    date = new Date(v);
  }

  if (isNaN(date.getTime())) return value;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function normaliseBoolean(value: string): string {
  const v = value.trim().toLowerCase();
  if (/^(true|yes|y|1)$/.test(v)) return 'true';
  if (/^(false|no|n|0)$/.test(v)) return 'false';
  return value;
}

function titleCase(value: string): string {
  return value.replace(/\b\w+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

function isBlankEquivalent(value: string): boolean {
  return /^(n\/a|na|none|null|-|--|nil)$/i.test(value.trim());
}

function fixCurrencyNumber(value: string): string {
  const v = value.trim();
  if (!v) return value;
  // Strip leading currency symbol + optional whitespace
  let s = v.replace(/^[£$€¥R]\s*/, '').replace(/\s*[£$€¥R]$/, '');
  // Remove thousands-separator commas
  s = s.replace(/,/g, '');
  // Accept only if the result is a valid decimal number
  return /^-?\d+(\.\d+)?$/.test(s) ? s : value;
}

/* ───────────────────────────────────────────────────
   Structural transforms (header / column level)
─────────────────────────────────────────────────── */

function fixHeaders(headers: string[]): string[] {
  // 1. Trim
  const trimmed = headers.map(h => h.trim());
  // 2. Title-case (treat underscores as word separators)
  const titled = trimmed.map(h =>
    h.replace(/[a-zA-Z0-9]+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase())
  );
  // 3. Deduplicate
  const seen = new Map<string, number>();
  return titled.map(h => {
    const key = h.toLowerCase();
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    return count === 1 ? h : `${h}_${count}`;
  });
}

function normalisePhone(value: string): string {
  const v = value.trim();
  const hasPlus = v.startsWith('+');
  const digits = v.replace(/\D/g, '');

  // SA local: 0XX XXX XXXX
  if (digits.length === 10 && digits.startsWith('0')) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  // SA international without +: 27XX XXX XXXX
  if (digits.length === 11 && digits.startsWith('27')) {
    return `+27 ${digits.slice(2, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  // Has + prefix and enough digits
  if (hasPlus && digits.length >= 10) {
    return `+${digits}`;
  }
  return digits.length > 0 ? digits : value;
}

type ContactColType = 'phone' | 'email' | 'other';

function classifyContactColumns(headers: string[], rows: Row[]): ContactColType[] {
  return headers.map((_, c) => {
    const nonEmpty = rows.map(r => (r[c] ?? '').trim()).filter(Boolean);
    if (nonEmpty.length < 5) return 'other';
    const phoneRatio = nonEmpty.filter(v => PHONE_DETECT_RE.test(v)).length / nonEmpty.length;
    const emailRatio = nonEmpty.filter(v => v.includes('@')).length / nonEmpty.length;
    if (phoneRatio >= 0.4) return 'phone';
    if (emailRatio >= 0.4) return 'email';
    return 'other';
  });
}

/**
 * Pre-compute fuzzy replacement maps for all eligible columns.
 * Returns a Map<colIndex, Map<misspelling, canonical>>.
 * Only considers categorical columns (≤50 unique values, not mostly numeric).
 */
function buildAllFuzzyMaps(headers: string[], rows: Row[]): Map<number, Map<string, string>> {
  const MAX_UNIQUE = 50;
  const MIN_LEN    = 4;
  const result     = new Map<number, Map<string, string>>();

  for (let c = 0; c < headers.length; c++) {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const v = (row[c] ?? '').trim();
      if (!v) continue;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }

    const unique = Array.from(counts.keys());
    if (unique.length > MAX_UNIQUE || unique.length < 2) continue;

    const numericCount = unique.filter(v => !isNaN(Number(v.replace(/,/g, '')))).length;
    if (unique.length > 0 && numericCount / unique.length > 0.5) continue;

    const replacements = buildFuzzyReplacements(unique, counts, MIN_LEN);
    if (replacements.size > 0) result.set(c, replacements);
  }

  return result;
}

function removeSparseColumns(
  headers: string[],
  rows: Row[],
  threshold = 0.8
): { headers: string[]; rows: Row[]; changed: boolean } {
  if (rows.length === 0) return { headers, rows, changed: false };

  const sparseIndices = headers
    .map((_, c) => {
      const emptyCount = rows.filter(r => (r[c] ?? '').trim() === '').length;
      return emptyCount / rows.length >= threshold ? c : -1;
    })
    .filter(i => i !== -1);

  // Guard: never remove all columns
  if (sparseIndices.length === 0 || sparseIndices.length >= headers.length) {
    return { headers, rows, changed: false };
  }

  const sparseSet = new Set(sparseIndices);
  const keepIndices = headers.map((_, i) => i).filter(i => !sparseSet.has(i));

  return {
    headers: keepIndices.map(i => headers[i]),
    rows: rows.map(row => keepIndices.map(i => row[i] ?? '')),
    changed: true,
  };
}

/* ───────────────────────────────────────────────────
   Public — clean
─────────────────────────────────────────────────── */

export function clean(file: ParsedFile, opts: CleanOptions): CleanResult {
  const { enabled } = opts;

  /* ── Structural pre-pass ── */
  let workingHeaders = [...file.headers];
  let headersChanged = false;

  if (enabled.has('header-issues')) {
    const fixed = fixHeaders(workingHeaders);
    if (fixed.some((h, i) => h !== workingHeaders[i])) {
      workingHeaders = fixed;
      headersChanged = true;
    }
  }

  // Use a working copy of the file with (possibly) new headers for the rest
  let workingFile: ParsedFile = headersChanged
    ? { ...file, headers: workingHeaders }
    : file;

  if (enabled.has('sparse-columns')) {
    const { headers: sh, rows: sr, changed } = removeSparseColumns(
      workingHeaders,
      workingFile.rows
    );
    if (changed) {
      workingHeaders = sh;
      workingFile = { ...workingFile, headers: workingHeaders, rows: sr };
      headersChanged = true;
    }
  }

  // Pre-compute contact column types (O(n·m) once, avoids per-cell recomputation)
  const contactColTypes: ContactColType[] | null = enabled.has('contact-formats')
    ? classifyContactColumns(workingFile.headers, workingFile.rows)
    : null;

  // Pre-compute fuzzy replacement maps per column
  const fuzzyMaps: Map<number, Map<string, string>> | null = enabled.has('fuzzy-values')
    ? buildAllFuzzyMaps(workingFile.headers, workingFile.rows)
    : null;

  const removedRowIndices: number[] = [];
  const changes: CellChange[] = [];

  /* Step 1 — row-level filters */
  const seen = new Set<string>();
  const keptRows: Array<{ row: Row; originalIdx: number }> = [];

  workingFile.rows.forEach((row, idx) => {
    if (enabled.has('empty-rows') && isRowEmpty(row)) {
      removedRowIndices.push(idx);
      return;
    }
    if (enabled.has('duplicate-rows')) {
      const key = row.map((c) => (c ?? '').trim()).join(' ');
      if (seen.has(key) && !isRowEmpty(row)) {
        removedRowIndices.push(idx);
        return;
      }
      seen.add(key);
    }
    keptRows.push({ row: [...row], originalIdx: idx });
  });

  /* Step 2 — cell-level transforms over surviving rows */
  const cleanedRows: Row[] = keptRows.map(({ row, originalIdx }) => {
    return row.map((cell, c) => {
      let next = cell ?? '';
      const before = next;

      if (enabled.has('special-chars')) {
        const fixed = fixMojibake(next);
        if (fixed !== next) next = fixed;
      }

      if (enabled.has('whitespace')) {
        const fixed = fixWhitespace(next);
        if (fixed !== next) next = fixed;
      }

      if (enabled.has('mixed-types') && isBlankEquivalent(next)) {
        next = '';
      }

      if (enabled.has('mixed-dates')) {
        const fixed = normaliseDate(next);
        if (fixed !== next) next = fixed;
      }

      if (enabled.has('mixed-booleans')) {
        if (/^(true|false|yes|no|y|n|0|1)$/i.test(before.trim())) {
          const fixed = normaliseBoolean(next);
          if (fixed !== next) next = fixed;
        }
      }

      if (enabled.has('mixed-case') && next && isNaN(Number(next))) {
        const fixed = titleCase(next);
        if (fixed !== next) next = fixed;
      }

      if (enabled.has('currency-numbers')) {
        const fixed = fixCurrencyNumber(next);
        if (fixed !== next) next = fixed;
      }

      if (enabled.has('number-format')) {
        const fixed = fixEuropeanNumber(next);
        if (fixed !== next) next = fixed;
      }

      if (enabled.has('contact-formats') && contactColTypes) {
        const colType = contactColTypes[c];
        if (colType === 'phone' && PHONE_DETECT_RE.test(next)) {
          const fixed = normalisePhone(next);
          if (fixed !== next) next = fixed;
        } else if (colType === 'email' && next.includes('@') && !EMAIL_BASIC_RE.test(next)) {
          next = '';
        }
      }

      if (enabled.has('fuzzy-values') && fuzzyMaps) {
        const colMap = fuzzyMaps.get(c);
        if (colMap) {
          const trimmed = next.trim();
          const lower   = trimmed.toLowerCase();
          // Try exact match → lowercase → dot-stripped (handles "U.K." / "Uk").
          const canonical = colMap.get(trimmed)
                         ?? colMap.get(lower)
                         ?? colMap.get(lower.replace(/\./g, ''));
          if (canonical !== undefined) next = canonical;
        }
      }

      if (next !== before) {
        changes.push({
          rowIndex: originalIdx,
          colIndex: c,
          before,
          after: next,
          reason: pickReason(before, next),
        });
      }
      return next;
    });
  });

  return {
    rows: cleanedRows,
    removedRowIndices,
    changes,
    appliedFixes: Array.from(enabled),
    cleanedHeaders: headersChanged ? workingHeaders : undefined,
  };
}

/** Heuristic — guess which fix caused a particular change (for diff colouring). */
function pickReason(before: string, after: string): IssueId {
  if (before.trim() === after && before !== after) return 'whitespace';
  if (after === '' && before.includes('@')) return 'contact-formats';
  if (after === '') return 'mixed-types';
  if (/^\d{4}-\d{2}-\d{2}/.test(after) && !/^\d{4}-\d{2}-\d{2}/.test(before)) return 'mixed-dates';
  if (/^(true|false)$/i.test(after) && !/^(true|false)$/i.test(before)) return 'mixed-booleans';
  if (after.toLowerCase() === before.toLowerCase() && after !== before) return 'mixed-case';
  if (/^-?\d+(\.\d+)?$/.test(after) && /[£$€¥R,]/.test(before)) return 'currency-numbers';
  if (PHONE_DETECT_RE.test(before) && /^\d[\d\s+]*$/.test(after)) return 'contact-formats';
  if (EU_NUMBER_RE.test(before) && /^\d+(\.\d+)?$/.test(after)) return 'number-format';
  // Fuzzy replacement: different strings, not covered by the cases above
  if (before !== after && before.trim() !== '' && after.trim() !== '') return 'fuzzy-values';
  return 'special-chars';
}
