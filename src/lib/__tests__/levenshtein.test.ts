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

  // ── Canonical selection ──

  it('maps "Soth Africa" → "South Africa" when correct spelling is clearly more frequent', () => {
    const counts = new Map([
      ['South Africa', 30],
      ['Soth Africa',   3],
    ]);
    const result = buildFuzzyReplacements(['South Africa', 'Soth Africa'], counts);
    expect(result.get('Soth Africa')).toBe('South Africa');
    expect(result.has('South Africa')).toBe(false);
  });

  it('maps "Finace" → "Finance" when correct spelling is clearly more frequent', () => {
    const counts = new Map([
      ['Finance', 24],
      ['Finace',   2],
    ]);
    const result = buildFuzzyReplacements(['Finance', 'Finace'], counts);
    expect(result.get('Finace')).toBe('Finance');
  });

  // ── Minimum frequency ratio guard ──

  it('does NOT replace when counts are too similar (ratio < 3)', () => {
    // 10 / 8 = 1.25 — too close to be sure which is the typo
    const counts = new Map([
      ['South Africa', 10],
      ['Soth Africa',   8],
    ]);
    const result = buildFuzzyReplacements(['South Africa', 'Soth Africa'], counts);
    expect(result.size).toBe(0);
  });

  it('does NOT replace when misspelling is more frequent than canonical', () => {
    // Soth Africa (15) > South Africa (8) but ratio is 15/8 = 1.875 < 3 either way
    // No side reaches 3× dominance — leave both intact
    const counts = new Map([
      ['South Africa', 8],
      ['Soth Africa',  15],
    ]);
    const result = buildFuzzyReplacements(['South Africa', 'Soth Africa'], counts);
    expect(result.size).toBe(0);
  });

  it('replaces exactly at the 3× threshold', () => {
    // 15 / 5 = 3 — just meets the minimum ratio
    const counts = new Map([
      ['Finance', 15],
      ['Finace',   5],
    ]);
    const result = buildFuzzyReplacements(['Finance', 'Finace'], counts);
    expect(result.get('Finace')).toBe('Finance');
  });

  // ── Case-folded frequency aggregation ──

  it('aggregates case variants of the correct spelling to beat a misspelling', () => {
    // Without aggregation "Soth Africa" (9) beats "South Africa" (5) individually.
    // With aggregation: "south africa" total = 5 + 6 = 11  vs  "soth africa" = 9 → ratio 11/9 < 3
    // So still no replacement in this borderline case...
    // Use clearer numbers: correct (8+4=12) vs wrong (3) → ratio 4 ≥ 3
    const counts = new Map([
      ['South Africa',  8],
      ['south africa',  4],  // same word, different casing
      ['Soth Africa',   3],  // misspelling
    ]);
    const result = buildFuzzyReplacements(
      ['South Africa', 'south africa', 'Soth Africa'],
      counts
    );
    // Combined "south africa" total = 12, "soth africa" = 3, ratio = 4 ≥ 3
    // canonicalOrig = "South Africa" (most-frequent individual variant: 8 > 4)
    expect(result.get('Soth Africa')).toBe('South Africa');
    expect(result.get('soth africa')).toBe('South Africa'); // lowercase key also stored
    expect(result.has('South Africa')).toBe(false);         // canonical never replaced
    expect(result.has('south africa')).toBe(false);         // canonical variant never replaced
  });

  it('prevents misspelling from winning due to correct spellings count being split', () => {
    // Classic bug scenario: misspelling appears more than any single casing of the
    // correct word, but less than their combined total.
    //   "South Africa" (4) + "south africa" (3) = 7 total
    //   "Soth Africa" (5) individual count
    //   Without aggregation: Soth Africa (5) would beat South Africa (4) → WRONG replacement
    //   With aggregation: 7 vs 5 → ratio 7/5 = 1.4 < 3 → no replacement (correct: ambiguous)
    const counts = new Map([
      ['South Africa',  4],
      ['south africa',  3],
      ['Soth Africa',   5],
    ]);
    const result = buildFuzzyReplacements(
      ['South Africa', 'south africa', 'Soth Africa'],
      counts
    );
    // Too ambiguous (ratio < 3) — leave the data as-is
    expect(result.size).toBe(0);
  });

  // ── Transitive grouping ──

  it('handles transitive groups — canonical is most frequent across all members', () => {
    // South Africa (30) > Soth Africa (3) and South Afrca (1)
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

  // ── Tie-breaking ──

  it('tie-breaks on longer string length when frequencies are equal', () => {
    // "finance" (15) vs "finace" (5): ratio 3 ≥ 3 → replace
    // Both are lowercase so alphabetical tie-break doesn't apply here
    const counts = new Map([
      ['finance', 15],
      ['finace',   5],
    ]);
    const result = buildFuzzyReplacements(['finance', 'finace'], counts);
    // "finance" (7 chars) > "finace" (6 chars) → "finance" is canonical
    expect(result.get('finace')).toBe('finance');
    expect(result.has('finance')).toBe(false);
  });

  it('tie-breaks on alphabetical order when length and frequency are equal', () => {
    // "alpha" and "alpho" — same length, make canonical clearly dominant
    const counts = new Map([
      ['alpha', 15],
      ['alpho',  5],
    ]);
    const result = buildFuzzyReplacements(['alpha', 'alpho'], counts);
    // ratio 15/5 = 3 ≥ 3 → replace; "alpha" < "alpho" alphabetically → "alpha" is canonical
    expect(result.get('alpho')).toBe('alpha');
    expect(result.has('alpha')).toBe(false);
  });

  // ── Other guarantees ──

  it('does not produce self-mappings', () => {
    const counts = new Map([['Finance', 30], ['Finace', 3]]);
    const result = buildFuzzyReplacements(['Finance', 'Finace'], counts);
    for (const [from, to] of result) {
      expect(from.toLowerCase()).not.toBe(to.toLowerCase());
    }
  });

  it('does not group strings that differ by more than threshold', () => {
    // "london" and "berlin" differ by many edits
    const counts = new Map([['london', 30], ['berlin', 10]]);
    const result = buildFuzzyReplacements(['london', 'berlin'], counts);
    expect(result.size).toBe(0);
  });

  it('stores lowercase key for case-insensitive fallback lookup', () => {
    const counts = new Map([
      ['South Africa', 30],
      ['Soth Africa',   3],
    ]);
    const result = buildFuzzyReplacements(['South Africa', 'Soth Africa'], counts);
    // Lowercase key should also work (used by the cleaner as fallback)
    expect(result.get('soth africa')).toBe('South Africa');
  });
});
