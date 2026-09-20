/**
 * fuzzyMatch(query, target)
 * -------------------------
 * A small, dependency-free fuzzy matcher: true if every character of
 * `query` appears in `target`, in order (not necessarily contiguous),
 * case-insensitively — the same "subsequence" matching convention as
 * VS Code's command palette, GitHub's file finder, etc. Returns a score
 * (higher = better match) rather than just true/false, so callers can
 * rank results.
 *
 * Written by hand instead of adding a library (e.g. fuzzysort, ~5-9KB
 * gzipped): the command palette only ever scores a few hundred short
 * strings (nav labels, transaction descriptions) per keystroke, not
 * large documents — the kind of workload a general-purpose fuzzy-search
 * library is built for. A ~20-line scorer covers this case fully and
 * keeps the palette's bundle cost to just `cmdk` itself.
 *
 * Scoring, briefly: every matched character adds 1 point; consecutive
 * matched characters add a growing bonus (rewards "contig" matching
 * "contiguous" over "c-o-n-t-a-i-n-e-r-i-g" scattered across a longer
 * string); a match starting at the very beginning of the target gets a
 * flat bonus (rewards prefix matches, which are the most common way
 * people actually type into a command palette).
 *
 * Returns `null` (not a match) if any query character is missing from
 * the target in order — callers should filter these out before sorting.
 */
export function fuzzyMatch(query, target) {
  if (!query) return 0; // empty query matches everything, with no particular score
  if (!target) return null;

  const q = query.toLowerCase();
  const t = target.toLowerCase();

  let score = 0;
  let targetIndex = 0;
  let consecutiveRun = 0;

  for (let i = 0; i < q.length; i++) {
    const char = q[i];
    const foundAt = t.indexOf(char, targetIndex);
    if (foundAt === -1) return null; // this query character never appears — not a match at all

    if (foundAt === targetIndex) {
      consecutiveRun += 1;
      score += 1 + consecutiveRun; // growing bonus for each additional consecutive match
    } else {
      consecutiveRun = 0;
      score += 1;
    }
    if (foundAt === 0) score += 3; // prefix-of-target bonus

    targetIndex = foundAt + 1;
  }

  return score;
}

/**
 * fuzzySearch(query, items, getLabel)
 * ------------------------------------
 * Filters + ranks a list of items by fuzzyMatch score against
 * `getLabel(item)`, best matches first. Convenience wrapper so callers
 * don't re-implement the filter/sort/map dance at every call site.
 */
export function fuzzySearch(query, items, getLabel) {
  if (!query) return items;
  return items
    .map((item) => ({ item, score: fuzzyMatch(query, getLabel(item)) }))
    .filter((r) => r.score !== null)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.item);
}