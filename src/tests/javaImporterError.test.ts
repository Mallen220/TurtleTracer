// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi } from "vitest";
import { importJavaProject } from "../utils/javaImporter";

describe("javaImporter error path", () => {
  it("returns fallback empty data on invalid java code", () => {
    // Mock console.error to keep test output clean
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const invalidJavaCode = `
      public class InvalidClass {
        this is not valid java
    `;
    const data = importJavaProject(invalidJavaCode);

    expect(data.startPoint).toEqual({
      x: 0,
      y: 0,
      heading: "linear",
      startDeg: 0,
      endDeg: 0,
    });
    expect(data.lines).toEqual([]);
    expect(data.sequence).toEqual([]);
    expect(data.shapes).toEqual([]);

    expect(consoleSpy).toHaveBeenCalledWith(
      "Failed to parse Java code:",
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });
});
