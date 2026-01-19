// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import PathStatisticsDialog from "../lib/components/PathStatisticsDialog.svelte";
import type { Point, Line, SequenceItem, Settings } from "../types";

// Mock d3 since we are testing in a headless environment and JSDOM might struggle with some SVG details
// But actually, we want to test if the component renders. SimpleChart uses d3.
// We can mock SimpleChart if needed, but let's try rendering the whole thing first.
// If SimpleChart fails, we might need to mock d3 or the component.

describe("PathStatisticsDialog", () => {
  let defaultStartPoint: Point;
  let defaultLines: Line[];
  let defaultSequence: SequenceItem[];
  let defaultSettings: Settings;

  beforeEach(() => {
    defaultStartPoint = { x: 0, y: 0, heading: "tangential", reverse: false };
    defaultLines = [
      {
        id: "line1",
        endPoint: { x: 10, y: 10, heading: "tangential", reverse: false },
        controlPoints: [],
        color: "#000000",
      },
    ];
    defaultSequence = [{ kind: "path", lineId: "line1" }];
    defaultSettings = {
      rLength: 12,
      rWidth: 12,
      maxVelocity: 10,
      maxAcceleration: 10,
      aVelocity: Math.PI,
      xVelocity: 10,
      yVelocity: 10,
      kFriction: 0,
      safetyMargin: 0,
      fieldMap: "centerstage.webp",
      theme: "light",
    };
  });

  it("renders summary stats correctly", () => {
    const { getByText, getAllByText } = render(PathStatisticsDialog, {
      startPoint: defaultStartPoint,
      lines: defaultLines,
      sequence: defaultSequence,
      settings: defaultSettings,
      isOpen: true,
      onClose: vi.fn(),
    });

    expect(getByText("Path Statistics")).toBeTruthy();
    expect(getAllByText("Total Time").length).toBeGreaterThan(0);
  });

  it("switches to graphs tab", async () => {
    const { getByText, getAllByText, container } = render(
      PathStatisticsDialog,
      {
        startPoint: defaultStartPoint,
        lines: defaultLines,
        sequence: defaultSequence,
        settings: defaultSettings,
        isOpen: true,
        onClose: vi.fn(),
      },
    );

    const graphsTab = getByText("Graphs");
    expect(graphsTab).toBeTruthy();

    await fireEvent.click(graphsTab);

    expect(getByText("Velocity Profile (in/s)")).toBeTruthy();
    expect(getByText("Angular Velocity Profile (rad/s)")).toBeTruthy();
  });
});
