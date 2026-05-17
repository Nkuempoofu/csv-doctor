import { describe, it, expect } from 'vitest';
import { levenshtein, buildFuzzyReplacements } from '../levenshtein';
import { spellingScore, isKnownWord } from '../dictionary';

// ─── levenshtein ────────────────────────────────────────────────────────────

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

  it('"soth africa" vs "south africa" is distance 1', () => {
    expect(levenshtein('soth africa', 'south africa')).toBe(1);
  });

  it('"finace" vs "finance" is distance 1', () => {
    expect(levenshtein('finace', 'finance')).toBe(1);
  });

  it('"finanace" vs "finance" is distance 1 (extra letter)', () => {
    expect(levenshtein('finanace', 'finance')).toBe(1);
  });

  it('"persn" vs "person" is distance 1', () => {
    expect(levenshtein('persn', 'person')).toBe(1);
  });

  it('"south africa" vs "north africa" is distance 2 — must NOT be merged', () => {
    expect(levenshtein('south africa', 'north africa')).toBe(2);
  });
});

// ─── dictionary ─────────────────────────────────────────────────────────────

describe('isKnownWord', () => {
  it('recognises common English words', () => {
    expect(isKnownWord('finance')).toBe(true);
    expect(isKnownWord('marketing')).toBe(true);
    expect(isKnownWord('sales')).toBe(true);
    expect(isKnownWord('south')).toBe(true);
    expect(isKnownWord('africa')).toBe(true);
    expect(isKnownWord('germany')).toBe(true);
    expect(isKnownWord('person')).toBe(true);
    expect(isKnownWord('brazil')).toBe(true);
  });

  it('does not recognise typos', () => {
    expect(isKnownWord('finanace')).toBe(false);
    expect(isKnownWord('finace')).toBe(false);
    expect(isKnownWord('soth')).toBe(false);
    expect(isKnownWord('persn')).toBe(false);
    expect(isKnownWord('germony')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isKnownWord('Finance')).toBe(true);
    expect(isKnownWord('AFRICA')).toBe(true);
  });
});

describe('spellingScore', () => {
  it('returns 1.0 for fully known values', () => {
    expect(spellingScore('finance')).toBe(1);
    expect(spellingScore('south africa')).toBe(1);
    expect(spellingScore('germany')).toBe(1);
  });

  it('returns 0.0 for fully unknown values', () => {
    expect(spellingScore('finanace')).toBe(0);
    expect(spellingScore('finace')).toBe(0);
    expect(spellingScore('persn')).toBe(0);
  });

  it('returns partial score for mixed values', () => {
    // "Soth" unknown, "Africa" known → 0.5
    expect(spellingScore('soth africa')).toBeCloseTo(0.5);
  });

  it('returns 0.5 for purely numeric/symbolic values (neutral)', () => {
    expect(spellingScore('12345')).toBe(0.5);
    expect(spellingScore('N/A')).toBe(0.5);
  });
});

// ─── buildFuzzyReplacements — core correctness ──────────────────────────────

