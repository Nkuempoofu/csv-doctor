// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildJsonObjects, suggestJsonFilename, suggestXlsxFilename, exportJson } from '../exporter';

describe('buildJsonObjects', () => {
  it('maps rows to objects keyed by header', () => {
    const rows = [['Alice', '30'], ['Bob', '25']];
    const headers = ['Name', 'Age'];
    expect(buildJsonObjects(rows, headers)).toEqual([
      { Name: 'Alice', Age: '30' },
      { Name: 'Bob', Age: '25' },
    ]);
  });

  it('fills missing cells with empty string', () => {
    const rows = [['Alice']];
    const headers = ['Name', 'Age'];
    expect(buildJsonObjects(rows, headers)[0]).toEqual({ Name: 'Alice', Age: '' });
  });

  it('handles empty rows array', () => {
    expect(buildJsonObjects([], ['Name'])).toEqual([]);
  });

  it('drops extra cells beyond header count (documents intentional behaviour)', () => {
    expect(buildJsonObjects([['Alice', '30', 'EXTRA']], ['Name', 'Age'])).toEqual([{ Name: 'Alice', Age: '30' }]);
  });

  it('last value wins for duplicate header names (documents intentional behaviour)', () => {
    expect(buildJsonObjects([['Alice', 'Bob']], ['Name', 'Name'])).toEqual([{ Name: 'Bob' }]);
  });
});

describe('suggestJsonFilename', () => {
  it('replaces csv extension with json', () => {
    expect(suggestJsonFilename('data.csv')).toBe('data-cleaned.json');
  });
});

describe('suggestXlsxFilename', () => {
  it('replaces csv extension with xlsx', () => {
    expect(suggestXlsxFilename('data.csv')).toBe('data-cleaned.xlsx');
  });
});

describe('exportJson', () => {
  it('triggers a download without throwing', () => {
    const file = { headers: ['Name'], rows: [], delimiter: ',', filename: 'test.csv' } as any;
    expect(() => exportJson(file, [['Alice']], 'out.json')).not.toThrow();
  });
});
