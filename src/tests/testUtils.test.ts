// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeEach } from "vitest";
import { isPathItem, isMacroItem } from "./testUtils";
import { actionRegistry } from "../lib/actionRegistry";
import { registerCoreUI } from "../lib/coreRegistrations";
import type { SequenceItem } from "../types";

describe("testUtils - SequenceItem Guards", () => {
  beforeEach(() => {
    actionRegistry.reset();
    registerCoreUI();
  });

  it("identifies a path item correctly", () => {
    const item: SequenceItem = {
      kind: "path",
      lineId: "123",
    };
    expect(isPathItem(item)).toBe(true);
    expect(isMacroItem(item)).toBe(false);
  });

  it("identifies a macro item correctly", () => {
    const item: SequenceItem = {
      kind: "macro",
      id: "m1",
      filePath: "test.pp",
      name: "Test",
    };
    expect(isMacroItem(item)).toBe(true);
    expect(isPathItem(item)).toBe(false);
  });

  it("returns false for non-path and non-macro items", () => {
    const waitItem: SequenceItem = {
      kind: "wait",
      id: "w1",
      name: "Wait",
      durationMs: 1000,
    };
    expect(isPathItem(waitItem)).toBe(false);
    expect(isMacroItem(waitItem)).toBe(false);

    const rotateItem: SequenceItem = {
      kind: "rotate",
      id: "r1",
      name: "Rotate",
      degrees: 90,
    };
    expect(isPathItem(rotateItem)).toBe(false);
    expect(isMacroItem(rotateItem)).toBe(false);
  });
});
