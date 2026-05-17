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

  it('"south africa" vs "north africa" is distance 2', () => {
    // Two substitutions — must NOT be grouped by the fuzzy matcher
    expect(levenshtein('south africa', 'north africa')).toBe(2);
  });
});

describe('buildFuzzyReplacements — core merging', () => {
  it('returns empty map for fewer than 2 candidates', () => {
    expect(buildFuzzyReplacements(['hi'], new Map([['hi', 5]])).size).toBe(0);
  });

  it('returns empty map when all candidates are below minLen', () => {
    const counts = new Map([['ab', 5], ['ac', 3]]);
    expect(buildFuzzyReplacements(['ab', 'ac'], counts).size).toBe(0);
  });

  it('maps "Soth Africa" → "South Africa" (correct spelling is longer)', () => {
    const counts = new Map([['South Africa', 5], ['Soth Africa', 3]]);
    const result = buildFuzzyReplacements(['South Africa', 'Soth Africa'], counts);
    expect(result.get('Soth Africa')).toBe('South Africa');
    expect(result.has('South Africa')).toBe(false);
  });

  it('maps "Soth Africa" → "South Africa" even when misspelling is more frequent', () => {
    // "South Africa" is longer so it wins regardless of frequency
    const counts = new Map([['South Africa', 3], ['Soth Africa', 20]]);
    const result = buildFuzzyReplacements(['South Africa', 'Soth Africa'], counts);
    expect(result.get('Soth Africa')).toBe('South Africa');
    expect(result.has('South Africa')).toBe(false);
  });

  it('maps "Finace" → "Finance" (correct spelling is longer)', () => {
    const counts = new Map([['Finance', 8], ['Finace', 1]]);
    const result = buildFuzzyReplacements(['Finance', 'Finace'], counts);
    expect(result.get('Finace')).toBe('Finance');
    expect(result.has('Finance')).toBe(false);
  });

  it('maps "Finace" → "Finance" even when misspelling dominates the data', () => {
    const counts = new Map([['Finance', 2], ['Finace', 50]]);
    const result = buildFuzzyReplacements(['Finance', 'Finace'], counts);
    expect(result.get('Finace')).toBe('Finance');
  });

  it('does NOT merge values that differ by 2 edits (e.g. South Africa / North Africa)', () => {
    // levenshtein("south africa", "north africa") = 2 — must not be grouped
    const counts = new Map([['South Africa', 100], ['North Africa', 50]]);
    const result = buildFuzzyReplacements(['South Africa', 'North Africa'], counts);
    expect(result.size).toBe(0);
  });

  it('does not group strings that are clearly unrelated', () => {
    const counts = new Map([['london', 30], ['berlin', 10]]);
    const result = buildFuzzyReplacements(['london', 'berlin'], counts);
    expect(result.size).toBe(0);
  });

  it('skips values shorter than minLen', () => {
    const counts = new Map([['ab', 5], ['ac', 3]]);
    expect(buildFuzzyReplacements(['ab', 'ac'], counts).size).toBe(0);
  });
});

describe('buildFuzzyReplacements — canonical selection', () => {
  it('same-length values: more frequent becomes canonical', () => {
    // "Germany" and "Germony" — same length, frequency decides
    const counts = new Map([['Germany', 20], ['Germony', 2]]);
    const result = buildFuzzyReplacements(['Germany', 'Germony'], counts);
    expect(result.get('Germony')).toBe('Germany');
    expect(result.has('Germany')).toBe(false);
  });

  it('same-length values: misspelling is canonical when it dominates (rare but valid)', () => {
    // Same-length + misspelling is more frequent → frequency wins (we can't know which is "correct")
    const counts = new Map([['Germony', 20], ['Germany', 2]]);
    const result = buildFuzzyReplacements(['Germany', 'Germony'], counts);
    expect(result.get('Germany')).toBe('Germony');
    expect(result.has('Germony')).toBe(false);
  });

  it('same-length + equal frequency: alphabetically first is canonical', () => {
    const counts = new Map([['alpha', 5], ['alpho', 5]]);
    const result = buildFuzzyReplacements(['alpha', 'alpho'], counts);
    expect(result.get('alpho')).toBe('alpha');
  });

  it('length beats frequency: longer string wins even if less frequent', () => {
    // "South Africa" (12) beats "Soth Africa" (11) on length, regardless of count
    const counts = new Map([['South Africa', 1], ['Soth Africa', 999]]);
    const result = buildFuzzyReplacements(['South Africa', 'Soth Africa'], counts);
    expect(result.get('Soth Africa')).toBe('South Africa');
  });
});

describe('buildFuzzyReplacements — case-folded aggregation', () => {
  it('aggregates case variants to prevent frequency splitting', () => {
    // "South Africa" (4) + "south africa" (5) = 9 combined vs "Soth Africa" (8)
    // South Africa is also LONGER, so it wins doubly.
    const counts = new Map([
      ['South Africa',  4],
      ['south africa',  5],
      ['Soth Africa',   8],
    ]);
    const result = buildFuzzyReplacements(
      ['South Africa', 'south africa', 'Soth Africa'],
      counts
    );
    // canonicalOrig = "south africa" (most-frequent individual casing: 5 > 4)
    expect(result.get('Soth Africa')).toBe('south africa');
    // Canonical variants are never replaced
    expect(result.has('South Africa')).toBe(false);
    expect(result.has('south africa')).toBe(false);
  });

  it('stores lowercase key for case-insensitive fallback lookup', () => {
    const counts = new Map([['South Africa', 30], ['Soth Africa', 3]]);
    const result = buildFuzzyReplacements(['South Africa', 'Soth Africa'], counts);
    // Lowercase key is always present for cleaner fallback
    expect(result.get('soth africa')).toBe('South Africa');
  });
});

describe('buildFuzzyReplacements — transitive grouping', () => {
  it('transitively merges a chain of near-duplicates', () => {
    // South Africa (30) → Soth Africa (3) → South Afrca (1)
    const counts = new Map([
      ['South Africa', 30],
      ['Soth Africa',   3],
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
    const counts = new Map([['Finance', 30], ['Finace', 3]]);
    const result = buildFuzzyReplacements(['Finance', 'Finace'], counts);
    for (const [from, to] of result) {
      expect(from.toLowerCase()).not.toBe(to.toLowerCase());
    }
  });
});
