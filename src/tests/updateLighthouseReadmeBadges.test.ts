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
});
