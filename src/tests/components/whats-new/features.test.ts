// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";

// Because `import.meta.glob` is processed by Vite *before* the code runs,
// dynamic mocking of it is hard in vitest without babel plugins.
// We will mock `compareVersions` indirectly by testing the final export,
// and add a test case to cover the default properties to increase coverage.

describe("features module", () => {
  let mod: any;

  beforeEach(async () => {
    vi.resetModules();
    mod = await import("../../../lib/components/whats-new/features/index");
  });

  it("should have features array, getLatestHighlightId, and getAllFeatures", () => {
    expect(Array.isArray(mod.features)).toBe(true);

    const latest = mod.getLatestHighlightId();
    expect(latest).toBeDefined();

    const all = mod.getAllFeatures();
    expect(Array.isArray(all)).toBe(true);
  });

  it("should return newestFeature or fallback correctly", () => {
    // If dev env and newest feature exists
    const latest = mod.getLatestHighlightId();
    if (mod.getAllFeatures().some((f: any) => f.id === "newest")) {
      expect(latest).toBe("newest");
    } else {
      expect(latest).toBe(mod.features[0]?.id);
    }
  });
});
