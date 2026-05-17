/**
 * Levenshtein distance and fuzzy-replacement utilities.
 *
 * buildFuzzyReplacements identifies near-duplicate string values
 * (e.g. "Soth Africa" vs "South Africa", "Finanace" vs "Finance") and maps
 * each misspelling to its canonical (correct) form.
 *
 * Two complementary passes:
 *   A. Abbreviation normalisation — strips dots so "U.K." and "Uk" both become
 *      "uk" and are merged as an exact match (no edit distance needed).
 *      This also handles "U.S.A." / "USA", "H.R." / "HR", etc.
 *
 *   B. Levenshtein spelling correction — edit distance = 1 only, catches
 *      "Soth Africa" / "South Africa", "Finanace" / "Finance", etc.
 *
 * Canonical selection — in priority order:
 *   1. Dictionary score  — fraction of words in the value that are real words.
 *      "Finance" (1.0) beats "Finanace" (0.0) and "Finace" (0.0).
 *      "South Africa" (1.0) beats "Soth Africa" (0.5, "Soth" is unknown).
 *      This works regardless of which string is longer or more frequent.
 *   2. Case-folded frequency — when scores are equal, the most common variant wins.
 *   3. Longer string — final length tie-break (deletion typos are common).
 *   4. Alphabetically first — deterministic last resort.
 *
 * Edit threshold: strictly 1 character only.
 *   Allowing 2 would merge "South Africa" and "North Africa" (distance 2),
 *   which are legitimately distinct values.
 */

import { spellingScore } from './dictionary';

/**
 * Classic Levenshtein edit distance — space-optimised O(min(m,n)) memory.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  if (a.length > b.length) { const t = a; a = b; b = t; }

  const lenA = a.length;
  const lenB = b.length;
  const prev: number[] = Array.from({ length: lenA + 1 }, (_, i) => i);

  for (let j = 1; j <= lenB; j++) {
    const curr = new Array<number>(lenA + 1);
    curr[0] = j;
    for (let i = 1; i <= lenA; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(curr[i - 1] + 1, prev[i] + 1, prev[i - 1] + cost);
    }
    for (let i = 0; i <= lenA; i++) prev[i] = curr[i];
  }

  return prev[lenA];
}

/* ── Union-Find (path-compressed) ────────────────────── */

class UnionFind {
  private readonly parent = new Map<string, string>();

  find(x: string): string {
    if (!this.parent.has(x)) return x;
    const root = this.find(this.parent.get(x)!);
    this.parent.set(x, root);
    return root;
  }

  union(x: string, y: string): void {
    const rx = this.find(x);
    const ry = this.find(y);
    if (rx !== ry) this.parent.set(rx, ry);
  }
}

/**
 * Normalise an abbreviation for dot-stripping comparison.
 * "U.K." → "uk",  "U.S.A." → "usa",  "Uk" → "uk",  "HR" → "hr"
 */
function abbrevKey(v: string): string {
  return v.toLowerCase().replace(/\./g, '').trim();
}

/**
 * Given a list of unique string values and their occurrence counts, return a
 * Map<misspelling → canonical> for every near-duplicate cluster found within
 * a strict edit distance of 1, PLUS abbreviation format variants (U.K. / Uk).
 *
 * See module doc-comment for the full canonical-selection strategy.
 *
 * Values shorter than `minLen` are skipped for Levenshtein matching to avoid
 * false positives on very short tokens, but ALL values (including short ones)
 * are checked for abbreviation normalisation.
 * Complexity: O(n²) — acceptable because callers cap at 50 unique values per column.
 */
