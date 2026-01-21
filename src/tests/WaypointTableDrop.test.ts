// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
// src/tests/WaypointTableDrop.test.ts
import { render, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Point } from "../types";
import WaypointTable from "../lib/components/WaypointTable.svelte";
import { loadMacro } from "../lib/projectStore";
import { DEFAULT_SETTINGS } from "../config/defaults";

// Mock loadMacro
vi.mock("../lib/projectStore", () => ({
  loadMacro: vi.fn(),
}));

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
    onToggleOptimization: vi.fn(),
    handleOptimizationApply: vi.fn(),
    onPreviewChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles macro drop when isActive is true (default)", async () => {
    const { component } = render(WaypointTable, { ...defaultProps });

    // Create a mock drag event
    const dropEvent = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, "dataTransfer", {
      value: {
        types: ["application/x-pedro-macro"],
        getData: (type: string) =>
          type === "application/x-pedro-macro" ? "test.pp" : "",
        effectAllowed: "move",
      },
    });

    // Fire drop on window
    window.dispatchEvent(dropEvent);

    // Expect loadMacro to be called
    expect(loadMacro).toHaveBeenCalledWith("test.pp");
  });

  it("does NOT handle macro drop when isActive is false", async () => {
    const { component } = render(WaypointTable, {
      ...defaultProps,
      isActive: false,
    });

    // Create a mock drag event
    const dropEvent = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, "dataTransfer", {
      value: {
        types: ["application/x-pedro-macro"],
        getData: (type: string) =>
          type === "application/x-pedro-macro" ? "test.pp" : "",
        effectAllowed: "move",
      },
    });

    // Fire drop on window
    window.dispatchEvent(dropEvent);

    // Expect loadMacro NOT to be called
    expect(loadMacro).not.toHaveBeenCalled();
  });

  it("handles macro drop when isActive is explicitly true", async () => {
    const { component } = render(WaypointTable, {
      ...defaultProps,
      isActive: true,
    });

    // Create a mock drag event
    const dropEvent = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, "dataTransfer", {
      value: {
        types: ["application/x-pedro-macro"],
        getData: (type: string) =>
          type === "application/x-pedro-macro" ? "test.pp" : "",
        effectAllowed: "move",
      },
    });

    // Fire drop on window
    window.dispatchEvent(dropEvent);

    // Expect loadMacro to be called
    expect(loadMacro).toHaveBeenCalledWith("test.pp");
  });
});
