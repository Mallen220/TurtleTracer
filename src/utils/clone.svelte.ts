// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.

/**
 * Safely clones a Svelte 5 reactive proxy by first taking a snapshot
 * to unwrap the proxy, and then using native structuredClone.
 * 
 * @param obj The object (potentially a Svelte 5 proxy) to clone
 * @returns A deep clone of the object as a plain JS object
 */
export function snapshotClone<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  
  // $state.snapshot() is used to "unwrap" Svelte 5 proxies.
  // It returns a deep-cloned plain object representation of the state.
  const snapped = $state.snapshot(obj) as T;
  
  // If the result is a different reference than the input, it was a proxy 
  // and Svelte has already performed a deep clone.
  if (snapped !== obj) {
    return snapped;
  }
  
  // Otherwise, it was a plain object. We perform a structuredClone to ensure 
  // we return a genuine deep copy as expected by callers.
  try {
    return structuredClone(snapped);
  } catch (e) {
    // Fallback if structuredClone fails for other reasons (e.g. non-clonable types)
    return JSON.parse(JSON.stringify(snapped));
  }
}
