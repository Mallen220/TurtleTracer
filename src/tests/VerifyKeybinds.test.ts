// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { DEFAULT_KEY_BINDINGS } from "../config/defaults";

describe("Keybindings", () => {
  it("should include select-next and select-prev", () => {
    const selectNext = DEFAULT_KEY_BINDINGS.find((b) => b.id === "select-next");
    const selectPrev = DEFAULT_KEY_BINDINGS.find((b) => b.id === "select-prev");

    expect(selectNext).toBeDefined();
    expect(selectNext?.key).toBe("alt+]");

    expect(selectPrev).toBeDefined();
    expect(selectPrev?.key).toBe("alt+[");
  });
});