describe('buildFuzzyReplacements — dictionary-driven canonical selection', () => {
  it('Finance wins over Finace (Finance is a real word, Finace is not)', () => {
    const counts = new Map([['Finance', 5], ['Finace', 10]]);
    const result = buildFuzzyReplacements(['Finance', 'Finace'], counts);
    expect(result.get('Finace')).toBe('Finance');
    expect(result.has('Finance')).toBe(false);
  });

  it('Finance wins over Finanace (Finance is a real word, Finanace is not)', () => {
    // "Finanace" is longer than "Finance" — old length-first heuristic would pick Finanace
    // Dictionary-first correctly picks Finance
    const counts = new Map([['Finance', 3], ['Finanace', 20]]);
    const result = buildFuzzyReplacements(['Finance', 'Finanace'], counts);
    expect(result.get('Finanace')).toBe('Finance');
    expect(result.has('Finance')).toBe(false);
  });

  it('South Africa wins over Soth Africa (Soth is not a real word)', () => {
    const counts = new Map([['South Africa', 5], ['Soth Africa', 20]]);
    const result = buildFuzzyReplacements(['South Africa', 'Soth Africa'], counts);
    expect(result.get('Soth Africa')).toBe('South Africa');
  });

  it('Person wins over Persn (Persn is not a real word)', () => {
    const counts = new Map([['Person', 3], ['Persn', 15]]);
    const result = buildFuzzyReplacements(['Person', 'Persn'], counts);
    expect(result.get('Persn')).toBe('Person');
  });

  it('Germany wins over Germony (Germony is not a real word)', () => {
    const counts = new Map([['Germany', 4], ['Germony', 4]]);
    const result = buildFuzzyReplacements(['Germany', 'Germony'], counts);
    expect(result.get('Germony')).toBe('Germany');
  });

  it('returns empty map for fewer than 2 candidates', () => {
    expect(buildFuzzyReplacements(['hi'], new Map([['hi', 5]])).size).toBe(0);
  });

  it('returns empty map when all candidates are below minLen', () => {
    const counts = new Map([['ab', 5], ['ac', 3]]);
    expect(buildFuzzyReplacements(['ab', 'ac'], counts).size).toBe(0);
  });

  it('does NOT merge values that differ by 2 edits (e.g. South/North Africa)', () => {
    const counts = new Map([['South Africa', 100], ['North Africa', 50]]);
    const result = buildFuzzyReplacements(['South Africa', 'North Africa'], counts);
    expect(result.size).toBe(0);
  });

  it('does not group completely unrelated words', () => {
    const counts = new Map([['london', 30], ['berlin', 10]]);
    expect(buildFuzzyReplacements(['london', 'berlin'], counts).size).toBe(0);
  });
});

describe('buildFuzzyReplacements — frequency fallback (both words valid)', () => {
  it('when both spellings are valid words, more frequent wins', () => {
    // "Sales" (valid) and "Soles" (valid) — both score 1.0 — use frequency
    const counts = new Map([['sales', 30], ['soles', 3]]);
    const result = buildFuzzyReplacements(['sales', 'soles'], counts);
    expect(result.get('soles')).toBe('sales');
  });
});

describe('buildFuzzyReplacements — case-folded aggregation', () => {
  it('sums frequency across case variants before scoring', () => {
    const counts = new Map([
      ['Finance', 5],
      ['finance', 3],  // same word, different casing
      ['Finace',  1],  // typo
    ]);
    const result = buildFuzzyReplacements(['Finance', 'finance', 'Finace'], counts);
    // Finance scores 1.0, Finace scores 0.0 → Finance wins regardless of frequency
    expect(result.get('Finace')).toBe('Finance');   // exact casing key
    expect(result.get('finace')).toBe('Finance');   // lowercase key also stored
    expect(result.has('Finance')).toBe(false);
    expect(result.has('finance')).toBe(false);
  });

  it('stores lowercase key for case-insensitive fallback lookup', () => {
    const counts = new Map([['South Africa', 30], ['Soth Africa', 3]]);
    const result = buildFuzzyReplacements(['South Africa', 'Soth Africa'], counts);
    expect(result.get('soth africa')).toBe('South Africa');
  });
});

describe('isKnownWord — multilingual coverage', () => {
  it('recognises Spanish business words', () => {
    expect(isKnownWord('finanzas')).toBe(true);
    expect(isKnownWord('ventas')).toBe(true);
    expect(isKnownWord('recursos')).toBe(true);
    expect(isKnownWord('gerente')).toBe(true);
  });

  it('recognises French business words', () => {
    expect(isKnownWord('finances')).toBe(true);
    expect(isKnownWord('ventes')).toBe(true);
    expect(isKnownWord('ressources')).toBe(true);
    expect(isKnownWord('directeur')).toBe(true);
  });

  it('recognises Portuguese business words', () => {
    expect(isKnownWord('financas')).toBe(true);
    expect(isKnownWord('vendas')).toBe(true);
    expect(isKnownWord('funcionario')).toBe(true);
  });

  it('recognises German business words', () => {
    expect(isKnownWord('finanzen')).toBe(true);
    expect(isKnownWord('vertrieb')).toBe(true);
    expect(isKnownWord('mitarbeiter')).toBe(true);
  });

  it('recognises Swahili business words', () => {
    expect(isKnownWord('fedha')).toBe(true);
    expect(isKnownWord('mauzo')).toBe(true);
    expect(isKnownWord('wafanyakazi')).toBe(true);
  });
});

