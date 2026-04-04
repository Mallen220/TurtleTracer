// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAlignmentMenuItems } from "../../utils/alignmentMenu";

describe("getAlignmentMenuItems", () => {
  const onUpdate = vi.fn();
  const onRecordChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const startPoint = {
    x: 10,
    y: 10,
    locked: false,
    control1: { x: 0, y: 0 },
    control2: { x: 0, y: 0 },
  } as any;
  const lines = [
    {
      endPoint: { x: 20, y: 30, locked: false },
      controlPoints: [{ x: 15, y: 25, locked: false }],
      locked: false,
    },
    {
      endPoint: { x: 30, y: 50, locked: false },
      controlPoints: [],
      locked: false,
    },
  ] as any[];

  it("should return basic menu structure", () => {
    const items = getAlignmentMenuItems(
      ["point-0-0", "point-1-0"],
      startPoint,
      lines,
      onUpdate,
      onRecordChange,
    );
    expect(items.length).toBeGreaterThan(3);
    expect(items[0].label).toBe("Selected Points: 2");
    expect(items[1].separator).toBe(true);
    expect(items.find((i) => i.label === "Align Horizontal (Y)")).toBeDefined();
    expect(items.find((i) => i.label === "Align Vertical (X)")).toBeDefined();
  });

  it("should calculate correct average for Align Horizontal (Y)", () => {
    const items = getAlignmentMenuItems(
      ["point-0-0", "point-1-0"],
      startPoint,
      lines,
      onUpdate,
      onRecordChange,
    );
    const alignY = items.find((i) => i.label === "Align Horizontal (Y)");

    alignY.onClick();
    // start (10, 10), line1 end (20, 30). Avg Y = 20.
    expect(onUpdate).toHaveBeenCalled();
    expect(startPoint.y).toBe(20);
    expect(lines[0].endPoint.y).toBe(20);
    expect(onRecordChange).toHaveBeenCalledWith("Align Horizontal");
  });

  it("should calculate correct average for Align Vertical (X)", () => {
    // reset mock state
    startPoint.x = 10;
    startPoint.y = 10;
    lines[0].endPoint.x = 20;
    lines[0].endPoint.y = 30;

    const items = getAlignmentMenuItems(
      ["point-0-0", "point-1-0"],
      startPoint,
      lines,
      onUpdate,
      onRecordChange,
    );
    const alignX = items.find((i) => i.label === "Align Vertical (X)");

    alignX.onClick();
    // start (10, 10), line1 end (20, 30). Avg X = 15.
    expect(onUpdate).toHaveBeenCalled();
    expect(startPoint.x).toBe(15);
    expect(lines[0].endPoint.x).toBe(15);
    expect(onRecordChange).toHaveBeenCalledWith("Align Vertical");
  });

  it("should add distribute options if more than 2 points selected", () => {
    const items = getAlignmentMenuItems(
      ["point-0-0", "point-1-0", "point-2-0"],
      startPoint,
      lines,
      onUpdate,
      onRecordChange,
    );
    expect(
      items.find((i) => i.label === "Distribute Horizontally (X)"),
    ).toBeDefined();
    expect(
      items.find((i) => i.label === "Distribute Vertically (Y)"),
    ).toBeDefined();
  });

  it("should calculate correct distribution for Distribute Horizontally", () => {
    startPoint.x = 10;
    lines[0].endPoint.x = 50;
    lines[1].endPoint.x = 40; // Should sort to 10, 40, 50 -> 10, 30, 50

    const items = getAlignmentMenuItems(
      ["point-0-0", "point-1-0", "point-2-0"],
      startPoint,
      lines,
      onUpdate,
      onRecordChange,
    );
    const distX = items.find((i) => i.label === "Distribute Horizontally (X)");

    distX.onClick();

    // Check sorting and step (step = (50-10)/2 = 20)
    // start: 10, lines[1].end: 30, lines[0].end: 50.
    expect(startPoint.x).toBe(10);
    expect(lines[1].endPoint.x).toBe(30);
    expect(lines[0].endPoint.x).toBe(50);
  });

  it("should calculate correct distribution for Distribute Vertically", () => {
    startPoint.y = 10;
    lines[0].endPoint.y = 50;
    lines[1].endPoint.y = 40; // Should sort to 10, 40, 50 -> 10, 30, 50

    const items = getAlignmentMenuItems(
      ["point-0-0", "point-1-0", "point-2-0"],
      startPoint,
      lines,
      onUpdate,
      onRecordChange,
    );
    const distY = items.find((i) => i.label === "Distribute Vertically (Y)");

    distY.onClick();

    expect(startPoint.y).toBe(10);
    expect(lines[1].endPoint.y).toBe(30);
    expect(lines[0].endPoint.y).toBe(50);
  });
});
