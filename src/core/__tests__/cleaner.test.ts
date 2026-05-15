import { describe, it, expect } from 'vitest';
import { makeFile } from './helpers';
import { clean } from '../cleaner';

describe('cleaner setup', () => {
  it('makeFile creates a valid ParsedFile', () => {
    const f = makeFile(['A'], [['1']]);
    expect(f.rows[0][0]).toBe('1');
  });
});

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

describe('clean — contact-formats', () => {
  it('normalises SA local phone numbers to spaced format', () => {
    const file = makeFile(
      ['Phone'],
      [['0821234567'], ['082-123-4567'], ['(082) 123 4567'], ['+27821234567'], ['082 123 4567']]
    );
    const result = clean(file, { enabled: new Set(['contact-formats']) });
    expect(result.rows[0][0]).toBe('082 123 4567');
  });

  it('clears invalid email cells (those containing @ but failing basic regex)', () => {
    const file = makeFile(
      ['Email'],
      [
        ['alice@example.com'],
        ['invalidemail@'],
        ['bob@example.com'],
        ['@bademailformat'],
        ['carol@example.com'],
      ]
    );
    const result = clean(file, { enabled: new Set(['contact-formats']) });
    expect(result.rows[0][0]).toBe('alice@example.com'); // valid — unchanged
    expect(result.rows[1][0]).toBe('');                  // invalid @ — cleared
    expect(result.rows[3][0]).toBe('');                  // invalid @ — cleared
    expect(result.rows[2][0]).toBe('bob@example.com');   // valid — unchanged
  });
});
