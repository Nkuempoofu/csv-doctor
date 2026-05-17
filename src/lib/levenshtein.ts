/**
 * Levenshtein distance and fuzzy-replacement utilities.
 *
 * buildFuzzyReplacements finds near-duplicate string values
 * (e.g. "Soth Africa" vs "South Africa") and maps each misspelling to the
 * most-frequent canonical form, using Union-Find for transitive grouping.
 */

/**
 * Classic Levenshtein edit distance — space-optimised O(min(m,n)) memory.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Ensure a is the shorter string to minimise the working array size
  if (a.length > b.length) { const t = a; a = b; b = t; }

  const lenA = a.length;
  const lenB = b.length;

  // prev[i] = cost of converting a[0..i-1] to b[0..j-1] at the previous j
  const prev: number[] = Array.from({ length: lenA + 1 }, (_, i) => i);

  for (let j = 1; j <= lenB; j++) {
    const curr = new Array<number>(lenA + 1);
    curr[0] = j;
    for (let i = 1; i <= lenA; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        curr[i - 1] + 1,     // insert
        prev[i] + 1,         // delete
        prev[i - 1] + cost   // substitute
      );
    }
    for (let i = 0; i <= lenA; i++) prev[i] = curr[i];
  }

  return prev[lenA];
}

/**
 * Maximum edit distance allowed for two strings to be considered near-duplicates.
 * Longer values can tolerate more edits.
 */
function editThreshold(a: string, b: string): number {
  return Math.max(a.length, b.length) >= 8 ? 2 : 1;
}

/* ── Union-Find (path-compressed) ────────────────────── */

class UnionFind {
  private readonly parent = new Map<string, string>();

  find(x: string): string {
    if (!this.parent.has(x)) return x;
    const root = this.find(this.parent.get(x)!);
    this.parent.set(x, root); // path compression
    return root;
  }

  union(x: string, y: string): void {
    const rx = this.find(x);
    const ry = this.find(y);
    if (rx !== ry) this.parent.set(rx, ry);
  }
}

/**
 * Given a list of unique string values and their occurrence counts, return a
 * Map<misspelling → canonical> where canonical is the most-frequent member of
 * each near-duplicate group.
 *
 * Values shorter than `minLen` characters are skipped to avoid false positives
 * on short tokens. The comparison is case-insensitive, but the original casing
 * is preserved in the output map.
 *
 * Complexity: O(n²) comparisons — acceptable because callers cap unique values
 * at 50 per column.
 */
export function buildFuzzyReplacements(
  unique: string[],
  counts: Map<string, number>,
  minLen = 4
): Map<string, string> {
  const candidates = unique.filter(v => v.length >= minLen);
  if (candidates.length < 2) return new Map();

  const uf = new UnionFind();

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      const dist = levenshtein(a.toLowerCase(), b.toLowerCase());
      if (dist > 0 && dist <= editThreshold(a, b)) {
        uf.union(a, b);
      }
    }
  }

  // Group all candidates by their root
  const groups = new Map<string, string[]>();
  for (const v of candidates) {
    const root = uf.find(v);
    const existing = groups.get(root);
    if (existing) existing.push(v);
    else groups.set(root, [v]);
  }

  const result = new Map<string, string>();

  for (const members of groups.values()) {
    if (members.length < 2) continue; // singleton — no near-duplicate pairing

    // Canonical = most frequent (tie-break: alphabetically earlier)
    const canonical = members.reduce((best, v) => {
      const cntV    = counts.get(v)    ?? 0;
      const cntBest = counts.get(best) ?? 0;
      if (cntV > cntBest) return v;
      if (cntV === cntBest && v < best) return v;
      return best;
    });

    for (const m of members) {
      if (m !== canonical) result.set(m, canonical);
    }
  }

  return result;
}