export function buildFuzzyReplacements(
  unique: string[],
  counts: Map<string, number>,
  minLen = 4
): Map<string, string> {
  const result = new Map<string, string>();

  // ── Pass A: Abbreviation normalisation ──────────────────────────────────────
  // Group ALL unique values (no minLen filter) by their dot-stripped lowercase key.
  // "U.K." and "Uk" both normalise to "uk" → merge them.
  // Only fires when dot-stripped form differs from plain lowercase
  // (i.e. the value actually contains dots that change how it reads).
  const abbrevGroups = new Map<string, string[]>();
  for (const v of unique) {
    const ak = abbrevKey(v);
    if (!abbrevGroups.has(ak)) abbrevGroups.set(ak, []);
    abbrevGroups.get(ak)!.push(v);
  }

  for (const [ak, members] of abbrevGroups) {
    // Only merge when there is genuine dot-variation (at least one member has a dot
    // and the group has more than one distinct member after normalisation).
    const hasDot = members.some(m => m.includes('.'));
    if (members.length < 2 || !hasDot) continue;

    // Canonical = most frequent; ties broken by longer original string, then alpha.
    const canonical = members.reduce((best, v) => {
      const cntV    = counts.get(v) ?? 0;
      const cntBest = counts.get(best) ?? 0;
      if (cntV    > cntBest) return v;
      if (cntBest > cntV)    return best;
      if (v.length    > best.length) return v;
      if (best.length > v.length)    return best;
      return v < best ? v : best;
    });

    for (const m of members) {
      if (m === canonical) continue;
      result.set(m,              canonical);
      result.set(m.toLowerCase(), canonical);
      result.set(ak,             canonical); // dot-stripped fallback key
    }
  }

  // ── Pass B: Levenshtein spelling correction ──────────────────────────────────
  const candidates = unique.filter(v => v.length >= minLen);
  if (candidates.length < 2) return result;

  // Step 1: Aggregate frequency across capitalisation variants.
  // "South Africa" (3) + "south africa" (5) → folded total = 8.
  const foldedTotal = new Map<string, number>();  // lowercase → combined count
  const foldedBest  = new Map<string, string>();  // lowercase → most-freq original casing

  for (const v of candidates) {
    const key = v.toLowerCase();
    const cnt = counts.get(v) ?? 0;
    foldedTotal.set(key, (foldedTotal.get(key) ?? 0) + cnt);
    const prev = foldedBest.get(key);
    if (!prev || cnt > (counts.get(prev) ?? 0)) foldedBest.set(key, v);
  }

  const foldedKeys = Array.from(foldedTotal.keys());
  if (foldedKeys.length < 2) return result;

  // Step 2: Union-Find — strict edit distance of 1 only.
  const uf = new UnionFind();

  for (let i = 0; i < foldedKeys.length; i++) {
    for (let j = i + 1; j < foldedKeys.length; j++) {
      if (levenshtein(foldedKeys[i], foldedKeys[j]) === 1) {
        uf.union(foldedKeys[i], foldedKeys[j]);
      }
    }
  }

  // Step 3: Group by root.
  const groups = new Map<string, string[]>();
  for (const v of foldedKeys) {
    const root = uf.find(v);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(v);
  }

  // Step 4: Build replacement map.
  for (const members of groups.values()) {
    if (members.length < 2) continue;

    // Canonical selection (priority order):
    //   1. Dictionary score  — more real words = correct spelling
    //   2. Combined frequency — more common = more likely intended
    //   3. Longer string     — deletion typo assumption
    //   4. Alphabetical      — deterministic final tie-break
    const canonicalKey = members.reduce((best, v) => {
      const scoreV    = spellingScore(foldedBest.get(v)    ?? v);
      const scoreBest = spellingScore(foldedBest.get(best) ?? best);
      if (scoreV    > scoreBest) return v;
      if (scoreBest > scoreV)    return best;

      const cntV    = foldedTotal.get(v)    ?? 0;
      const cntBest = foldedTotal.get(best) ?? 0;
      if (cntV    > cntBest) return v;
      if (cntBest > cntV)    return best;

      if (v.length    > best.length) return v;
      if (best.length > v.length)    return best;

      return v < best ? v : best;
    });

    const canonicalOrig = foldedBest.get(canonicalKey)!;

    for (const memberKey of members) {
      if (memberKey === canonicalKey) continue;

      // Store lowercase key (case-insensitive lookup) + all original-casing variants.
      result.set(memberKey, canonicalOrig);
      for (const orig of candidates) {
        if (orig !== memberKey && orig.toLowerCase() === memberKey) {
          result.set(orig, canonicalOrig);
        }
      }
    }
  }

  return result;
}
