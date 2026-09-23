// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";

describe("FieldImageLayer", () => {
  it("can be imported without errors", async () => {
    const mod = await import("./FieldImageLayer.svelte");
    expect(mod.default).toBeDefined();
  });
});
