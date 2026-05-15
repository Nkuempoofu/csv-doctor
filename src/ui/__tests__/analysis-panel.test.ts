import { describe, it, expect } from 'vitest';
import { computeAggregates } from '../analysis-panel';

describe('computeAggregates', () => {
  it('returns zero-state for a column with no non-empty values', () => {
    const agg = computeAggregates([[''], ['']], 0);
    expect(agg.count).toBe(0);
    expect(agg.isNumeric).toBe(false);
    expect(agg.sum).toBeNull();
    expect(agg.avg).toBeNull();
    expect(agg.min).toBe('—');
    expect(agg.max).toBe('—');
  });

  it('computes numeric aggregates correctly', () => {
    const rows = [['10'], ['20'], ['30']];
    const agg = computeAggregates(rows, 0);
    expect(agg.isNumeric).toBe(true);
    expect(agg.sum).toBe(60);
    expect(agg.avg).toBeCloseTo(20);
    expect(agg.count).toBe(3);
    expect(agg.min).toBe('10');
    expect(agg.max).toBe('30');
  });

  it('treats text columns as non-numeric — min/max by string length', () => {
    const rows = [['Alice'], ['Bob'], ['Carol']];
    const agg = computeAggregates(rows, 0);
    expect(agg.isNumeric).toBe(false);
    expect(agg.sum).toBeNull();
    expect(agg.avg).toBeNull();
    expect(agg.count).toBe(3);
    expect(agg.min).toBe('Bob');   // shortest (3 chars)
    expect(agg.max).toBe('Alice'); // longest first-encountered (5 chars)
  });

  it('strips thousands-separator commas before parsing', () => {
    const rows = [['1,000'], ['2,500']];
    const agg = computeAggregates(rows, 0);
    expect(agg.isNumeric).toBe(true);
    expect(agg.sum).toBe(3500);
  });

  it('uses the numeric branch when >= 50% of values parse as numbers', () => {
    // 3 numbers, 1 text — 75% numeric → isNumeric true
    const rows = [['10'], ['20'], ['30'], ['N/A']];
    const agg = computeAggregates(rows, 0);
    expect(agg.isNumeric).toBe(true);
    expect(agg.count).toBe(4); // all non-empty cells counted
  });

  it('uses the text branch when < 50% of values parse as numbers', () => {
    const rows = [['10'], ['foo'], ['bar'], ['baz']];
    const agg = computeAggregates(rows, 0);
    expect(agg.isNumeric).toBe(false);
  });

  it('handles a column index beyond the row length', () => {
    const rows = [['a'], ['b']];
    const agg = computeAggregates(rows, 5); // out of range
    expect(agg.count).toBe(0);
  });
});
