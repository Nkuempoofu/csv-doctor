import { describe, it, expect } from 'vitest';
import { levenshtein, buildFuzzyReplacements } from '../levenshtein';

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('hello', 'hello')).toBe(0);
  });

  it('returns source length when target is empty', () => {
    expect(levenshtein('abc', '')).toBe(3);
  });

  it('returns target length when source is empty', () => {
    expect(levenshtein('', 'abc')).toBe(3);
  });

  it('handles single substitution', () => {
    expect(levenshtein('cat', 'bat')).toBe(1);
  });

  it('handles single insertion', () => {
    expect(levenshtein('cat', 'cats')).toBe(1);
  });

  it('handles single deletion', () => {
    expect(levenshtein('cats', 'cat')).toBe(1);
  });

  it('is symmetric', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(levenshtein('sitting', 'kitten'));
  });

  it('computes kitten → sitting correctly', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });

  it('detects "soth africa" vs "south africa" as distance 1', () => {
    expect(levenshtein('soth africa', 'south africa')).toBe(1);
  });

  it('detects "finace" vs "finance" as distance 1', () => {
    expect(levenshtein('finace', 'finance')).toBe(1);
  });

  it('returns correct distance for completely different short strings', () => {
    expect(levenshtein('abc', 'xyz')).toBe(3);
  });
});

describe('buildFuzzyReplacements', () => {
  it('returns empty map for fewer than 2 candidates', () => {
    expect(buildFuzzyReplacements(['hi'], new Map([['hi', 5]])).size).toBe(0);
  });

  it('returns empty map when all candidates are below minLen', () => {
    const counts = new Map([['ab', 5], ['ac', 3]]);
    expect(buildFuzzyReplacements(['ab', 'ac'], counts).size).toBe(0);
  });

  it('maps "Soth Africa" → "South Africa" (more frequent)', () => {
    const counts = new Map([
      ['South Africa', 10],
      ['Soth Africa',   2],
    ]);
    const result = buildFuzzyReplacements(['South Africa', 'Soth Africa'], counts);
    expect(result.get('Soth Africa')).toBe('South Africa');
    expect(result.has('South Africa')).toBe(false);
  });

  it('maps "Finace" → "Finance" (more frequent)', () => {
    const counts = new Map([
      ['Finance', 8],
      ['Finace',  1],
    ]);
    const result = buildFuzzyReplacements(['Finance', 'Finace'], counts);
    expect(result.get('Finace')).toBe('Finance');
  });

  it('does not group strings that differ by more than threshold', () => {
    // "london" and "berlin" differ by 5 — well above threshold for these lengths
    const counts = new Map([['london', 5], ['berlin', 5]]);
    const result = buildFuzzyReplacements(['london', 'berlin'], counts);
    expect(result.size).toBe(0);
  });

  it('handles transitive grouping — canonical is most frequent across all members', () => {
    // "South Africa" (10) beats "Soth Africa" (2) and "South Afrca" (1)
    const counts = new Map([
      ['South Africa', 10],
      ['Soth Africa',   2],
      ['South Afrca',   1],
    ]);
    const result = buildFuzzyReplacements(
      ['South Africa', 'Soth Africa', 'South Afrca'],
      counts
    );
    expect(result.get('Soth Africa')).toBe('South Africa');
    expect(result.get('South Afrca')).toBe('South Africa');
    expect(result.has('South Africa')).toBe(false);
  });

  it('does not produce self-mappings', () => {
    const counts = new Map([['Finance', 5], ['Finace', 2]]);
    const result = buildFuzzyReplacements(['Finance', 'Finace'], counts);
    for (const [from, to] of result) {
      expect(from).not.toBe(to);
    }
  });

  it('tie-breaks on alphabetical order when frequencies are equal', () => {
    const counts = new Map([
      ['alpha', 5],
      ['alpho', 5],
    ]);
    const result = buildFuzzyReplacements(['alpha', 'alpho'], counts);
    // "alpha" < "alpho" alphabetically → "alpha" is canonical
    expect(result.get('alpho')).toBe('alpha');
    expect(result.has('alpha')).toBe(false);
  });

  it('is case-insensitive for grouping but preserves original casing', () => {
    const counts = new Map([
      ['South Africa', 10],
      ['south afrca',   1],
    ]);
    const result = buildFuzzyReplacements(['South Africa', 'south afrca'], counts);
    expect(result.get('south afrca')).toBe('South Africa');
  });
});
