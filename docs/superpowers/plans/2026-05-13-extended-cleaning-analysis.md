# CSV Doctor — Extended Cleaning & In-Table Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four new cleaning operations (currency numbers, header formatting, contact formats, sparse columns) and an integrated filter + column-aggregation layer directly inside the preview table.

**Architecture:** New cleaners plug into the existing analyzer/cleaner pipeline. Analysis state (`activeColumn`, `columnFilters`) lives in `main.ts`; a new `analysis-toolbar.ts` component owns filter controls; `preview-table.ts` gains a column-click handler and sticky `<tfoot>` aggregation row. The single upload → diagnose → clean → analyze → download flow is preserved.

**Tech Stack:** TypeScript 5, Vite 5, Vitest (new), Papa Parse 5, vanilla DOM

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| **Create** | `src/core/__tests__/helpers.ts` | `makeFile()` test factory |
| **Create** | `src/core/__tests__/analyzer.test.ts` | Unit tests for new detectors |
| **Create** | `src/core/__tests__/cleaner.test.ts` | Unit tests for new fix functions |
| **Create** | `src/ui/analysis-toolbar.ts` | Filter bar component |
| **Create** | `vitest.config.ts` | Vitest configuration |
| **Modify** | `package.json` | Add vitest devDep + test scripts |
| **Modify** | `src/types.ts` | 4 new IssueIds + `cleanedHeaders` on CleanResult |
| **Modify** | `src/core/analyzer.ts` | 4 new detector functions registered in `analyze()` |
| **Modify** | `src/core/cleaner.ts` | 4 new fix functions + structural pre-passes |
| **Modify** | `src/core/exporter.ts` | Accept optional `headers` override param |
| **Modify** | `src/ui/preview-table.ts` | New options: displayHeaders, activeColumn, toolbar, tfoot |
| **Modify** | `src/main.ts` | Analysis state, handlers, updated render + export |
| **Modify** | `src/styles.css` | Toolbar, active-column, aggregation footer styles |
| **Modify** | `README.md` | Updated issues table + Analysis section |

---

## Task 1: Install Vitest and create test helpers

