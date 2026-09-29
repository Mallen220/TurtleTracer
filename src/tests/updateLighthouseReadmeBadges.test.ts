// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, expect, it } from "vitest";
import { replaceBetweenMarkers } from "../../scripts/update-lighthouse-readme-badges.js";

describe("update-lighthouse-readme-badges", () => {
  it("replaces the lighthouse badge block without requiring a global regex", () => {
    const input = [
      "before",
      "  <!-- LIGHTHOUSE_BADGES_START -->",
      "  <p>old badges</p>",
      "  <!-- LIGHTHOUSE_BADGES_END -->",
      "after",
    ].join("\n");

    const output = replaceBetweenMarkers(input, "  <p>new badges</p>");

    expect(output).toContain("before");
    expect(output).toContain("after");
    expect(output).toContain("<p>new badges</p>");
    expect(output).not.toContain("old badges");
  });

  it("keeps the text around the block and drops the whitespace before it", () => {
    const input =
      "before\n\n   \n  <!-- LIGHTHOUSE_BADGES_START -->old<!-- LIGHTHOUSE_BADGES_END -->\nafter";

    expect(replaceBetweenMarkers(input, "  new")).toBe("before\n  new\nafter");
  });

  it("only replaces the first block", () => {
    const block =
      "<!-- LIGHTHOUSE_BADGES_START -->x<!-- LIGHTHOUSE_BADGES_END -->";
    const output = replaceBetweenMarkers(`a ${block} b ${block}`, "NEW");

    expect(output).toBe(`a\nNEW b ${block}`);
  });

  it.each([
    ["no markers", "just text"],
    ["no end marker", "<!-- LIGHTHOUSE_BADGES_START --> never closed"],
    ["no start marker", "never opened <!-- LIGHTHOUSE_BADGES_END -->"],
    [
      "markers in the wrong order",
      "<!-- LIGHTHOUSE_BADGES_END --> <!-- LIGHTHOUSE_BADGES_START -->",
    ],
  ])("throws with %s", (_name, input) => {
    expect(() => replaceBetweenMarkers(input, "new")).toThrow(
      /Could not find LIGHTHOUSE_BADGES markers/,
    );
  });

  it("stays fast on long runs of whitespace without the markers", () => {
    const input = " ".repeat(200_000) + "x";
    const started = performance.now();

    expect(() => replaceBetweenMarkers(input, "new")).toThrow();
    expect(performance.now() - started).toBeLessThan(500);
  });
});
