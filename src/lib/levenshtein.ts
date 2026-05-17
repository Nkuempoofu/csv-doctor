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

/**
 * Minimum ratio of canonical frequency to misspelling frequency required
 * before we replace the misspelling with the canonical.
 *
 * A ratio of 3 means the dominant spelling must appear at least 3× as often
 * as the variant being replaced. This prevents two similarly-frequent values
 * (which might both be legitimate) from being merged based on a narrow lead.
 */
const MIN_FREQUENCY_RATIO = 3;

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
 * Key design decisions:
 *
 * 1. **Case-folded frequency totals** — "South Africa" (3) + "south africa" (5) are
 *    the same word; their combined count (8) is used when deciding which spelling wins
 *    over "Soth Africa" (2). Without this, a misspelling could appear to "win" simply
 *    because the correct spelling's count is split across case variants.
 *
 * 2. **Minimum frequency ratio** — the canonical must appear at least
 *    MIN_FREQUENCY_RATIO × more often than the variant being replaced. Values with
 *    similar frequencies are left untouched (they may be two legitimately distinct
 *    entries, not a typo at all).
 *
 * 3. **Lookup keys** — the returned map stores both the exact original casing and
 *    the lowercase form as keys, so callers can do a case-insensitive fallback
 *    without scanning the whole map.
 *
 * Values shorter than `minLen` characters are skipped to reduce false positives.
 * Complexity: O(n²) — acceptable because callers cap unique values at 50 per column.
 */
export function buildFuzzyReplacements(
  unique: string[],
  counts: Map<string, number>,
  minLen = 4
): Map<string, string> {
  const candidates = unique.filter(v => v.length >= minLen);
  if (candidates.length < 2) return new Map();

  // Step 1: Aggregate frequency across capitalisation variants.
  // All casing forms of the same word share a single combined count so that the
  // canonical-selection step sees the true popularity of each spelling.
  const foldedTotal = new Map<string, number>();  // lowercase → combined count
  const foldedBest  = new Map<string, string>();  // lowercase → most-frequent original casing

  for (const v of candidates) {
    const key = v.toLowerCase();
    const cnt = counts.get(v) ?? 0;
    foldedTotal.set(key, (foldedTotal.get(key) ?? 0) + cnt);
    const prev = foldedBest.get(key);
    if (!prev || cnt > (counts.get(prev) ?? 0)) foldedBest.set(key, v);
  }

  const foldedKeys = Array.from(foldedTotal.keys());
  if (foldedKeys.length < 2) return new Map();

  // Step 2: Union-Find over deduplicated lowercase forms.
  const uf = new UnionFind();

  for (let i = 0; i < foldedKeys.length; i++) {
    for (let j = i + 1; j < foldedKeys.length; j++) {
      const a = foldedKeys[i];
      const b = foldedKeys[j];
      const dist = levenshtein(a, b); // both already lowercase
      if (dist > 0 && dist <= editThreshold(a, b)) {
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

  // Step 4: For each near-duplicate cluster, pick canonical and build the map.
  const result = new Map<string, string>();

  for (const members of groups.values()) {
    if (members.length < 2) continue;

    // Canonical = highest combined frequency.
    // Tie-break: longer string (more complete, more likely the full/correct word),
    // then alphabetically earliest.
    const canonicalKey = members.reduce((best, v) => {
      const cntV    = foldedTotal.get(v)    ?? 0;
      const cntBest = foldedTotal.get(best) ?? 0;
      if (cntV > cntBest) return v;
      if (cntV === cntBest && v.length > best.length) return v;
      if (cntV === cntBest && v.length === best.length && v < best) return v;
      return best;
    });

    const canonicalCount = foldedTotal.get(canonicalKey)  ?? 0;
    const canonicalOrig  = foldedBest.get(canonicalKey)!; // best original casing

    for (const memberKey of members) {
      if (memberKey === canonicalKey) continue;

      const memberCount = foldedTotal.get(memberKey) ?? 0;

      // Guard: only replace when the canonical is clearly dominant.
      // If the counts are close, the "misspelling" may be a legitimate distinct value.
      if (memberCount > 0 && canonicalCount / memberCount < MIN_FREQUENCY_RATIO) continue;

      // Store the lowercase key so callers can do a case-insensitive lookup.
      result.set(memberKey, canonicalOrig);

      // Also store every exact-casing variant present in the source data so
      // the lookup succeeds even without lowercasing the cell value.
      for (const orig of candidates) {
        if (orig !== memberKey && orig.toLowerCase() === memberKey) {
          result.set(orig, canonicalOrig);
        }
      }
    }
  }

  return result;
}
