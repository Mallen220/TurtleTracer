// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  frameCountFor,
  frameMemoryBytes,
  formatBytes,
  GIF_FPS,
  APNG_FPS,
} from "./animationExportPlan";

describe("animationExportPlan", () => {
  it("counts frames, never fewer than 2", () => {
    expect(frameCountFor(10, 15)).toBe(150);
    expect(frameCountFor(0, 15)).toBe(2);
  });

  it("estimates raw RGBA memory", () => {
    expect(frameMemoryBytes(100, 50, 2)).toBe(40000);
  });

  it("formats sizes", () => {
    expect(formatBytes(100)).toBe("1 KB");
    expect(formatBytes(2.5 * 1024 ** 2)).toBe("2.5 MB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3.0 GB");
  });

  it("keeps the high frame rates to APNG", () => {
    expect(GIF_FPS).not.toContain(60);
    expect(APNG_FPS).toContain(60);
    expect(APNG_FPS).not.toContain(120);
  });
});
