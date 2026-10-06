// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import type { CollisionMarker, TimePrediction } from "../../../types";
import Two from "two.js";
import { generatePointElements } from "../../../lib/components/renderer/PointGenerator";
import { generateCollisionElements } from "../../../lib/components/renderer/CollisionMarkerGenerator";
import { generateEventMarkerElements } from "../../../lib/components/renderer/EventMarkerGenerator";
import { ElementCache } from "../../../lib/components/renderer/ElementCache";
import {
  actionRegistry,
  type ActionDefinition,
} from "../../../lib/actionRegistry";

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
    ] as CollisionMarker[];
    const prediction = { timeline: [] } as unknown as TimePrediction;

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
    const markers = [
      { type: "obstacle", x: 5, y: 5, time: 1, endTime: 2 },
    ] as CollisionMarker[];
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
    } as unknown as TimePrediction;

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

    actionRegistry.register({
      kind: "wait",
      label: "Wait",
      renderField: () => [new Two.Circle(0, 0, 5)],
    } as unknown as ActionDefinition);
    try {
      const elems = generateEventMarkerElements(
        lines,
        startPoint,
        sequence,
        ctxWithPrediction as any,
      );
      expect(elems.length).toBe(2);
    } finally {
      actionRegistry.unregister("wait");
    }
  });

  describe("generatePointElements with a cache", () => {
    const startPoint = { x: 0, y: 0, heading: "tangential" } as any;
    const lineTo = (id: string, x: number, extra = {}) =>
      ({
        id,
        color: "#ff0000",
        controlPoints: [{ x: x - 5, y: 5 }],
        endPoint: { x, y: 0, heading: "tangential" },
        ...extra,
      }) as any;
    const sequenceOf = (lines: any[]) =>
      lines.map((l) => ({ kind: "path", lineId: l.id, isChain: l.isChain }));
    const draw = (lines: any[], cache: ElementCache<any>, over = {}) =>
      generatePointElements(
        startPoint,
        lines,
        [],
        sequenceOf(lines) as any,
        { ...ctx, multiSelectedPointIds: [], ...over } as any,
        cache,
      );
    const byId = (points: any[]) =>
      new Map(points.map((p) => [p.id as string, p]));

    it("rebuilds only the points of the line that moved", () => {
      const cache = new ElementCache<any>();
      const lines = [lineTo("a", 10), lineTo("b", 20)];
      const before = byId(draw(lines, cache));

      const moved = [lines[0], { ...lines[1], endPoint: { x: 30, y: 0 } }];
      const after = byId(draw(moved, cache));

      expect(after.get("point-0-0")).toBe(before.get("point-0-0"));
      expect(after.get("point-1-0")).toBe(before.get("point-1-0"));
      expect(after.get("point-1-1")).toBe(before.get("point-1-1"));
      expect(after.get("point-2-0")).not.toBe(before.get("point-2-0"));
      expect([...after.keys()]).toEqual([...before.keys()]);
    });

    it("redraws points when several are selected", () => {
      const cache = new ElementCache<any>();
      const lines = [lineTo("a", 10), lineTo("b", 20)];
      const before = byId(draw(lines, cache));
      const after = byId(
        draw(lines, cache, {
          multiSelectedPointIds: ["point-2-0", "point-2-1-background"],
        }),
      );
      expect(after.get("point-1-0")).toBe(before.get("point-1-0"));
      expect(after.get("point-2-0").fill).toBe("#4ade80");
      expect(after.get("point-2-1").children[0].fill).toBe("#4ade80");
    });

    it("redraws a chained line's target when the chain's heading changes", () => {
      const cache = new ElementCache<any>();
      const root = lineTo("a", 10, { globalHeading: "none" });
      const child = lineTo("b", 20, { isChain: true });
      expect(byId(draw([root, child], cache)).has("targetpoint-2")).toBe(false);

      const facing = {
        ...root,
        globalHeading: "facingPoint",
        globalTargetX: 40,
        globalTargetY: 40,
      };
      const after = byId(draw([facing, child], cache));
      expect(after.has("targetpoint-1")).toBe(true);
      expect(after.has("targetpoint-2")).toBe(true);
    });
  });
});
