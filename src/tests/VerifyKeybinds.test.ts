// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { DEFAULT_KEY_BINDINGS } from "../config/keybindings";

describe("Keybindings", () => {
  it("should include select-next-sequence and select-prev-sequence", () => {
    const selectNext = DEFAULT_KEY_BINDINGS.find((b) => b.id === "select-next-sequence");
    const selectPrev = DEFAULT_KEY_BINDINGS.find((b) => b.id === "select-prev-sequence");

    expect(selectNext).toBeDefined();
    expect(selectNext?.key).toBe("ctrl+down, cmd+down, tab");

    expect(selectPrev).toBeDefined();
    expect(selectPrev?.key).toBe("ctrl+up, cmd+up, shift+tab");
  });
});
