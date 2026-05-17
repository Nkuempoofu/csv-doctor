/**
 * Levenshtein distance and fuzzy-replacement utilities.
 *
 * buildFuzzyReplacements finds near-duplicate string values
 * (e.g. "Soth Africa" vs "South Africa") and maps each misspelling to the
 * canonical form, using Union-Find for transitive grouping.
 *
 * Canonical selection strategy
 * ─────────────────────────────
 * 1. Longer string wins — the overwhelming majority of real-world typos are
 *    deletions (a key was skipped), so the correct word is usually the longer
 *    one ("South Africa" > "Soth Africa", "Finance" > "Finace").
 * 2. Equal length → more frequent wins (case-folded, so "South Africa" +
 *    "south africa" are summed) — handles substitutions and transpositions.
 * 3. Equal length + equal frequency → alphabetically first.
 *
 * The edit threshold is strictly 1 character. Allowing distance 2 for longer
 * strings risks false positives like "South Africa" / "North Africa" (distance
 * 2 — two substitutions), which are legitimately distinct values.
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
 * Given a list of unique string values and their occurrence counts, return a
 * Map<misspelling → canonical> for every near-duplicate cluster.
 *
 * Design decisions:
 *
 * • **Strict edit distance of 1** — only pairs that differ by exactly one
 *   character insertion, deletion, or substitution are grouped. This rules out
 *   false positives like "South Africa" / "North Africa" (distance 2).
 *
 * • **Case-folded frequency totals** — "South Africa" (3) + "south africa" (5)
 *   = 8 combined. This prevents the correct spelling's count from being split
 *   across capitalisation variants, making it appear less frequent than the typo.
 *
 * • **Longer string is canonical** — deletion typos (the most common kind) make
 *   the correct word longer than the misspelling. This heuristic picks the right
 *   side without needing a dictionary. Equal-length pairs fall back to frequency.
 *
 * • **No minimum-ratio guard** — within a strict edit distance of 1, the chance
 *   of two truly-distinct values is very low. Requiring a frequency ratio would
 *   silently skip obvious typos when a misspelling is common in the dataset.
 *
 * Values shorter than `minLen` are skipped to avoid false positives on very
 * short tokens. Complexity: O(n²) — acceptable because callers cap at 50 unique
 * values per column.
 */
export function buildFuzzyReplacements(
  unique: string[],
  counts: Map<string, number>,
  minLen = 4
): Map<string, string> {
  const candidates = unique.filter(v => v.length >= minLen);
  if (candidates.length < 2) return new Map();

  // Step 1: Aggregate frequency across capitalisation variants.
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
  if (foldedKeys.length < 2) return new Map();

  // Step 2: Union-Find over deduplicated lowercase forms — strict distance 1 only.
  const uf = new UnionFind();

  for (let i = 0; i < foldedKeys.length; i++) {
    for (let j = i + 1; j < foldedKeys.length; j++) {
      const a = foldedKeys[i];
      const b = foldedKeys[j];
      if (levenshtein(a, b) === 1) {
        uf.union(a, b);
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
  const result = new Map<string, string>();

  for (const members of groups.values()) {
    if (members.length < 2) continue;

    // Canonical selection:
    //   1. Longer string (deletion typo assumption — correct word is usually longer)
    //   2. Higher case-folded frequency (tie-break for equal lengths)
    //   3. Alphabetically first (final tie-break)
    const canonicalKey = members.reduce((best, v) => {
      const lenV    = v.length;
      const lenBest = best.length;
      if (lenV    > lenBest) return v;
      if (lenBest > lenV)    return best;
      // Same length — use combined frequency
      const cntV    = foldedTotal.get(v)    ?? 0;
      const cntBest = foldedTotal.get(best) ?? 0;
      if (cntV    > cntBest) return v;
      if (cntBest > cntV)    return best;
      return v < best ? v : best; // alphabetical
    });

    const canonicalOrig = foldedBest.get(canonicalKey)!;

    for (const memberKey of members) {
      if (memberKey === canonicalKey) continue;

      // Store both the lowercase key (enables case-insensitive lookup) and every
      // exact-casing variant present in the source data (enables exact lookup).
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
