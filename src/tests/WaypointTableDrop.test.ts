// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// src/tests/WaypointTableDrop.test.ts
import { render } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Point } from "../types";
import WaypointTable from "../lib/components/WaypointTable.svelte";
import { loadMacro } from "../lib/projectStore";
import { DEFAULT_SETTINGS } from "../config/defaults";

// Mock loadMacro
vi.mock("../lib/projectStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/projectStore")>();
  return {
    ...actual,
    loadMacro: vi.fn(),
  };
});

describe("WaypointTable Drop Handling", () => {
  const defaultProps = {
    startPoint: {
      x: 0,
      y: 0,
      heading: "tangential",
      reverse: false,
      locked: false,
    } as Point,
    lines: [],
    sequence: [],
    recordChange: vi.fn(),
    shapes: [],
    collapsedObstacles: [],
    settings: DEFAULT_SETTINGS,
    // Added missing props
    handleOptimizationApply: vi.fn(),
    onPreviewChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const triggerDropEvent = () => {
    const dropEvent = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, "dataTransfer", {
      value: {
        types: ["application/x-turtle-tracer-macro"],
        getData: (type: string) =>
          type === "application/x-turtle-tracer-macro" ? "test.pp" : "",
        effectAllowed: "move",
      },
    });
    globalThis.dispatchEvent(dropEvent);
  };

  it("handles macro drop when isActive is true (default)", async () => {
    render(WaypointTable, { ...defaultProps });
    triggerDropEvent();
    expect(loadMacro).toHaveBeenCalledWith("test.pp");
  });

  it("does NOT handle macro drop when isActive is false", async () => {
    render(WaypointTable, {
      ...defaultProps,
      isActive: false,
    });
    triggerDropEvent();
    expect(loadMacro).not.toHaveBeenCalled();
  });

  it("handles macro drop when isActive is explicitly true", async () => {
    render(WaypointTable, {
      ...defaultProps,
      isActive: true,
    });
    triggerDropEvent();
    expect(loadMacro).toHaveBeenCalledWith("test.pp");
  });
});
