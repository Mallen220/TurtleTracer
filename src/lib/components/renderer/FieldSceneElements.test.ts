// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import * as d3 from "d3";
import { generateAllSceneElements } from "./FieldSceneElements";
import type { Line, Point } from "../../../types/index";

describe("FieldSceneElements", () => {
  it("generates all scene elements with empty/default inputs", () => {
    const startPoint: Point = { x: 10, y: 10, heading: "tangential" };
    const lines: Line[] = [
      {
        id: "l1",
        name: "Line 1",
        endPoint: { x: 50, y: 50, heading: "tangential" },
        controlPoints: [],
        color: "#10b981",
        locked: false,
      },
    ];

    const ctx = {
      x: d3.scaleLinear().domain([0, 144]).range([0, 800]),
      y: d3.scaleLinear().domain([0, 144]).range([800, 0]),
      uiLength: (val: number) => val,
      settings: {
        robotWidth: 18,
        robotLength: 18,
      } as any,
      timePrediction: null,
      percentStore: 0,
      dimmedIds: [],
      multiSelectedPointIds: [],
      robotXY: null,
    };

    const elements = generateAllSceneElements({
      lines,
      sequencedLines: lines,
      startPoint,
      shapes: [],
      sequence: [{ kind: "path", lineId: "l1" }],
      markers: [],
      isDiffMode: false,
      diffData: null,
      oldData: null,
      previewOptimizedLines: null,
      effectiveTimePrediction: null,
      selectedLineId: null,
      selectedPointId: null,
      hoveredMarkerId: null,
      ppI: 2,
      ctx,
    });

    expect(elements).toBeDefined();
    expect(elements.points).toBeDefined();
    expect(elements.path).toBeDefined();
    expect(elements.shapeElements).toBeDefined();
    expect(elements.facingLineElements).toBeDefined();
    expect(elements.onionLayerElements).toBeDefined();
    expect(elements.previewPathElements).toBeDefined();
    expect(elements.eventMarkerElements).toBeDefined();
    expect(elements.collisionElements).toBeDefined();
  });
});
