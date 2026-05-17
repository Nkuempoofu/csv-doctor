import { describe, it, expect } from 'vitest';
import { buildJsonObjects, suggestJsonFilename, suggestXlsxFilename } from '../exporter';

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
