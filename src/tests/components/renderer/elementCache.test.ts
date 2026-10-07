// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi } from "vitest";
import { ElementCache } from "../../../lib/components/renderer/ElementCache";

describe("ElementCache", () => {
  it("builds once while the dependencies stay the same", () => {
    const cache = new ElementCache<object>();
    const dep = {};
    const build = vi.fn(() => ({}));
    const first = cache.get("k", [dep, 1], build);
    expect(cache.get("k", [dep, 1], build)).toBe(first);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("rebuilds when any dependency changes, compared by identity", () => {
    const cache = new ElementCache<object>();
    const first = cache.get("k", [{ a: 1 }], () => ({}));
    expect(cache.get("k", [{ a: 1 }], () => ({}))).not.toBe(first);

    const dep = {};
    const second = cache.get("k", [dep, 1], () => ({}));
    expect(cache.get("k", [dep, 2], () => ({}))).not.toBe(second);
    expect(cache.get("k", [dep], () => ({}))).not.toBe(second);
  });

  it("keeps keys separate", () => {
    const cache = new ElementCache<string>();
    cache.get("a", [], () => "a");
    expect(cache.get("b", [], () => "b")).toBe("b");
    expect(cache.get("a", [], () => "rebuilt")).toBe("a");
  });

  it("forgets entries not asked for since the last sweep", () => {
    const cache = new ElementCache<string>();
    cache.get("kept", [], () => "kept");
    cache.get("dropped", [], () => "dropped");
    cache.sweep();

    cache.get("kept", [], () => "rebuilt");
    cache.sweep();

    expect(cache.get("kept", [], () => "rebuilt")).toBe("kept");
    expect(cache.get("dropped", [], () => "rebuilt")).toBe("rebuilt");
  });
});