describe('buildFuzzyReplacements — multilingual spelling correction', () => {
  it('Finanzas wins over Finanzaz (Spanish finance word)', () => {
    const counts = new Map([['Finanzas', 5], ['Finanzaz', 10]]);
    const result = buildFuzzyReplacements(['Finanzas', 'Finanzaz'], counts);
    expect(result.get('Finanzaz')).toBe('Finanzas');
  });

  it('Finanzen wins over Finanzen typo (German finance word)', () => {
    const counts = new Map([['Finanzen', 4], ['Finansen', 8]]);
    const result = buildFuzzyReplacements(['Finanzen', 'Finansen'], counts);
    expect(result.get('Finansen')).toBe('Finanzen');
  });

  it('Directeur wins over Dircteur (French director, missing e)', () => {
    // "Dircteur" is "Directeur" with one 'e' deleted → distance 1
    const counts = new Map([['Directeur', 3], ['Dircteur', 9]]);
    const result = buildFuzzyReplacements(['Directeur', 'Dircteur'], counts);
    expect(result.get('Dircteur')).toBe('Directeur');
  });
});

describe('buildFuzzyReplacements — abbreviation normalisation', () => {
  it('merges U.K. and Uk (dot-stripped both become "uk")', () => {
    const counts = new Map([['U.K.', 10], ['Uk', 3]]);
    const result = buildFuzzyReplacements(['U.K.', 'Uk'], counts);
    // U.K. is more frequent → canonical
    expect(result.get('Uk')).toBe('U.K.');
    expect(result.has('U.K.')).toBe(false);
  });

  it('merges U.S.A. and USA', () => {
    const counts = new Map([['U.S.A.', 5], ['USA', 8]]);
    const result = buildFuzzyReplacements(['U.S.A.', 'USA'], counts);
    // USA is more frequent → canonical
    expect(result.get('U.S.A.')).toBe('USA');
    expect(result.has('USA')).toBe(false);
  });

  it('merges H.R. and HR', () => {
    const counts = new Map([['H.R.', 2], ['HR', 15]]);
    const result = buildFuzzyReplacements(['H.R.', 'HR'], counts);
    expect(result.get('H.R.')).toBe('HR');
  });

  it('does NOT merge values that differ beyond dots (U.K. vs UN)', () => {
    const counts = new Map([['U.K.', 5], ['UN', 5]]);
    const result = buildFuzzyReplacements(['U.K.', 'UN'], counts);
    // "uk" ≠ "un" — different after dot-stripping
    expect(result.size).toBe(0);
  });

  it('stores dot-stripped key for cleaner fallback lookup', () => {
    const counts = new Map([['U.K.', 10], ['Uk', 3]]);
    const result = buildFuzzyReplacements(['U.K.', 'Uk'], counts);
    // cleaner does colMap.get(lower.replace(/\./g,'')) = colMap.get('uk')
    expect(result.get('uk')).toBe('U.K.');
  });
});

describe('buildFuzzyReplacements — transitive grouping', () => {
  it('chains near-duplicates transitively', () => {
    const counts = new Map([
      ['South Africa', 30],
      ['Soth Africa',   3],
      ['South Afrca',   1],
    ]);
    const result = buildFuzzyReplacements(
      ['South Africa', 'Soth Africa', 'South Afrca'], counts
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
