// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
/** Most matches the Find box will count; past this it shows "9999+". */
export const MAX_SEARCH_MATCHES = 9999;

export interface SearchResult {
  /** Where each match starts in the code, in order. */
  offsets: number[];
  /** True when more matches exist than MAX_SEARCH_MATCHES. */
  capped: boolean;
}

/**
 * Every place `query` occurs in `code`, ignoring case. Matches never overlap
 * ("aa" in "aaaa" is two). One pass of indexOf, so a one-letter search over a
 * long file stays cheap, and the count is capped.
 */
export function findMatches(code: string, query: string): SearchResult {
  if (!query) return { offsets: [], capped: false };

  let haystack = code.toLowerCase();
  let needle = query.toLowerCase();
  // A few characters change length when lowercased, which would shift every
  // offset after them. Fall back to an exact-case search for those files.
  if (haystack.length !== code.length || needle.length !== query.length) {
    haystack = code;
    needle = query;
  }

  const offsets: number[] = [];
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) break;
    if (offsets.length >= MAX_SEARCH_MATCHES) return { offsets, capped: true };
    offsets.push(at);
    from = at + needle.length;
  }
  return { offsets, capped: false };
}

/** Index of the first element of the sorted `values` that is >= `target`. */
export function lowerBound(values: number[], target: number): number {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (values[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The offset where each line of `code` starts. */
export function lineStartOffsets(code: string): number[] {
  const starts = [0];
  let at = code.indexOf("\n");
  while (at >= 0) {
    starts.push(at + 1);
    at = code.indexOf("\n", at + 1);
  }
  return starts;
}
