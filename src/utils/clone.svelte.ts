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
  // It returns a plain object representation of the state.
  const raw = $state.snapshot(obj) as T;
  
  // Use structuredClone for a deep copy of the plain object
  try {
    return structuredClone(raw);
  } catch (e) {
    // Fallback if structuredClone fails for other reasons (e.g. non-clonable types)
    return JSON.parse(JSON.stringify(raw));
  }
}