**Files:**
- Create: `vitest.config.ts`
- Create: `src/core/__tests__/helpers.ts`
- Modify: `package.json`

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest
```

Expected: `vitest` appears in `package.json` devDependencies.

- [ ] **Step 2: Create `vitest.config.ts`**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Add test scripts to `package.json`**

Add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

Final scripts block:
```json
"scripts": {
  "dev": "node ./node_modules/vite/bin/vite.js",
  "build": "node ./node_modules/typescript/bin/tsc --noEmit && node ./node_modules/vite/bin/vite.js build",
  "preview": "node ./node_modules/vite/bin/vite.js preview",
  "lint": "node ./node_modules/typescript/bin/tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 4: Create test helper factory**

```typescript
// src/core/__tests__/helpers.ts
import type { ParsedFile } from '../../types';

export function makeFile(headers: string[], rows: string[][]): ParsedFile {
  return {
    filename: 'test.csv',
    size: 0,
    delimiter: ',',
    encoding: 'UTF-8',
    headers,
    rows,
    rawText: '',
  };
}
```

- [ ] **Step 5: Create empty test stubs to verify setup**

```typescript
// src/core/__tests__/analyzer.test.ts
import { describe, it, expect } from 'vitest';
import { makeFile } from './helpers';

describe('analyzer setup', () => {
  it('makeFile creates a valid ParsedFile', () => {
    const f = makeFile(['A'], [['1'], ['2']]);
    expect(f.headers).toEqual(['A']);
    expect(f.rows.length).toBe(2);
  });
});
```

```typescript
// src/core/__tests__/cleaner.test.ts
import { describe, it, expect } from 'vitest';
import { makeFile } from './helpers';

describe('cleaner setup', () => {
  it('makeFile creates a valid ParsedFile', () => {
    const f = makeFile(['A'], [['1']]);
    expect(f.rows[0][0]).toBe('1');
  });
});
```

- [ ] **Step 6: Run tests to verify setup**

```bash
npm test
```

Expected output: `2 passed` (the two stub tests).

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts src/core/__tests__/helpers.ts src/core/__tests__/analyzer.test.ts src/core/__tests__/cleaner.test.ts package.json package-lock.json
git commit -m "chore: add Vitest + test helpers"
```

---

## Task 2: Extend `types.ts`

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add 4 new IssueIds and `cleanedHeaders` to CleanResult**

Replace the `IssueId` type and `CleanResult` interface with:

```typescript
export type IssueId =
  | 'empty-rows'
  | 'duplicate-rows'
  | 'whitespace'
  | 'mixed-case'
  | 'mixed-types'
  | 'mixed-dates'
  | 'mixed-booleans'
  | 'special-chars'
  | 'currency-numbers'
  | 'header-issues'
  | 'contact-formats'
  | 'sparse-columns';

export interface CleanResult {
  rows: Row[];
  removedRowIndices: number[];
  changes: CellChange[];
  appliedFixes: IssueId[];
  cleanedHeaders?: string[];  // present when header-issues or sparse-columns was applied
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add 4 new IssueIds and cleanedHeaders to CleanResult"
```

---

## Task 3: `currency-numbers` detector + fix

**Files:**
- Modify: `src/core/analyzer.ts`
- Modify: `src/core/cleaner.ts`
- Modify: `src/core/__tests__/analyzer.test.ts`
- Modify: `src/core/__tests__/cleaner.test.ts`

- [ ] **Step 1: Write failing detector test**

Append to `src/core/__tests__/analyzer.test.ts`:

```typescript
import { analyze } from '../analyzer';

describe('detectCurrencyNumbers', () => {
  it('flags a column where majority of values have currency symbols', () => {
    const file = makeFile(
      ['Cost'],
      [['$1,200.00'], ['$850.00'], ['€ 950.50'], ['$2,100.00'], ['$300.00']]
    );
    const issues = analyze(file);
    const issue = issues.find(i => i.id === 'currency-numbers');
    expect(issue).toBeDefined();
    expect(issue!.affectedColumns).toContain('Cost');
  });

  it('flags a column with thousands-separator commas but no symbol', () => {
    const file = makeFile(
      ['Revenue'],
      [['1,200'], ['2,500'], ['3,100'], ['4,200'], ['1,800']]
    );
    const issues = analyze(file);
    const issue = issues.find(i => i.id === 'currency-numbers');
    expect(issue).toBeDefined();
  });

  it('does not flag a plain numeric column', () => {
    const file = makeFile(
      ['Score'],
      [['95'], ['87'], ['72'], ['100'], ['88']]
    );
    const issues = analyze(file);
    expect(issues.find(i => i.id === 'currency-numbers')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test -- --reporter=verbose
```

Expected: fails with `issue is undefined`.

- [ ] **Step 3: Add detector to `analyzer.ts`**

Add the following function before the `/* Public — run all detectors */` section in `analyzer.ts`:

```typescript
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
```

Register it in the `detectors` array inside `analyze()`:

```typescript
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
  // ...rest unchanged
}
```

- [ ] **Step 4: Run detector test — expect PASS**

```bash
npm test -- --reporter=verbose
```

Expected: `detectCurrencyNumbers` tests pass.

- [ ] **Step 5: Write failing fix test**

Append to `src/core/__tests__/cleaner.test.ts`:

```typescript
import { clean } from '../cleaner';

describe('clean — currency-numbers', () => {
  it('strips leading currency symbol and commas', () => {
    const file = makeFile(
      ['Cost'],
      [['$1,200.00'], ['€ 850'], ['1,000'], ['300']]
    );
    const result = clean(file, { enabled: new Set(['currency-numbers']) });
    expect(result.rows[0][0]).toBe('1200.00');
    expect(result.rows[1][0]).toBe('850');
    expect(result.rows[2][0]).toBe('1000');
    expect(result.rows[3][0]).toBe('300');
  });

  it('leaves non-numeric values untouched', () => {
    const file = makeFile(['Name'], [['Alice'], ['Bob']]);
    const result = clean(file, { enabled: new Set(['currency-numbers']) });
    expect(result.rows[0][0]).toBe('Alice');
  });
});
```

- [ ] **Step 6: Run — expect FAIL**

```bash
npm test -- --reporter=verbose
```

Expected: fails because `currency-numbers` fix is not implemented.

- [ ] **Step 7: Add fix function and register it in `cleaner.ts`**

Add this function in the *Cell-level transforms* section of `cleaner.ts`:

```typescript
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
```

In the cell-level transform block inside `clean()`, add after the `mixed-case` block:

```typescript
if (enabled.has('currency-numbers')) {
  const fixed = fixCurrencyNumber(next);
  if (fixed !== next) next = fixed;
}
```

Also add `'currency-numbers'` to `pickReason()`:

```typescript
function pickReason(before: string, after: string): IssueId {
  if (before.trim() === after && before !== after) return 'whitespace';
  if (after === '') return 'mixed-types';
  if (/^\d{4}-\d{2}-\d{2}/.test(after) && !/^\d{4}-\d{2}-\d{2}/.test(before)) return 'mixed-dates';
  if (/^(true|false)$/i.test(after) && !/^(true|false)$/i.test(before)) return 'mixed-booleans';
  if (after.toLowerCase() === before.toLowerCase() && after !== before) return 'mixed-case';
  if (/^-?\d+(\.\d+)?$/.test(after) && /[£$€¥R,]/.test(before)) return 'currency-numbers';
  return 'special-chars';
}
```

- [ ] **Step 8: Run fix test — expect PASS**

```bash
npm test -- --reporter=verbose
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/core/analyzer.ts src/core/cleaner.ts src/core/__tests__/analyzer.test.ts src/core/__tests__/cleaner.test.ts
git commit -m "feat: add currency-numbers detector and fix"
```

---

## Task 4: `header-issues` detector + fix

**Files:**
- Modify: `src/core/analyzer.ts`
- Modify: `src/core/cleaner.ts`
- Modify: `src/core/__tests__/analyzer.test.ts`
- Modify: `src/core/__tests__/cleaner.test.ts`

- [ ] **Step 1: Write failing detector tests**

Append to `src/core/__tests__/analyzer.test.ts`:

```typescript
describe('detectHeaderIssues', () => {
  it('flags headers with leading/trailing whitespace', () => {
    const file = makeFile([' Name ', 'Age'], [['Alice', '30']]);
    const issues = analyze(file);
    expect(issues.find(i => i.id === 'header-issues')).toBeDefined();
  });

  it('flags duplicate headers (case-insensitive)', () => {
    const file = makeFile(['name', 'Name'], [['Alice', 'Smith']]);
    const issues = analyze(file);
    expect(issues.find(i => i.id === 'header-issues')).toBeDefined();
  });

  it('flags mixed casing conventions', () => {
    const file = makeFile(['first_name', 'LastName', 'AGE'], [['Alice', 'Smith', '30']]);
    const issues = analyze(file);
    expect(issues.find(i => i.id === 'header-issues')).toBeDefined();
  });

  it('does not flag clean consistent headers', () => {
    const file = makeFile(['First Name', 'Last Name', 'Age'], [['Alice', 'Smith', '30']]);
    const issues = analyze(file);
    expect(issues.find(i => i.id === 'header-issues')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test -- --reporter=verbose
```

- [ ] **Step 3: Add detector to `analyzer.ts`**

Add before the `/* Public */` section:

```typescript
function detectHeaderIssues(file: ParsedFile): Issue | null {
  const trimmed = file.headers.map(h => h.trim());

  const hasWhitespace = file.headers.some((h, i) => h !== trimmed[i]);

  const seenLower = new Set<string>();
  let hasDuplicates = false;
  for (const h of trimmed) {
    const k = h.toLowerCase();
    if (seenLower.has(k)) { hasDuplicates = true; break; }
    seenLower.add(k);
  }

  const casingTypes = new Set<string>();
  for (const h of trimmed) {
    if (!h) continue;
    if (/^[a-z][a-zA-Z0-9]*$/.test(h) && /[A-Z]/.test(h)) casingTypes.add('camel');
    else if (/^[a-z][a-z0-9_]*$/.test(h)) casingTypes.add('snake');
    else if (/^[A-Z][a-z]/.test(h)) casingTypes.add('title');
    else if (/^[A-Z][A-Z0-9_]*$/.test(h)) casingTypes.add('upper');
  }
  const hasMixedCasing = casingTypes.size > 1;

  if (!hasWhitespace && !hasDuplicates && !hasMixedCasing) return null;

  const problems: string[] = [];
  if (hasWhitespace) problems.push('whitespace');
  if (hasDuplicates) problems.push('duplicates');
  if (hasMixedCasing) problems.push('mixed naming conventions');

  return {
    id: 'header-issues',
    label: 'Header formatting',
    description: `Column headers have ${problems.join(', ')}. Cleaning will trim whitespace, deduplicate (appending _2, _3…), and normalise to Title Case.`,
    severity: 'low',
    count: file.headers.length,
    affectedColumns: [],
    enabled: true,
  };
}
```

Register in `analyze()`:

```typescript
const detectors = [
  detectEmptyRows,
  detectDuplicateRows,
  detectWhitespace,
  detectMixedDates,
  detectMixedTypes,
  detectMixedCase,
  detectMixedBooleans,
  detectSpecialChars,
  detectCurrencyNumbers,
  detectHeaderIssues,  // NEW
];
```

- [ ] **Step 4: Run detector tests — expect PASS**

```bash
npm test -- --reporter=verbose
```

- [ ] **Step 5: Write failing fix tests**

Append to `src/core/__tests__/cleaner.test.ts`:

```typescript
describe('clean — header-issues', () => {
  it('trims whitespace from headers', () => {
    const file = makeFile([' Name ', ' Age '], [['Alice', '30']]);
    const result = clean(file, { enabled: new Set(['header-issues']) });
    expect(result.cleanedHeaders).toEqual(['Name', 'Age']);
  });

  it('title-cases headers', () => {
    const file = makeFile(['first_name', 'last_name'], [['Alice', 'Smith']]);
    const result = clean(file, { enabled: new Set(['header-issues']) });
    expect(result.cleanedHeaders![0]).toBe('First_Name');
  });

  it('deduplicates colliding headers', () => {
    const file = makeFile(['name', 'Name'], [['Alice', 'Smith']]);
    const result = clean(file, { enabled: new Set(['header-issues']) });
    expect(result.cleanedHeaders).toEqual(['Name', 'Name_2']);
  });

  it('returns undefined cleanedHeaders when fix not applied', () => {
    const file = makeFile(['Name', 'Age'], [['Alice', '30']]);
    const result = clean(file, { enabled: new Set([]) });
    expect(result.cleanedHeaders).toBeUndefined();
  });
});
```

- [ ] **Step 6: Run — expect FAIL**

```bash
npm test -- --reporter=verbose
```

- [ ] **Step 7: Add fix functions and structural pre-pass to `cleaner.ts`**

Add these helper functions near the top of `cleaner.ts` (after imports):

```typescript
/* ───────────────────────────────────────────────────
   Structural transforms (header / column level)
─────────────────────────────────────────────────── */

function fixHeaders(headers: string[]): string[] {
  // 1. Trim
  const trimmed = headers.map(h => h.trim());
  // 2. Title-case
  const titled = trimmed.map(h =>
    h.replace(/\b\w+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase())
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
```

In the `clean()` function, add a structural pre-pass **before** Step 1 (row-level filters):

```typescript
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
  const workingFile: ParsedFile = headersChanged
    ? { ...file, headers: workingHeaders }
    : file;

  const removedRowIndices: number[] = [];
  const changes: CellChange[] = [];

  /* Step 1 — row-level filters (unchanged, but use workingFile.rows) */
  const seen = new Set<string>();
  const keptRows: Array<{ row: Row; originalIdx: number }> = [];

  workingFile.rows.forEach((row, idx) => {
    if (enabled.has('empty-rows') && isRowEmpty(row)) {
      removedRowIndices.push(idx);
      return;
    }
    if (enabled.has('duplicate-rows')) {
      const key = row.map((c) => (c ?? '').trim()).join(' ');
      if (seen.has(key) && !isRowEmpty(row)) {
        removedRowIndices.push(idx);
        return;
      }
      seen.add(key);
    }
    keptRows.push({ row: [...row], originalIdx: idx });
  });

  /* Step 2 — cell-level transforms (unchanged body, uses workingFile.headers) */
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

      if (next !== before) {
        changes.push({ rowIndex: originalIdx, colIndex: c, before, after: next, reason: pickReason(before, next) });
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
```

- [ ] **Step 8: Run fix tests — expect PASS**

```bash
npm test -- --reporter=verbose
```

- [ ] **Step 9: Commit**

```bash
git add src/core/analyzer.ts src/core/cleaner.ts src/core/__tests__/analyzer.test.ts src/core/__tests__/cleaner.test.ts
git commit -m "feat: add header-issues detector and fix with cleanedHeaders output"
```

---

## Task 5: `contact-formats` detector + fix

**Files:**
- Modify: `src/core/analyzer.ts`
- Modify: `src/core/cleaner.ts`
- Modify: `src/core/__tests__/analyzer.test.ts`
- Modify: `src/core/__tests__/cleaner.test.ts`

- [ ] **Step 1: Write failing detector tests**

Append to `src/core/__tests__/analyzer.test.ts`:

```typescript
describe('detectContactFormats', () => {
  it('flags a phone column with 3+ distinct formats', () => {
    const file = makeFile(
      ['Phone'],
      [
        ['+27 82 123 4567'],
        ['082-123-4567'],
        ['(082) 123 4567'],
        ['0821234567'],
        ['+27821234567'],
        ['082 123 4567'],
      ]
    );
    const issues = analyze(file);
    expect(issues.find(i => i.id === 'contact-formats')).toBeDefined();
  });

  it('flags an email column with invalid addresses', () => {
    const file = makeFile(
      ['Email'],
      [
        ['alice@example.com'],
        ['bob@example.com'],
        ['not-an-email'],
        ['carol@example.com'],
        ['dave@example.com'],
      ]
    );
    const issues = analyze(file);
    expect(issues.find(i => i.id === 'contact-formats')).toBeDefined();
  });

  it('does not flag a column that is not phone or email', () => {
    const file = makeFile(
      ['Notes'],
      [['foo'], ['bar'], ['baz'], ['qux'], ['quux']]
    );
    const issues = analyze(file);
    expect(issues.find(i => i.id === 'contact-formats')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test -- --reporter=verbose
```

- [ ] **Step 3: Add detector to `analyzer.ts`**

Add before the `/* Public */` section:

```typescript
const PHONE_DETECT_RE = /^[\+\d][\d\s\-\(\)\.]{6,}$/;
const EMAIL_BASIC_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getPhoneFormatKey(v: string): string {
  if (/^\+/.test(v)) return 'intl-plus';
  if (/^\d{3}\s\d{3}\s\d{4}$/.test(v)) return 'spaced';
  if (/^\d{3}-\d{3}-\d{4}$/.test(v)) return 'dashed';
  if (/^\(\d{3}\)\s?\d{3}[-\s]?\d{4}$/.test(v)) return 'parens';
  if (/^\d{10}$/.test(v)) return 'bare10';
  if (/^\d{11}$/.test(v)) return 'bare11';
  return 'other';
}

function detectContactFormats(file: ParsedFile): Issue | null {
  const affected: string[] = [];
  let totalCells = 0;

  for (let c = 0; c < file.headers.length; c++) {
    const nonEmpty = file.rows
      .map(r => (r[c] ?? '').trim())
      .filter(Boolean);
    if (nonEmpty.length < 5) continue;

    // Phone check
    const phoneMatches = nonEmpty.filter(v => PHONE_DETECT_RE.test(v));
    if (phoneMatches.length / nonEmpty.length >= 0.4) {
      const formats = new Set(phoneMatches.map(getPhoneFormatKey));
      if (formats.size >= 3) {
        affected.push(file.headers[c] ?? `col_${c}`);
        totalCells += phoneMatches.length;
        continue;
      }
    }

    // Email check
    const emailMatches = nonEmpty.filter(v => v.includes('@'));
    if (emailMatches.length / nonEmpty.length >= 0.4) {
      const invalidEmails = nonEmpty.filter(v => v.includes('@') && !EMAIL_BASIC_RE.test(v));
      if (invalidEmails.length > 0) {
        affected.push(file.headers[c] ?? `col_${c}`);
        totalCells += invalidEmails.length;
      }
    }
  }

  if (affected.length === 0) return null;

  return {
    id: 'contact-formats',
    label: 'Phone / email formats',
    description: `${affected.length} column${affected.length === 1 ? ' has' : 's have'} inconsistent phone number formats or invalid email addresses. Phone numbers will be normalised; invalid emails will be cleared to empty.`,
    severity: 'medium',
    count: totalCells,
    affectedColumns: affected,
    enabled: false,
  };
}
```

Register in `analyze()`:

```typescript
const detectors = [
  detectEmptyRows,
  detectDuplicateRows,
  detectWhitespace,
  detectMixedDates,
  detectMixedTypes,
  detectMixedCase,
  detectMixedBooleans,
  detectSpecialChars,
  detectCurrencyNumbers,
  detectHeaderIssues,
  detectContactFormats,  // NEW
];
```

- [ ] **Step 4: Run detector tests — expect PASS**

```bash
npm test -- --reporter=verbose
```

- [ ] **Step 5: Write failing fix tests**

Append to `src/core/__tests__/cleaner.test.ts`:

```typescript
describe('clean — contact-formats', () => {
  it('normalises SA local phone numbers', () => {
    const file = makeFile(
      ['Phone'],
      [['0821234567'], ['082-123-4567'], ['(082) 123 4567'], ['+27821234567'], ['082 123 4567']]
    );
    const result = clean(file, { enabled: new Set(['contact-formats']) });
    expect(result.rows[0][0]).toBe('082 123 4567');
  });

  it('clears invalid email cells', () => {
    const file = makeFile(
      ['Email'],
      [
        ['alice@example.com'],
        ['not-an-email'],
        ['bob@example.com'],
        ['also-invalid'],
        ['carol@example.com'],
      ]
    );
    const result = clean(file, { enabled: new Set(['contact-formats']) });
    expect(result.rows[0][0]).toBe('alice@example.com'); // valid — unchanged
    expect(result.rows[1][0]).toBe('not-an-email');      // no @ — not cleared
    expect(result.rows[3][0]).toBe('also-invalid');      // no @ — not cleared
  });
});
```

- [ ] **Step 6: Run — expect FAIL**

```bash
npm test -- --reporter=verbose
```

- [ ] **Step 7: Add fix to `cleaner.ts`**

Add helper functions in the *Structural transforms* section:

```typescript
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
  // Has + prefix
  if (hasPlus && digits.length >= 10) {
    return `+${digits}`;
  }
  return digits.length > 0 ? digits : value;
}

type ContactColType = 'phone' | 'email' | 'other';

function classifyContactColumns(
  headers: string[],
  rows: Row[]
): ContactColType[] {
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
```

Add the `PHONE_DETECT_RE` and `EMAIL_BASIC_RE` constants at the top of `cleaner.ts` (after imports):

```typescript
const PHONE_DETECT_RE = /^[\+\d][\d\s\-\(\)\.]{6,}$/;
const EMAIL_BASIC_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
```

In `clean()`, add contact pre-computation before the main cell loop (after the `workingFile` is established), and add the transform inside Step 2:

Before the `keptRows.push` loop (or just before Step 2), add:
```typescript
// Pre-compute contact column types if needed (O(n) per column, done once)
const contactColTypes: ContactColType[] | null = enabled.has('contact-formats')
  ? classifyContactColumns(workingFile.headers, workingFile.rows)
  : null;
```

Inside the cell transform block in Step 2, add after `currency-numbers`:
```typescript
if (enabled.has('contact-formats') && contactColTypes) {
  const colType = contactColTypes[c];
  if (colType === 'phone' && PHONE_DETECT_RE.test(next)) {
    const fixed = normalisePhone(next);
    if (fixed !== next) next = fixed;
  } else if (colType === 'email' && next.includes('@') && !EMAIL_BASIC_RE.test(next)) {
    next = '';
  }
}
```

Also add `'contact-formats'` handling to `pickReason()`:
```typescript
if (colType === 'phone' && ...) return 'contact-formats';
```

Actually the simplest addition to `pickReason`:
```typescript
function pickReason(before: string, after: string): IssueId {
  if (before.trim() === after && before !== after) return 'whitespace';
  if (after === '' && before.includes('@')) return 'contact-formats';
  if (after === '') return 'mixed-types';
  if (/^\d{4}-\d{2}-\d{2}/.test(after) && !/^\d{4}-\d{2}-\d{2}/.test(before)) return 'mixed-dates';
  if (/^(true|false)$/i.test(after) && !/^(true|false)$/i.test(before)) return 'mixed-booleans';
  if (after.toLowerCase() === before.toLowerCase() && after !== before) return 'mixed-case';
  if (/^-?\d+(\.\d+)?$/.test(after) && /[£$€¥R,]/.test(before)) return 'currency-numbers';
  if (PHONE_DETECT_RE.test(before) && /^\d[\d\s+]+$/.test(after)) return 'contact-formats';
  return 'special-chars';
}
```

- [ ] **Step 8: Run fix tests — expect PASS**

```bash
npm test -- --reporter=verbose
```

- [ ] **Step 9: Commit**

```bash
git add src/core/analyzer.ts src/core/cleaner.ts src/core/__tests__/analyzer.test.ts src/core/__tests__/cleaner.test.ts
git commit -m "feat: add contact-formats detector and fix"
```

---

## Task 6: `sparse-columns` detector + fix

**Files:**
- Modify: `src/core/analyzer.ts`
- Modify: `src/core/cleaner.ts`
- Modify: `src/core/__tests__/analyzer.test.ts`
- Modify: `src/core/__tests__/cleaner.test.ts`

- [ ] **Step 1: Write failing detector tests**

Append to `src/core/__tests__/analyzer.test.ts`:

```typescript
describe('detectSparseColumns', () => {
  it('flags a column that is 80%+ empty', () => {
    const file = makeFile(
      ['Name', 'Notes'],
      [
        ['Alice', ''],
        ['Bob', ''],
        ['Carol', 'Has a note'],
        ['Dave', ''],
        ['Eve', ''],
      ]
    );
    const issues = analyze(file);
    const issue = issues.find(i => i.id === 'sparse-columns');
    expect(issue).toBeDefined();
    expect(issue!.affectedColumns).toContain('Notes');
    expect(issue!.affectedColumns).not.toContain('Name');
  });

  it('does not flag a column with data', () => {
    const file = makeFile(
      ['Name', 'Age'],
      [['Alice', '30'], ['Bob', '25'], ['Carol', '35']]
    );
    expect(analyze(file).find(i => i.id === 'sparse-columns')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test -- --reporter=verbose
```

- [ ] **Step 3: Add detector to `analyzer.ts`**

```typescript
function detectSparseColumns(file: ParsedFile): Issue | null {
  if (file.rows.length === 0) return null;
  const THRESHOLD = 0.8;
  const affected: string[] = [];

  for (let c = 0; c < file.headers.length; c++) {
    const emptyCount = file.rows.filter(row => (row[c] ?? '').trim() === '').length;
    if (emptyCount / file.rows.length >= THRESHOLD) {
      affected.push(file.headers[c] ?? `col_${c}`);
    }
  }

  if (affected.length === 0) return null;

  const wouldRemoveAll = affected.length >= file.headers.length;
  const description = wouldRemoveAll
    ? `${affected.length} column${affected.length === 1 ? ' is' : 's are'} ≥ 80% empty. Cannot remove — all columns would be deleted.`
    : `${affected.length} column${affected.length === 1 ? ' is' : 's are'} ≥ 80% empty and can be safely removed.`;

  return {
    id: 'sparse-columns',
    label: 'Sparse columns',
    description,
    severity: 'low',
    count: affected.length,
    affectedColumns: affected,
    enabled: false,
  };
}
```

Register in `analyze()`:

```typescript
const detectors = [
  detectEmptyRows,
  detectDuplicateRows,
  detectWhitespace,
  detectMixedDates,
  detectMixedTypes,
  detectMixedCase,
  detectMixedBooleans,
  detectSpecialChars,
  detectCurrencyNumbers,
  detectHeaderIssues,
  detectContactFormats,
  detectSparseColumns,  // NEW
];
```

- [ ] **Step 4: Run detector tests — expect PASS**

```bash
npm test -- --reporter=verbose
```

- [ ] **Step 5: Write failing fix tests**

Append to `src/core/__tests__/cleaner.test.ts`:

```typescript
describe('clean — sparse-columns', () => {
  it('removes columns that are 80%+ empty', () => {
    const file = makeFile(
      ['Name', 'Notes', 'Age'],
      [
        ['Alice', '', '30'],
        ['Bob', '', '25'],
        ['Carol', 'a note', '35'],
        ['Dave', '', '40'],
        ['Eve', '', '28'],
      ]
    );
    const result = clean(file, { enabled: new Set(['sparse-columns']) });
    expect(result.cleanedHeaders).toEqual(['Name', 'Age']);
    expect(result.rows[0]).toEqual(['Alice', '30']);
  });

  it('does NOT remove columns if it would leave zero columns', () => {
    const file = makeFile(
      ['Notes'],
      [[''], [''], ['x'], [''], ['']]
    );
    const result = clean(file, { enabled: new Set(['sparse-columns']) });
    // Guard fires: should keep the column
    expect(result.cleanedHeaders).toBeUndefined();
    expect(result.rows[0]).toEqual(['']);
  });
});
```

- [ ] **Step 6: Run — expect FAIL**

```bash
npm test -- --reporter=verbose
```

- [ ] **Step 7: Add sparse-columns fix to `cleaner.ts`**

Add the following helper in the *Structural transforms* section of `cleaner.ts`:

```typescript
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
```

In `clean()`, add sparse-columns processing inside the structural pre-pass block (after header-issues):

```typescript
if (enabled.has('sparse-columns')) {
  const { headers: sh, rows: sr, changed } = removeSparseColumns(
    workingHeaders,
    workingFile.rows
  );
  if (changed) {
    workingHeaders = sh;
    // Replace the rows in workingFile with sparse-removed rows
    workingFile = { ...workingFile, headers: workingHeaders, rows: sr };
    headersChanged = true;
  }
}
```

Note: `workingFile` must be declared with `let` in the pre-pass so it can be reassigned:

Change `const workingFile` to `let workingFile` in the pre-pass code from Task 4.

- [ ] **Step 8: Run fix tests — expect PASS**

```bash
npm test -- --reporter=verbose
```

- [ ] **Step 9: Commit**

```bash
git add src/core/analyzer.ts src/core/cleaner.ts src/core/__tests__/analyzer.test.ts src/core/__tests__/cleaner.test.ts
git commit -m "feat: add sparse-columns detector and fix with column removal"
```

---

## Task 7: Wire `cleanedHeaders` into export and preview

**Files:**
- Modify: `src/core/exporter.ts`
- Modify: `src/ui/preview-table.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Update `exporter.ts` to accept optional headers param**

Replace the `exportCsv` function signature:

```typescript
export function exportCsv(
  file: ParsedFile,
  rows: Row[],
  filename: string,
  delimiter: string = file.delimiter,
  headers: string[] = file.headers
): void {
  const csv = Papa.unparse(
    { fields: headers, data: rows },
    { delimiter, quotes: false, newline: '\r\n' }
  );
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 250);
}
```

- [ ] **Step 2: Add `displayHeaders` option to `PreviewOptions` in `preview-table.ts`**

Update the `PreviewOptions` interface:

```typescript
interface PreviewOptions {
  mode: 'original' | 'cleaned';
  changedCells?: Set<string>;
  removedRowIndices?: Set<number>;
  displayHeaders?: string[];   // NEW: overrides file.headers when set
}
```

Inside `renderPreviewTable`, replace `file.headers.map(...)` for header cells with:

```typescript
const headers = opts.displayHeaders ?? file.headers;
const headerCells = headers.map((h) =>
  `<th>${escapeHtml(h || '(blank)')}</th>`
).join('');
```

Also update the count line to use `headers.length`:
```typescript
`${rows.length.toLocaleString()} row${rows.length === 1 ? '' : 's'} · ${headers.length} column${headers.length === 1 ? '' : 's'}${hidden > 0 ? ` · showing first ${visibleRows.length}` : ''}`
```

- [ ] **Step 3: Update `main.ts` to pass `displayHeaders` and use them in export**

In `render()`, where `renderPreviewTable` is called, add `displayHeaders`:

```typescript
const displayHeaders = state.result?.cleanedHeaders ?? state.parsed!.headers;

grid.appendChild(renderPreviewTable(
  state.parsed!,
  state.result ? state.result.rows : state.parsed!.rows,
  {
    mode: state.result ? 'cleaned' : 'original',
    changedCells,
    removedRowIndices: removedRowSet,
    displayHeaders,   // NEW
  }
));
```

Update `handleExport` to use `displayHeaders` and pass to `exportCsv`:

```typescript
function handleExport() {
  if (!state.parsed || !state.result) return;
  const displayHeaders = state.result.cleanedHeaders ?? state.parsed.headers;
  const filename = suggestFilename(state.parsed.filename);
  exportCsv(state.parsed, state.result.rows, filename, state.parsed.delimiter, displayHeaders);
  showToast(`Downloaded ${filename}`, 'success');
}
```

- [ ] **Step 4: Run TypeScript check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Smoke test in browser**

```bash
npm run dev
```

Open `http://localhost:5174`. Upload a CSV, apply header-issues fix, verify the preview table shows cleaned headers and the download uses them.

- [ ] **Step 6: Commit**

```bash
git add src/core/exporter.ts src/ui/preview-table.ts src/main.ts
git commit -m "feat: wire cleanedHeaders into preview table and CSV export"
```

---

## Task 8: Add analysis state to `main.ts`

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add `activeColumn` and `columnFilters` to `AppState`**

Update the `AppState` interface and initial state:

```typescript
interface AppState {
  parsed: ParsedFile | null;
  issues: Issue[];
  result: CleanResult | null;
  toast: { message: string; tone: 'info' | 'error' | 'success' } | null;
  activeColumn: string | null;
  columnFilters: Map<string, string>;
}

const state: AppState = {
  parsed: null,
  issues: [],
  result: null,
  toast: null,
  activeColumn: null,
  columnFilters: new Map(),
};
```

- [ ] **Step 2: Add `getFilteredRows` helper function**

Add this function after the `state` declaration:

```typescript
function getFilteredRows(rows: Row[], headers: string[], filters: Map<string, string>): Row[] {
  if (filters.size === 0) return rows;
  return rows.filter(row =>
    Array.from(filters.entries()).every(([col, val]) => {
      if (!val) return true;
      const idx = headers.indexOf(col);
      if (idx === -1) return true;
      return (row[idx] ?? '').toLowerCase().includes(val.toLowerCase());
    })
  );
}
```

- [ ] **Step 3: Add analysis event handlers**

Add these functions in the Handlers section:

```typescript
function handleColumnClick(header: string) {
  state.activeColumn = state.activeColumn === header ? null : header;
  render();
}

function handleFilterChange(column: string, value: string) {
  if (value) {
    state.columnFilters.set(column, value);
  } else {
    state.columnFilters.delete(column);
  }
  render();
}

function handleClearFilters() {
  state.columnFilters = new Map();
  render();
}
```

- [ ] **Step 4: Reset analysis state in `handleFile`, `handleRevert`, and `handleReset`**

In `handleFile`, after `state.result = null;`, add:
```typescript
state.activeColumn = null;
state.columnFilters = new Map();
```

In `handleRevert`, after `state.result = null;`, add:
```typescript
state.activeColumn = null;
state.columnFilters = new Map();
```

In `handleReset`, after `state.result = null;`, add:
```typescript
state.activeColumn = null;
state.columnFilters = new Map();
```

- [ ] **Step 5: Run TypeScript check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts
git commit -m "feat(main): add analysis state, getFilteredRows, and event handlers"
```

---

## Task 9: Create `analysis-toolbar.ts`

**Files:**
- Create: `src/ui/analysis-toolbar.ts`

- [ ] **Step 1: Create the component**

```typescript
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
      sel.addEventListener('change', () => cb.onFilterChange(sel.dataset.col!, sel.value));
    });

    let debounceTimer: ReturnType<typeof setTimeout>;
    bar.querySelectorAll<HTMLInputElement>('.ab-input').forEach(input => {
      input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => cb.onFilterChange(input.dataset.col!, input.value), DEBOUNCE_MS);
      });
    });

    bar.querySelector<HTMLButtonElement>('.ab-clear')?.addEventListener('click', cb.onClearAll);
  }, 0);

  return bar;
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/analysis-toolbar.ts
git commit -m "feat: add analysis-toolbar component with per-column filter controls"
```

---

## Task 10: Update `preview-table.ts` — column click + aggregation footer

**Files:**
- Modify: `src/ui/preview-table.ts`

- [ ] **Step 1: Replace the full file with the updated version**

```typescript
/**
 * Preview table — renders the current dataset with optional analysis overlay.
 *
 * Enhancements over the original:
 *   • displayHeaders  — shows cleaned headers when header-issues / sparse-columns ran
 *   • activeColumn    — highlights the selected column + shows aggregation footer
 *   • onColumnClick   — callback for column header clicks
 *   • columnFilters / onFilterChange / onClearFilters — passed through to toolbar
 *   • allRows         — unfiltered rows for computing dropdown options
 */

import type { ParsedFile, Row } from '../types';
import { escapeHtml, truncate } from '../lib/format';
import { renderAnalysisToolbar, type ToolbarCallbacks } from './analysis-toolbar';

const MAX_PREVIEW_ROWS = 150;

interface PreviewOptions {
  mode: 'original' | 'cleaned';
  changedCells?: Set<string>;
  removedRowIndices?: Set<number>;
  displayHeaders?: string[];
  activeColumn?: string | null;
  onColumnClick?: (header: string) => void;
  columnFilters?: Map<string, string>;
  allRows?: Row[];
  onFilterChange?: (column: string, value: string) => void;
  onClearFilters?: () => void;
}

/* ── Aggregation ── */

interface ColAggregates {
  sum: number | null;
  avg: number | null;
  count: number;
  min: string;
  max: string;
  isNumeric: boolean;
}

function computeAggregates(rows: Row[], colIndex: number): ColAggregates {
  const values = rows.map(r => (r[colIndex] ?? '').trim()).filter(Boolean);
  if (values.length === 0) {
    return { sum: null, avg: null, count: 0, min: '—', max: '—', isNumeric: false };
  }

  const nums = values.map(v => parseFloat(v.replace(/,/g, '')));
  const validNums = nums.filter(n => !isNaN(n));
  const isNumeric = validNums.length / values.length >= 0.5;

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

function buildTfoot(headers: string[], rows: Row[], activeColumn: string): string {
  const colIndex = headers.indexOf(activeColumn);
  if (colIndex === -1) return '';

  const agg = computeAggregates(rows, colIndex);

  const cells = headers.map((_, i) => {
    if (i !== colIndex) return `<td class="agg-cell"></td>`;
    return `
      <td class="agg-cell agg-cell--active">
        <div class="agg-stats">
          <span class="agg-stat"><span class="agg-label">Sum</span>${agg.isNumeric ? fmt(agg.sum!) : '—'}</span>
          <span class="agg-stat"><span class="agg-label">Avg</span>${agg.isNumeric ? fmt(agg.avg!) : '—'}</span>
          <span class="agg-stat"><span class="agg-label">Count</span>${agg.count.toLocaleString()}</span>
          <span class="agg-stat"><span class="agg-label">Min</span>${escapeHtml(agg.min)}</span>
          <span class="agg-stat"><span class="agg-label">Max</span>${escapeHtml(agg.max)}</span>
        </div>
      </td>`;
  }).join('');

  return `<tfoot class="preview-tfoot"><tr>${cells}</tr></tfoot>`;
}

/* ── Public ── */

export function renderPreviewTable(
  file: ParsedFile,
  rows: Row[],
  opts: PreviewOptions
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'preview';

  const headers = opts.displayHeaders ?? file.headers;
  const activeColumn = opts.activeColumn ?? null;
  const visibleRows = rows.slice(0, MAX_PREVIEW_ROWS);
  const hidden = rows.length - visibleRows.length;

  // ── Meta bar ──
  const meta = document.createElement('div');
  meta.className = 'preview-meta';
  meta.innerHTML = `
    <span class="preview-mode">${opts.mode === 'cleaned' ? 'After cleaning' : 'Original data'}</span>
    <span class="preview-count">${rows.length.toLocaleString()} row${rows.length === 1 ? '' : 's'} · ${headers.length} column${headers.length === 1 ? '' : 's'}${hidden > 0 ? ` · showing first ${visibleRows.length}` : ''}</span>
  `;
  wrap.appendChild(meta);

  // ── Analysis toolbar ──
  if (opts.onFilterChange) {
    const toolbar = renderAnalysisToolbar(
      headers,
      opts.allRows ?? rows,
      rows,
      opts.columnFilters ?? new Map(),
      {
        onFilterChange: opts.onFilterChange,
        onClearAll: opts.onClearFilters ?? (() => {}),
      } satisfies ToolbarCallbacks
    );
    wrap.appendChild(toolbar);
  }

  // ── Table ──
  const headerCells = headers.map((h, i) => {
    const isActive = activeColumn === h;
    return `<th class="${isActive ? 'th-active' : ''}" data-col="${escapeHtml(h)}">${escapeHtml(h || '(blank)')}</th>`;
  }).join('');

  // Empty-state row when filters produce zero results
  let bodyHtml: string;
  if (rows.length === 0) {
    bodyHtml = `<tr><td class="preview-empty-state" colspan="${headers.length}">No rows match the current filters.</td></tr>`;
  } else {
    bodyHtml = visibleRows.map((row, r) => {
      const cellsHtml = row.map((cell, c) => {
        const key = `${r}-${c}`;
        const changed = opts.changedCells?.has(key);
        const isActiveCol = activeColumn === headers[c];
        const classes = [changed ? 'cell-changed' : '', isActiveCol ? 'col-active' : ''].filter(Boolean).join(' ');
        return `<td class="${classes}" title="${escapeHtml(cell ?? '')}">${escapeHtml(truncate(cell ?? '', 80))}</td>`;
      }).join('');
      return `<tr>${cellsHtml}</tr>`;
    }).join('');
  }

  const tfootHtml = activeColumn ? buildTfoot(headers, rows, activeColumn) : '';

  const scrollDiv = document.createElement('div');
  scrollDiv.className = 'preview-scroll';
  scrollDiv.innerHTML = `
    <table class="preview-table">
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyHtml}</tbody>
      ${tfootHtml}
    </table>
  `;
  wrap.appendChild(scrollDiv);

  // ── Footer note ──
  if (hidden > 0) {
    const foot = document.createElement('div');
    foot.className = 'preview-foot';
    foot.textContent = `${hidden.toLocaleString()} more row${hidden === 1 ? '' : 's'} not shown — they'll all be processed when you export.`;
    wrap.appendChild(foot);
  }

  // ── Wire column header clicks ──
  if (opts.onColumnClick) {
    setTimeout(() => {
      wrap.querySelectorAll<HTMLElement>('thead th[data-col]').forEach(th => {
        th.addEventListener('click', () => opts.onColumnClick!(th.dataset.col!));
        th.style.cursor = 'pointer';
      });
    }, 0);
  }

  return wrap;
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/preview-table.ts
git commit -m "feat(preview-table): add column click, aggregation footer, and toolbar integration"
```

---

## Task 11: Wire analysis into `main.ts` render + export

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Update `render()` to pass analysis props to `renderPreviewTable`**

Replace the `renderPreviewTable(...)` call inside `render()`:

```typescript
const displayHeaders = state.result?.cleanedHeaders ?? state.parsed!.headers;
const displayRows = state.result ? state.result.rows : state.parsed!.rows;
const filteredRows = getFilteredRows(displayRows, displayHeaders, state.columnFilters);

grid.appendChild(renderPreviewTable(
  state.parsed!,
  filteredRows,
  {
    mode: state.result ? 'cleaned' : 'original',
    changedCells,
    removedRowIndices: removedRowSet,
    displayHeaders,
    activeColumn: state.activeColumn,
    onColumnClick: handleColumnClick,
    columnFilters: state.columnFilters,
    allRows: displayRows,
    onFilterChange: handleFilterChange,
    onClearFilters: handleClearFilters,
  }
));
```

- [ ] **Step 2: Update `renderFileBar` to show row count and disable download when empty**

Replace the export button HTML inside `renderFileBar`:

```typescript
const displayHeaders = state.result?.cleanedHeaders ?? state.parsed!.headers;
const displayRows = state.result ? state.result.rows : state.parsed!.rows;
const filteredRows = getFilteredRows(displayRows, displayHeaders, state.columnFilters);
const hasFilters = state.columnFilters.size > 0 && Array.from(state.columnFilters.values()).some(Boolean);
const exportLabel = hasFilters
  ? `Exporting ${filteredRows.length.toLocaleString()} rows (filtered)`
  : `Exporting ${filteredRows.length.toLocaleString()} rows`;
const downloadDisabled = filteredRows.length === 0;
```

Update the button HTML in `renderFileBar` to:

```typescript
${state.result ? `
  <button class="btn btn-ghost" id="filebar-revert" type="button">Revert to original</button>
  <div class="filebar-export-wrap">
    <span class="filebar-export-note">${exportLabel}</span>
    <button class="btn btn-primary" id="filebar-export" type="button" ${downloadDisabled ? 'disabled' : ''}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Download cleaned CSV
    </button>
  </div>
` : ''}
```

- [ ] **Step 3: Update `handleExport` to export filtered rows with correct headers**

```typescript
function handleExport() {
  if (!state.parsed || !state.result) return;
  const displayHeaders = state.result.cleanedHeaders ?? state.parsed.headers;
  const filteredRows = getFilteredRows(state.result.rows, displayHeaders, state.columnFilters);
  if (filteredRows.length === 0) return;
  const filename = suggestFilename(state.parsed.filename);
  exportCsv(state.parsed, filteredRows, filename, state.parsed.delimiter, displayHeaders);
  const hasFilters = state.columnFilters.size > 0 && Array.from(state.columnFilters.values()).some(Boolean);
  const msg = hasFilters
    ? `Downloaded ${filteredRows.length} filtered rows as ${filename}`
    : `Downloaded ${filename}`;
  showToast(msg, 'success');
}
```

- [ ] **Step 4: Add `renderAnalysisToolbar` import to `main.ts`** (not needed — toolbar is used inside `preview-table.ts`, not directly in `main.ts`)

- [ ] **Step 5: Run TypeScript check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 6: Smoke test in browser**

```bash
npm run dev
```

- Upload a CSV with a cost column (e.g. `$1,200`, `€850`).
- Verify the analysis toolbar appears above the table.
- Verify filtering a column updates the row count pill.
- Verify clicking a column header highlights it and shows the aggregation footer.
- Verify clicking the same header again hides the footer.
- Verify the download button is disabled when filters produce zero rows.

- [ ] **Step 7: Commit**

```bash
git add src/main.ts
git commit -m "feat(main): wire analysis toolbar, column click, and filter-aware export"
```

---

## Task 12: CSS for toolbar, active column, and aggregation footer

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Append new styles to `src/styles.css`**

Add the following block at the end of `src/styles.css`:

```css
/* ═══════════════════════════════════════════════════
   Analysis toolbar
   ═══════════════════════════════════════════════════ */

.analysis-bar {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
  background: rgba(8, 12, 28, 0.5);
}

.ab-controls {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  padding-bottom: 0.25rem;
  scrollbar-width: thin;
}

.ab-control {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 120px;
  flex-shrink: 0;
}

.ab-control--active .ab-select,
.ab-control--active .ab-input {
  border-left: 2px solid var(--accent);
}

.ab-label {
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

.ab-select,
.ab-input {
  background: var(--card-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font: inherit;
  font-size: 0.78rem;
  padding: 0.3rem 0.5rem;
  width: 100%;
  outline: none;
  transition: border-color 0.15s;
}

.ab-select:focus,
.ab-input:focus {
  border-color: var(--border-h);
}

.ab-status {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.5rem;
  font-size: 0.8rem;
}

.ab-pill {
  background: rgba(6, 182, 212, 0.12);
  color: var(--accent-l);
  border: 1px solid rgba(6, 182, 212, 0.25);
  border-radius: 100px;
  padding: 0.2rem 0.65rem;
  font-size: 0.75rem;
  font-weight: 500;
}

.ab-clear {
  background: none;
  border: none;
  color: var(--muted);
  font-size: 0.78rem;
  padding: 0;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: color 0.15s;
}

.ab-clear:hover {
  color: var(--text);
}

/* ═══════════════════════════════════════════════════
   Active column highlight
   ═══════════════════════════════════════════════════ */

.preview-table thead th {
  transition: background 0.15s, color 0.15s;
  user-select: none;
}

.preview-table thead th:hover {
  background: rgba(6, 182, 212, 0.06);
}

.preview-table thead th.th-active {
  color: var(--accent-l);
  border-bottom: 2px solid var(--accent);
}

.preview-table td.col-active {
  background: rgba(6, 182, 212, 0.05);
}

/* ═══════════════════════════════════════════════════
   Aggregation footer
   ═══════════════════════════════════════════════════ */

.preview-tfoot {
  position: sticky;
  bottom: 0;
  z-index: 2;
}

.preview-tfoot tr {
  background: var(--card-2);
  border-top: 1px solid var(--border-h);
}

.agg-cell {
  padding: 0.4rem 0.6rem;
}

.agg-cell--active {
  background: rgba(6, 182, 212, 0.08);
}

.agg-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 0.8rem;
}

.agg-stat {
  display: flex;
  flex-direction: column;
  font-size: 0.7rem;
  color: var(--text);
  white-space: nowrap;
}

.agg-label {
  font-size: 0.6rem;
  font-weight: 700;
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 0.1rem;
}

/* ═══════════════════════════════════════════════════
   Filebar export note + disabled download state
   ═══════════════════════════════════════════════════ */

.filebar-export-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
}

.filebar-export-note {
  font-size: 0.72rem;
  color: var(--muted);
}

.btn[disabled] {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: none;
}

/* ═══════════════════════════════════════════════════
   Empty filter state
   ═══════════════════════════════════════════════════ */

.preview-empty-state {
  text-align: center;
  color: var(--muted);
  padding: 2rem;
  font-size: 0.9rem;
}
```

- [ ] **Step 2: Full visual check in browser**

```bash
npm run dev
```

Verify:
1. Filter bar renders below the preview meta bar with compact labelled controls.
2. Selecting a filter shows the cyan-left-border highlight + "Showing X of Y rows" pill.
3. Clicking a column header turns the header text cyan with an underline.
4. Every cell in the active column has a subtle tint.
5. The aggregation footer row appears at the bottom of the table, sticky when scrolling.
6. Numeric columns show Sum/Avg/Count/Min/Max; text columns show `—` for Sum/Avg.
7. Download button greys out when filters produce zero rows.
8. No layout breakage on a file with 20+ columns (horizontal scroll works).

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "style: add analysis toolbar, active column, and aggregation footer styles"
```

---

## Task 13: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the "Issues detected" table**

Replace the existing issues table with:

```markdown
| Issue | What it spots |
|---|---|
| 🗑 **Empty rows** | Rows where every cell is blank |
| 📑 **Duplicate rows** | Exact-match duplicates of earlier rows |
| ⎵ **Whitespace** | Leading, trailing, or doubled-up whitespace in cells |
| 🔠 **Inconsistent capitalisation** | Same value in different casings (e.g. "London" + "LONDON") |
| 🔢 **Mixed data types** | Columns mixing numeric / text / blank-equivalents like "N/A" |
| 📅 **Mixed date formats** | Same column using ISO + US + European date formats |
| ✓ **Mixed booleans** | Same column using "Yes/No" + "True/False" + "1/0" |
| 𝒜 **Encoding artifacts** | Mojibake like `â€™` from UTF-8 / cp1252 round-trips |
| 💰 **Currency / number formatting** | Values like `$1,200.00` or `€ 850` that should be plain numbers |
| 🏷 **Header formatting** | Headers with extra whitespace, duplicates, or mixed naming conventions |
| 📞 **Phone / email formats** | Phone numbers in 3+ different formats; invalid email addresses |
| 🕳 **Sparse columns** | Columns that are ≥ 80% empty — candidates for removal |
```

- [ ] **Step 2: Add an "In-table analysis" section after "Issues detected"**

```markdown
### In-table analysis

Once a file is loaded, an **Analysis toolbar** appears above the preview table:

- **Filter any column** — low-cardinality columns (≤ 15 unique values) show a dropdown; all others get a text search. Active filters show a *Showing X of Y rows* pill.
- **Click any column header** to select it — a sticky **aggregation footer** appears with Sum, Avg, Count, Min, and Max computed over the currently filtered rows.
- **Download respects filters** — if filters are active, only the matching rows are exported.
```

- [ ] **Step 3: Update the Roadmap section** — remove items already shipped

```markdown
## Roadmap

- [ ] **Excel `.xlsx` support** via SheetJS (lazy-loaded chunk)
- [ ] **Custom rules** — let users define their own find/replace rules
- [ ] **Column-by-column type coercion** UI (parse this column as date / number / boolean)
- [ ] **Multi-condition filters** — AND/OR filter logic across columns
- [ ] **PWA install** — full offline support
- [ ] **i18n** — Spanish / French / German / Zulu
```

- [ ] **Step 4: Run TypeScript check and tests one final time**

```bash
npm run lint && npm test
```

Expected: no TypeScript errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: update README with new cleaners and in-table analysis feature"
```

---

## Self-Review

**Spec coverage:**
- ✅ `currency-numbers` — Task 3
- ✅ `header-issues` — Task 4
- ✅ `contact-formats` — Task 5
- ✅ `sparse-columns` — Task 6
- ✅ `cleanedHeaders` wired to preview + export — Task 7
- ✅ `activeColumn` / `columnFilters` state — Task 8
- ✅ Analysis toolbar component — Task 9
- ✅ Column click + aggregation footer — Task 10
- ✅ Filter-aware render + export — Task 11
- ✅ CSS — Task 12
- ✅ README — Task 13
- ✅ Edge: sparse guard (no all-column removal) — Task 6 Step 7
- ✅ Edge: empty filter state row — Task 10 Step 1
- ✅ Edge: disabled download on zero rows — Task 11 + Task 12
- ✅ Edge: text column shows `—` for Sum/Avg — Task 10 `computeAggregates`
- ✅ Edge: mixed currencies noted in description — Task 3 Step 3

**Placeholder scan:** No TBDs or TODOs.

**Type consistency:**
- `IssueId` new values used consistently in analyzer, cleaner, and tests.
- `CleanResult.cleanedHeaders` defined in Task 2, produced in Tasks 4/6, consumed in Tasks 7/11.
- `PreviewOptions` fields added in Task 7 and fully used in Task 10/11.
- `ToolbarCallbacks` defined in Task 9, used in Task 10.
- `getFilteredRows` defined in Task 8, called in Tasks 8 and 11.
