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
