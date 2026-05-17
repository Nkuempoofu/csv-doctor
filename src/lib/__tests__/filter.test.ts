import { describe, it, expect } from 'vitest';
import { getFilteredRows } from '../filter';
import type { FilterSlot } from '../../types';

const headers = ['Name', 'Region', 'Cost'];
const rows = [
  ['Alice', 'ZA', '100'],
  ['Bob',   'US', '200'],
  ['Carol', 'ZA', '300'],
];

describe('getFilteredRows', () => {
  it('returns all rows when no slots have column set', () => {
    const slots: FilterSlot[] = [{ column: '', value: '' }];
    expect(getFilteredRows(rows, headers, slots)).toEqual(rows);
  });

  it('returns all rows when slot has column but empty value', () => {
    const slots: FilterSlot[] = [{ column: 'Region', value: '' }];
    expect(getFilteredRows(rows, headers, slots)).toEqual(rows);
  });

  it('filters by a single active slot', () => {
    const slots: FilterSlot[] = [{ column: 'Region', value: 'ZA' }];
    const result = getFilteredRows(rows, headers, slots);
    expect(result).toHaveLength(2);
    expect(result[0][0]).toBe('Alice');
    expect(result[1][0]).toBe('Carol');
  });

  it('applies AND logic for multiple active slots', () => {
    const slots: FilterSlot[] = [
      { column: 'Region', value: 'ZA' },
      { column: 'Name',   value: 'Alice' },
    ];
    const result = getFilteredRows(rows, headers, slots);
    expect(result).toHaveLength(1);
    expect(result[0][0]).toBe('Alice');
  });

  it('is case-insensitive', () => {
    const slots: FilterSlot[] = [{ column: 'Region', value: 'za' }];
    expect(getFilteredRows(rows, headers, slots)).toHaveLength(2);
  });

  it('ignores slots with empty column even when value is set', () => {
    const slots: FilterSlot[] = [
      { column: '',       value: 'ZA' },
      { column: 'Region', value: 'US' },
    ];
    const result = getFilteredRows(rows, headers, slots);
    expect(result).toHaveLength(1);
    expect(result[0][0]).toBe('Bob');
  });

  it('returns empty array when no rows match', () => {
    const slots: FilterSlot[] = [{ column: 'Region', value: 'EU' }];
    expect(getFilteredRows(rows, headers, slots)).toHaveLength(0);
  });

  it('handles unknown column name gracefully', () => {
    const slots: FilterSlot[] = [{ column: 'Unknown', value: 'foo' }];
    expect(getFilteredRows(rows, headers, slots)).toEqual(rows);
  });

  // ── Multi-select (string[]) ──

  it('multi-select: returns all rows when value array is empty', () => {
    const slots: FilterSlot[] = [{ column: 'Region', value: [] }];
    expect(getFilteredRows(rows, headers, slots)).toEqual(rows);
  });

  it('multi-select: filters to exact matches using OR logic', () => {
    const slots: FilterSlot[] = [{ column: 'Region', value: ['ZA', 'US'] }];
    const result = getFilteredRows(rows, headers, slots);
    expect(result).toHaveLength(3); // all rows — ZA and US together = everyone
  });

  it('multi-select: single selected value works like exact match', () => {
    const slots: FilterSlot[] = [{ column: 'Region', value: ['US'] }];
    const result = getFilteredRows(rows, headers, slots);
    expect(result).toHaveLength(1);
    expect(result[0][0]).toBe('Bob');
  });

  it('multi-select: AND logic across slots with string[] and string', () => {
    const slots: FilterSlot[] = [
      { column: 'Region', value: ['ZA'] },
      { column: 'Name',   value: 'Carol' },
    ];
    const result = getFilteredRows(rows, headers, slots);
    expect(result).toHaveLength(1);
    expect(result[0][0]).toBe('Carol');
  });

  it('multi-select: returns empty when selected value matches nothing', () => {
    const slots: FilterSlot[] = [{ column: 'Region', value: ['EU'] }];
    expect(getFilteredRows(rows, headers, slots)).toHaveLength(0);
  });

  // ── Exclude mode ──

  it('exclude mode: removes rows that match a substring value', () => {
    const slots: FilterSlot[] = [{ column: 'Region', value: 'ZA', mode: 'exclude' }];
    const result = getFilteredRows(rows, headers, slots);
    expect(result).toHaveLength(1);
    expect(result[0][0]).toBe('Bob');
  });

  it('exclude mode: keeps all rows when value matches nothing', () => {
    const slots: FilterSlot[] = [{ column: 'Region', value: 'EU', mode: 'exclude' }];
    expect(getFilteredRows(rows, headers, slots)).toHaveLength(3);
  });

  it('exclude mode: removes all rows when value matches everything', () => {
    // All regions contain at least one character — exclude with empty string would be
    // equivalent to "substring '' matches everything", removing all rows.
    // But empty value means slot is inactive — so this tests that an active exclude
    // slot removes rows matching a very broad pattern.
    const slots: FilterSlot[] = [{ column: 'Region', value: 'A', mode: 'exclude' }];
    // 'ZA' and 'US' both contain 'A' (case-insensitive) → only rows without 'A' survive
    // ZA → contains A → excluded; US → contains no 'A'? 'US'.toLowerCase() = 'us' — no 'a'
    // Actually: 'za'.includes('a') = true, 'us'.includes('a') = false
    // So Bob ('US') survives
    const result = getFilteredRows(rows, headers, slots);
    expect(result).toHaveLength(1);
    expect(result[0][0]).toBe('Bob');
  });

  it('exclude mode: multi-select removes rows matching any of the selected values', () => {
    const slots: FilterSlot[] = [{ column: 'Region', value: ['ZA'], mode: 'exclude' }];
    const result = getFilteredRows(rows, headers, slots);
    expect(result).toHaveLength(1);
    expect(result[0][0]).toBe('Bob');
  });

  it('exclude mode: multi-select with multiple values removes all matching rows', () => {
    const slots: FilterSlot[] = [{ column: 'Region', value: ['ZA', 'US'], mode: 'exclude' }];
    expect(getFilteredRows(rows, headers, slots)).toHaveLength(0);
  });

  it('exclude mode: empty array value means slot is inactive (all rows returned)', () => {
    const slots: FilterSlot[] = [{ column: 'Region', value: [], mode: 'exclude' }];
    expect(getFilteredRows(rows, headers, slots)).toHaveLength(3);
  });

  it('mixed include + exclude slots apply AND logic across both modes', () => {
    const slots: FilterSlot[] = [
      { column: 'Region', value: 'ZA', mode: 'include' },  // keep only ZA rows
      { column: 'Name',   value: 'Alice', mode: 'exclude' }, // then drop Alice
    ];
    const result = getFilteredRows(rows, headers, slots);
    expect(result).toHaveLength(1);
    expect(result[0][0]).toBe('Carol');
  });

  it('include mode is the default when mode is omitted', () => {
    const slotsWithMode: FilterSlot[]    = [{ column: 'Region', value: 'ZA', mode: 'include' }];
    const slotsWithoutMode: FilterSlot[] = [{ column: 'Region', value: 'ZA' }];
    expect(getFilteredRows(rows, headers, slotsWithMode))
      .toEqual(getFilteredRows(rows, headers, slotsWithoutMode));
  });
});
