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
});
