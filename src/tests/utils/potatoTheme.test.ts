// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi } from "vitest";
import { POTATO_THEME_CSS, firePotatoConfetti } from "../../utils/potatoTheme";

describe("potatoTheme", () => {
  it("should export CSS string", () => {
    expect(POTATO_THEME_CSS).toContain("--potato-flesh");
  });

  it("should fire potato confetti by appending to DOM and removing later", () => {
    vi.useFakeTimers();

    // Check initial state
    expect(
      document.body.querySelectorAll("img[src='/Potato.png']").length,
    ).toBe(0);

    firePotatoConfetti(100, 100);

    // It creates 10 particles
    const particles = document.body.querySelectorAll("img[src='/Potato.png']");
    expect(particles.length).toBe(10);

    // Run timers to trigger the removal
    vi.runAllTimers();

    // Should be cleaned up
    expect(
      document.body.querySelectorAll("img[src='/Potato.png']").length,
    ).toBe(0);

    vi.useRealTimers();
  });
});
