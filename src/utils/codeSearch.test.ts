// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  findMatches,
  lineStartOffsets,
  lowerBound,
  MAX_SEARCH_MATCHES,
} from "./codeSearch";

describe("findMatches", () => {
  it("finds every occurrence, ignoring case", () => {
    expect(findMatches("Apple apple APPLE", "apple")).toEqual({
      offsets: [0, 6, 12],
      capped: false,
    });
  });

  it("counts several hits on one line separately", () => {
    expect(findMatches("a a a\nb", "a").offsets).toEqual([0, 2, 4]);
  });

  it("does not overlap matches", () => {
    expect(findMatches("aaaa", "aa").offsets).toEqual([0, 2]);
  });

  it("finds text in the first lines (license, package, imports)", () => {
    const code = "// Copyright\npackage a.b;\nimport x.Y;\nclass A {}";
    expect(findMatches(code, "copyright").offsets).toEqual([3]);
    expect(findMatches(code, "import").offsets).toEqual([
      code.indexOf("import"),
    ]);
  });

  it("returns nothing for an empty query or no match", () => {
    expect(findMatches("abc", "")).toEqual({ offsets: [], capped: false });
    expect(findMatches("abc", "z")).toEqual({ offsets: [], capped: false });
  });

  it("caps the count so a one-letter search stays cheap", () => {
    const result = findMatches("a".repeat(50_000), "a");
    expect(result.offsets).toHaveLength(MAX_SEARCH_MATCHES);
    expect(result.capped).toBe(true);
  });

  it("keeps offsets right when lowercasing changes the length", () => {
    // "İ" lowercases to two characters
    const code = "İx x";
    expect(findMatches(code, "x").offsets).toEqual([1, 3]);
  });
});

describe("lowerBound", () => {
  it("finds the first value at or above the target", () => {
    expect(lowerBound([1, 3, 5], 0)).toBe(0);
    expect(lowerBound([1, 3, 5], 3)).toBe(1);
    expect(lowerBound([1, 3, 5], 4)).toBe(2);
    expect(lowerBound([1, 3, 5], 9)).toBe(3);
  });
});

describe("lineStartOffsets", () => {
  it("lists where each line starts", () => {
    expect(lineStartOffsets("ab\ncd\n\nx")).toEqual([0, 3, 6, 7]);
    expect(lineStartOffsets("")).toEqual([0]);
  });
});
