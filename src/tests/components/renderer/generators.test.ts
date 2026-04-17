// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import Two from "two.js";
import { generatePointElements } from "../../../lib/components/renderer/PointGenerator";
import { generateCollisionElements } from "../../../lib/components/renderer/CollisionMarkerGenerator";
import { generateEventMarkerElements } from "../../../lib/components/renderer/EventMarkerGenerator";

describe("Renderer Generators", () => {
  const x = (val: number) => val * 10;
  const y = (val: number) => val * 10;
  const uiLength = (inches: number) => inches * 5;
  const fakeScaleX = ((val: number) => x(val)) as unknown as d3.ScaleLinear<
    number,
    number
  >;
  const fakeScaleY = ((val: number) => y(val)) as unknown as d3.ScaleLinear<
    number,
    number
  >;

  const ctx = {
    x: fakeScaleX,
    y: fakeScaleY,
    uiLength,
    multiSelectedPointIds: ["point-0-0"],
    uiZoomScale: 1,
    timePrediction: { timeline: [] },
    actionRegistry: {
      get: (kind: string) => {
        if (kind === "wait") {
          return {
            isWait: true,
            renderField: () => {
              return [new Two.Circle(0, 0, 5)];
            },
          };
        }
        return null;
      },
    },
  };

  it("generatePointElements should generate elements correctly", () => {
    const startPoint = { x: 0, y: 0, heading: "tangential" } as any;
    const lines = [
      {
        id: "line-1",
        color: "#ff0000",
        controlPoints: [{ x: 10, y: 10, heading: "tangential" }],
        endPoint: {
          x: 20,
          y: 20,
          heading: "facingPoint",
          targetX: 30,
          targetY: 30,
        },
        hidden: false,
      } as any,
    ];
    const shapes = [
      {
        color: "#00ff00",
        vertices: [{ x: 50, y: 50 }],
      } as any,
    ];

    const points = generatePointElements(
      startPoint,
      lines,
      shapes,
      [] as any,
      ctx as any,
    );
    expect(points.length).toBe(5);
    const sp = points[0] as InstanceType<typeof Two.Circle>;
    expect(sp.id).toBe("point-0-0");
  });

  it("generateCollisionElements should handle different marker types", () => {
    const startPoint = { x: 0, y: 0 } as any;
    const lines = [] as any[];
    const markers = [
      { type: "obstacle", x: 10, y: 10 },
      { type: "boundary", x: 20, y: 20 },
      { type: "zero-length", x: 30, y: 30 },
      { type: "keep-in", x: 40, y: 40 },
    ];
    const prediction = { timeline: [] };

    const elems = generateCollisionElements(
      markers,
      lines,
      startPoint,
      prediction,
      ctx as any,
    );

    expect(elems.length).toBe(4);
    const boundaryMarker = elems[1];
    expect(boundaryMarker.children.length).toBeGreaterThan(0);
  });

  it("generateCollisionElements should handle time ranges", () => {
    const startPoint = { x: 0, y: 0 } as any;
    const lines = [
      {
        id: "line-1",
        endPoint: { x: 10, y: 10 },
        controlPoints: [],
      } as any,
    ];
    const markers = [{ type: "obstacle", x: 5, y: 5, time: 1, endTime: 2 }];
    const prediction = {
      timeline: [
        { type: "wait", startTime: 1, endTime: 1.5, atPoint: { x: 0, y: 0 } },
        {
          type: "travel",
          startTime: 1.5,
          endTime: 2.5,
          lineIndex: 0,
          duration: 1,
          prevPoint: { x: 0, y: 0 },
        },
      ],
    };

    const elems = generateCollisionElements(
      markers,
      lines,
      startPoint,
      prediction,
      ctx as any,
    );

    expect(elems.length).toBe(1);
    expect(elems[0].children.length).toBeGreaterThan(0);
  });

  it("generateEventMarkerElements should generate elements correctly", () => {
    const startPoint = { x: 0, y: 0 } as any;
    const lines = [
      {
        id: "line-1",
        endPoint: { x: 10, y: 10 },
        controlPoints: [],
        eventMarkers: [{ position: 0.5, name: "test-event" }],
      } as any,
    ];

    const sequence = [
      {
        kind: "wait",
        id: "wait-1",
        eventMarkers: [{ position: 0.5, name: "wait-event" }],
      },
    ] as any[];

    const ctxWithPrediction = {
      ...ctx,
      timePrediction: {
        timeline: [
          {
            type: "travel",
            lineIndex: 0,
            prevPoint: startPoint,
            duration: 1,
            points: [startPoint, lines[0].endPoint],
          },
          { type: "wait", sequenceId: "wait-1", atPoint: lines[0].endPoint },
        ],
      },
    };

    const elems = generateEventMarkerElements(
      lines,
      startPoint,
      sequence,
      ctxWithPrediction as any,
    );

    expect(elems.length).toBe(2);
  });
});
