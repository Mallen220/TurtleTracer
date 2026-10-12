// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { readableTextOn } from "./readableText";

describe("readableTextOn", () => {
  it("uses white on dark colors", () => {
    expect(readableTextOn("#7c3aed")).toBe("#ffffff");
    expect(readableTextOn("#000")).toBe("#ffffff");
  });

  it("uses black on light colors", () => {
    expect(readableTextOn("#facc15")).toBe("#000000");
    expect(readableTextOn("#ffffff")).toBe("#000000");
  });

  it("falls back to white for anything that isn't a hex color", () => {
    expect(readableTextOn("rebeccapurple")).toBe("#ffffff");
    expect(readableTextOn("")).toBe("#ffffff");
  });
});
