// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.

/**
 * Reuses Two.js shapes between redraws. Each entry is rebuilt only when one
 * of the values it was built from changes, so dragging one point rebuilds the
 * paths that touch it rather than every path on the field.
 *
 * Shapes can only be in one scene at a time, so each field renderer needs its
 * own cache, and keys must be unique within a redraw. Call `sweep()` at the
 * end of each redraw to forget entries that weren't asked for.
 */
export class ElementCache<T> {
  #entries = new Map<string, { deps: readonly unknown[]; value: T }>();
  #used = new Set<string>();

  /**
   * The value cached under `key`, or a new one from `build` if any of `deps`
   * differ from last time.
   */
  get(key: string, deps: readonly unknown[], build: () => T): T {
    this.#used.add(key);
    const hit = this.#entries.get(key);
    if (
      hit?.deps.length === deps.length &&
      hit.deps.every((dep, i) => Object.is(dep, deps[i]))
    ) {
      return hit.value;
    }
    const value = build();
    this.#entries.set(key, { deps, value });
    return value;
  }

  /** Forgets entries that haven't been asked for since the last sweep. */
  sweep(): void {
    for (const key of this.#entries.keys()) {
      if (!this.#used.has(key)) this.#entries.delete(key);
    }
    this.#used.clear();
  }
}
