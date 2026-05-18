import { describe, it, expect } from 'vitest';
import { makeFile } from './helpers';
import { analyze } from '../analyzer';

describe('analyzer setup', () => {
  it('makeFile creates a valid ParsedFile', () => {
    const f = makeFile(['A'], [['1'], ['2']]);
    expect(f.headers).toEqual(['A']);
    expect(f.rows.length).toBe(2);
  });
});

describe('detectDuplicateRows', () => {
  it('returns null when all rows are unique', () => {
    const file = makeFile(
      ['ID', 'Name', 'City'],
      [
        ['1', 'Alice', 'Cape Town'],
        ['2', 'Bob',   'Joburg'],
        ['3', 'Carol', 'Durban'],
      ]
    );
    const issues = analyze(file);
    expect(issues.find(i => i.id === 'duplicate-rows')).toBeUndefined();
  });

  it('detects a single duplicated row', () => {
    const file = makeFile(
      ['Name', 'Email'],
      [
        ['Alice', 'alice@example.com'],
        ['Bob',   'bob@example.com'],
        ['Alice', 'alice@example.com'], // exact duplicate of row 0
      ]
    );
    const issues = analyze(file);
    const issue = issues.find(i => i.id === 'duplicate-rows');
    expect(issue).toBeDefined();
    expect(issue!.count).toBe(1);
  });

  it('counts each extra copy as a separate duplicate', () => {
    const file = makeFile(
      ['Val'],
      [['X'], ['X'], ['X'], ['Y']] // X appears 3× → 2 duplicates
    );
    const issues = analyze(file);
    const issue = issues.find(i => i.id === 'duplicate-rows');
    expect(issue).toBeDefined();
    expect(issue!.count).toBe(2);
  });

  it('treats rows as equal after leading/trailing whitespace is trimmed', () => {
    const file = makeFile(
      ['Name', 'City'],
      [
        ['Alice ', ' Cape Town'], // trailing/leading spaces
        ['Alice',  'Cape Town'],  // same data, no spaces — should be a duplicate
      ]
    );
    const issues = analyze(file);
    expect(issues.find(i => i.id === 'duplicate-rows')).toBeDefined();
  });

  it('does NOT treat rows as equal when they differ only in internal spacing', () => {
    const file = makeFile(
      ['Name'],
      [
        ['John Smith'],    // single space
        ['John  Smith'],   // double space (internal — not trimmed)
      ]
    );
    const issues = analyze(file);
    // These should NOT be duplicates — internal whitespace differs
    expect(issues.find(i => i.id === 'duplicate-rows')).toBeUndefined();
  });

  it('does NOT produce false positives when cells concatenate to the same string', () => {
    // Classic empty-separator false-positive: ["AB","CD"] vs ["A","BCD"]
    // both concatenate to "ABCD" with no separator — our null-byte sep prevents this.
    const file = makeFile(
      ['Col1', 'Col2'],
      [
        ['AB', 'CD'],
        ['A',  'BCD'],
        ['ABC', 'D'],
      ]
    );
    const issues = analyze(file);
    expect(issues.find(i => i.id === 'duplicate-rows')).toBeUndefined();
  });

  it('skips empty rows — they are handled by empty-rows detector', () => {
    const file = makeFile(
      ['Name'],
      [['Alice'], [''], [''], ['Bob']]
    );
    const issues = analyze(file);
    // Empty rows must NOT inflate the duplicate count
    expect(issues.find(i => i.id === 'duplicate-rows')).toBeUndefined();
  });

  it('includes a human-readable sample in the description', () => {
    const file = makeFile(
      ['Product', 'Price'],
      [
        ['Widget', '9.99'],
        ['Gadget', '14.99'],
        ['Widget', '9.99'], // duplicate
      ]
    );
    const issue = analyze(file).find(i => i.id === 'duplicate-rows');
    expect(issue).toBeDefined();
    // Description should mention column names and values from the duplicate
    expect(issue!.description).toMatch(/Product/);
    expect(issue!.description).toMatch(/Widget/);
  });
});

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
        ['invalidemail@'],       // has @ but fails EMAIL_BASIC_RE
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

  it('does not flag a column with sufficient data', () => {
    const file = makeFile(
      ['Name', 'Age'],
      [['Alice', '30'], ['Bob', '25'], ['Carol', '35']]
    );
    expect(analyze(file).find(i => i.id === 'sparse-columns')).toBeUndefined();
  });
});

describe('detectNumberFormat', () => {
  it('flags a column with EU thousands/decimal formatting', () => {
    const file = makeFile(
      ['Revenue'],
      [['1.234,56'], ['2.000,00'], ['10.500,75'], ['3.100,00']]
    );
    const issues = analyze(file);
    const issue = issues.find(i => i.id === 'number-format');
    expect(issue).toBeDefined();
    expect(issue!.affectedColumns).toContain('Revenue');
  });

  it('does not flag a column with US/plain numbers', () => {
    const file = makeFile(
      ['Revenue'],
      [['1234.56'], ['2000.00'], ['10500.75']]
    );
    const issues = analyze(file);
    expect(issues.find(i => i.id === 'number-format')).toBeUndefined();
  });

  it('does not flag a column with fewer than 3 non-empty values', () => {
    const file = makeFile(['Revenue'], [['1.234,56'], ['']]);
    const issues = analyze(file);
    expect(issues.find(i => i.id === 'number-format')).toBeUndefined();
  });
});

describe('detectDuplicateColumns', () => {
  it('flags two columns with ≥90% identical non-empty values', () => {
    const file = makeFile(
      ['Region', 'Territory'],
      [
        ['North', 'North'],
        ['South', 'South'],
        ['East',  'East'],
        ['West',  'West'],
        ['North', 'North'],
      ]
    );
    const issues = analyze(file);
    const issue = issues.find(i => i.id === 'duplicate-columns');
    expect(issue).toBeDefined();
    expect(issue!.count).toBe(1); // 1 duplicate pair
  });

  it('does not flag columns with different content', () => {
    const file = makeFile(
      ['Region', 'Country'],
      [['North', 'South Africa'], ['South', 'Nigeria'], ['East', 'Kenya']]
    );
    const issues = analyze(file);
    expect(issues.find(i => i.id === 'duplicate-columns')).toBeUndefined();
  });

  it('does not flag when fewer than 5 non-empty rows exist', () => {
    const file = makeFile(
      ['A', 'B'],
      [['x', 'x'], ['y', 'y'], ['z', 'z']]
    );
    const issues = analyze(file);
    expect(issues.find(i => i.id === 'duplicate-columns')).toBeUndefined();
  });

  it('is case-insensitive when comparing', () => {
    const file = makeFile(
      ['Col1', 'Col2'],
      [['North', 'north'], ['South', 'SOUTH'], ['East', 'east'],
       ['West', 'WEST'], ['Central', 'central']]
    );
    const issues = analyze(file);
    expect(issues.find(i => i.id === 'duplicate-columns')).toBeDefined();
  });
});
