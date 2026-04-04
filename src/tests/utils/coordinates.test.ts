// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  toUser,
  toField,
  toUserHeading,
  toFieldHeading,
} from "../../utils/coordinates";

describe("coordinates", () => {
  it("should convert toUser", () => {
    expect(toUser({ x: 10, y: 20 }, "Pedro")).toEqual({ x: 10, y: 20 });
    // FTC: x = 72 - 20 = 52, y = 10 - 72 = -62
    expect(toUser({ x: 10, y: 20 }, "FTC")).toEqual({ x: 52, y: -62 });
  });

  it("should convert toField", () => {
    expect(toField({ x: 10, y: 20 }, "Pedro")).toEqual({ x: 10, y: 20 });
    // FTC: x = 20 + 72 = 92, y = 72 - 10 = 62
    expect(toField({ x: 10, y: 20 }, "FTC")).toEqual({ x: 92, y: 62 });
  });

  it("should convert headings", () => {
    expect(toUserHeading(45, "Pedro")).toBe(45);
    expect(toFieldHeading(45, "FTC")).toBe(45);
  });
});
