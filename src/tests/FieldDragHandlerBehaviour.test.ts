// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  applyDragToElement,
  calculateSmartSnapAndBounds,
  computeMultiDragOffsets,
  executeMultiDragIteration,
} from "../lib/components/renderer/FieldDragHandler";
import { DEFAULT_SETTINGS } from "../config/defaults";
import type { Line, Point, SequenceItem, Settings, Shape } from "../types";

const start: Point = {
  x: 10,
  y: 10,
  heading: "tangential",
  reverse: false,
} as Point;

const line = (
  id: string,
  x: number,
  y: number,
  over: Partial<Line> = {},
): Line => ({
  id,
  name: id,
  endPoint: { x, y, heading: "tangential", reverse: false } as Point,
  controlPoints: [],
  color: "#fff",
  ...over,
});

type Drag = Partial<Parameters<typeof applyDragToElement>[0]> & { id: string };

const drag = (p: Drag) =>
  applyDragToElement({
    inchX: 50,
    inchY: 60,
    lines: [line("a", 30, 30)],
    shapes: [],
    startPoint: start,
    sequence: [],
    currentElem: p.id,
    ...p,
  });

describe("dragging facing-point targets", () => {
  const facing = (over: Partial<Point> = {}, lineOver: Partial<Line> = {}) =>
    line("a", 30, 30, {
      endPoint: {
        x: 30,
        y: 30,
        heading: "facingPoint",
        targetX: 1,
        targetY: 2,
        ...over,
      } as Point,
      ...lineOver,
    });

  it("moves a path's own target", () => {
    const res = drag({ id: "targetpoint-1", lines: [facing()] });
    expect(res.linesChanged).toBe(true);
    expect(res.lines[0].endPoint).toMatchObject({
      targetX: 50,
      targetY: 60,
      x: 30,
      y: 30,
    });
  });

  it("moves the chain's shared target, stored on the first path, when a global heading applies", () => {
    const lines = [
      facing(
        {},
        { globalHeading: "facingPoint", globalTargetX: 5, globalTargetY: 6 },
      ),
      line("b", 40, 40, { isChain: true }),
    ];
    const res = drag({ id: "targetpoint-2", lines });
    expect(res.lines[0]).toMatchObject({
      globalTargetX: 50,
      globalTargetY: 60,
    });
    // Nothing is written to the path that was dragged.
    expect(res.lines[1]).toBe(lines[1]);
    // The first path's own target is left as it was.
    expect((res.lines[0].endPoint as any).targetX).toBe(1);
  });

  it("ignores a global heading of 'none'", () => {
    const lines = [facing({}, { globalHeading: "none" })];
    const res = drag({ id: "targetpoint-1", lines });
    expect((res.lines[0].endPoint as any).targetX).toBe(50);
  });

  it("moves the target of a piecewise segment, leaving other segments alone", () => {
    const segments = [
      { tStart: 0, tEnd: 0.5, heading: "constant", degrees: 0 },
      { tStart: 0.5, tEnd: 1, heading: "facingPoint", targetX: 1, targetY: 2 },
    ];
    const res = drag({
      id: "targetpoint-1-piecewise-1",
      lines: [
        line("a", 30, 30, {
          endPoint: { x: 30, y: 30, heading: "piecewise", segments } as any,
        }),
      ],
    });
    const moved = (res.lines[0].endPoint as any).segments;
    expect(moved[0]).toBe(segments[0]);
    expect(moved[1]).toMatchObject({ targetX: 50, targetY: 60 });
  });

  it("moves a segment's target when the chain's heading is global", () => {
    const segments = [
      { tStart: 0, tEnd: 1, heading: "facingPoint", targetX: 1, targetY: 2 },
    ];
    const lines = [
      line("a", 30, 30, {
        globalHeading: "piecewise",
        globalSegments: segments as any,
      }),
      line("b", 40, 40, { isChain: true }),
    ];
    const res = drag({ id: "targetpoint-2-piecewise-0", lines });
    expect(res.lines[0].globalSegments![0]).toMatchObject({
      targetX: 50,
      targetY: 60,
    });
  });

  it("does nothing for a segment that isn't facing a point, or doesn't exist", () => {
    const segments = [{ tStart: 0, tEnd: 1, heading: "constant", degrees: 0 }];
    const lines = [
      line("a", 30, 30, {
        endPoint: { x: 30, y: 30, heading: "piecewise", segments } as any,
      }),
    ];
    expect(drag({ id: "targetpoint-1-piecewise-0", lines }).linesChanged).toBe(
      false,
    );
    expect(drag({ id: "targetpoint-1-piecewise-5", lines }).linesChanged).toBe(
      false,
    );
    expect(drag({ id: "targetpoint-9", lines }).linesChanged).toBe(false);
  });
});

describe("dragging points", () => {
  it("won't move a locked start point", () => {
    const res = drag({
      id: "point-0-0",
      startPoint: { ...start, locked: true },
    });
    expect(res.startPointChanged).toBe(false);
    expect(res.startPoint.x).toBe(10);
  });

  it("moves a control point, but not one on a locked path", () => {
    const lines = [
      line("a", 30, 30, { controlPoints: [{ x: 15, y: 15 } as Point] }),
    ];
    const moved = drag({ id: "point-1-1", lines });
    expect(moved.lines[0].controlPoints[0]).toMatchObject({ x: 50, y: 60 });

    const locked = drag({
      id: "point-1-1",
      lines: [{ ...lines[0], locked: true }],
    });
    expect(locked.linesChanged).toBe(true); // the update is computed...
    expect(locked.lines[0].controlPoints[0]).toMatchObject({ x: 15, y: 15 }); // ...but nothing moves
  });

  it("moves paths that share a name together", () => {
    const lines = [
      line("a", 30, 30, { name: "Shoot" }),
      line("b", 80, 80, { name: "Shoot" }),
    ];
    const res = drag({ id: "point-1-0", lines });
    expect(res.lines[0].endPoint).toMatchObject({ x: 50, y: 60 });
    expect(res.lines[1].endPoint).toMatchObject({ x: 50, y: 60 });
  });

  it("ignores a point on a path that doesn't exist", () => {
    expect(drag({ id: "point-7-0" }).linesChanged).toBe(false);
  });

  it("won't move an obstacle that is locked", () => {
    const shape: Shape = {
      id: "s",
      name: "s",
      color: "#f00",
      fillColor: "#f00",
      vertices: [{ x: 1, y: 1 }],
      locked: true,
    } as Shape;
    expect(drag({ id: "obstacle-0-0", shapes: [shape] }).shapesChanged).toBe(
      false,
    );
    const free = drag({
      id: "obstacle-0-0",
      shapes: [{ ...shape, locked: false }],
    });
    expect(free.shapes[0].vertices[0]).toMatchObject({ x: 50, y: 60 });
  });
});

describe("dragging event markers", () => {
  const marker = (over: Record<string, unknown> = {}) => ({
    id: "m1",
    name: "m",
    position: 0.1,
    parameters: [],
    ...over,
  });
  // Two straight paths: (10,10)-(110,10) and (110,10)-(110,110).
  const pathWith = (m: any[], over: Partial<Line> = {}) => [
    line("a", 110, 10, { eventMarkers: m, ...over }),
    line("b", 110, 110),
  ];

  it("slides a marker along its own path to the closest point", () => {
    const res = drag({
      id: "event-0-0",
      lines: pathWith([marker()]),
      inchX: 60,
      inchY: 12,
    });
    expect(res.lines[0].eventMarkers![0].position).toBeCloseTo(0.5, 1);
    expect(res.idReplacement).toBeUndefined();
  });

  it("moves to another path when that is closer, and reports the new id", () => {
    const res = drag({
      id: "event-0-0",
      lines: pathWith([marker()]),
      inchX: 111,
      inchY: 60,
    });
    expect(res.lines[0].eventMarkers).toEqual([]);
    expect(res.lines[1].eventMarkers![0]).toMatchObject({ id: "m1" });
    expect(res.lines[1].eventMarkers![0].position).toBeCloseTo(0.5, 1);
    expect(res.idReplacement).toEqual({
      oldId: "event-0-0",
      newId: "event-1-0",
    });
    expect(res.currentElem).toBe("event-1-0");
  });

  it("leaves the current selection alone if it isn't the marker that moved", () => {
    const res = drag({
      id: "event-0-0",
      lines: pathWith([marker()]),
      inchX: 111,
      inchY: 60,
      currentElem: "point-1-0",
    });
    expect(res.currentElem).toBe("point-1-0");
  });

  it("puts a pose marker exactly where it is dropped, rounded", () => {
    const res = drag({
      id: "event-0-0",
      lines: pathWith([marker({ type: "pose", poseX: 0, poseY: 0 })]),
      inchX: 33.3333,
      inchY: 44.4449,
    });
    expect(res.lines[0].eventMarkers![0]).toMatchObject({
      poseX: 33.33,
      poseY: 44.44,
    });
  });

  it("sets a temporal marker to the time the robot is at that point", () => {
    const timePrediction: any = {
      totalTime: 10,
      timeline: [
        {
          type: "travel",
          startTime: 2,
          duration: 4,
          endTime: 6,
          line: { id: "a" },
        },
      ],
    };
    const res = drag({
      id: "event-0-0",
      lines: pathWith([marker({ type: "temporal", time: 0, endTime: 0 })]),
      inchX: 60,
      inchY: 10,
      timePrediction,
    });
    const moved = res.lines[0].eventMarkers![0];
    // Half way along a path that takes 4 s starting at 2 s: 4 s.
    expect(moved.time).toBeCloseTo(4000, -2);
    expect(moved.endTime).toBe(moved.time);
  });

  it("leaves a temporal marker's time alone without timing for the path", () => {
    const res = drag({
      id: "event-0-0",
      lines: pathWith([marker({ type: "temporal", time: 123, endTime: 123 })]),
      timePrediction: { totalTime: 0, timeline: [] } as any,
    });
    expect(res.lines[0].eventMarkers![0]).toMatchObject({
      time: 123,
      endTime: 123,
    });
  });

  it("ignores a marker that doesn't exist", () => {
    expect(
      drag({ id: "event-0-5", lines: pathWith([marker()]) }).linesChanged,
    ).toBe(false);
  });

  it("moves pose markers on waits and turns, and ignores the other kinds", () => {
    const sequence: SequenceItem[] = [
      {
        kind: "wait",
        id: "w1",
        name: "",
        durationMs: 1,
        eventMarkers: [
          marker({ id: "p", type: "pose", poseX: 0, poseY: 0 }),
          marker({ id: "q" }),
        ],
      } as any,
    ];
    const moved = drag({
      id: "wait-event-w1-0",
      sequence,
      inchX: 12.345,
      inchY: 6.789,
    });
    expect(moved.sequenceChanged).toBe(true);
    expect((sequence[0] as any).eventMarkers[0]).toMatchObject({
      poseX: 12.35,
      poseY: 6.79,
    });

    expect(drag({ id: "wait-event-w1-1", sequence }).sequenceChanged).toBe(
      false,
    );
    expect(drag({ id: "wait-event-gone-0", sequence }).sequenceChanged).toBe(
      false,
    );
  });
});

describe("calculateSmartSnapAndBounds", () => {
  const settings = (over: Partial<Settings> = {}): Settings =>
    ({
      ...DEFAULT_SETTINGS,
      restrictDraggingToField: true,
      rLength: 16,
      rWidth: 12,
      safetyMargin: 2,
      ...over,
    }) as Settings;

  const snap = (over: Record<string, unknown> = {}) =>
    calculateSmartSnapAndBounds({
      id: "point-1-0",
      rawInchX: 70,
      rawInchY: 70,
      snapToGrid: false,
      showGrid: false,
      gridSize: 5,
      smartSnappingEnabled: true,
      isAltKey: false,
      startPoint: start,
      lines: [line("a", 50, 50), line("b", 100, 100)],
      shapes: [],
      fieldW: 144,
      fieldH: 144,
      settings: settings(),
      ...over,
    } as any);

  it("snaps to another point's x or y when within an inch, and shows guides", () => {
    const res = snap({ id: "point-2-0", rawInchX: 50.6, rawInchY: 90 });
    expect(res.inchX).toBe(50);
    expect(res.inchY).toBe(90);
    expect(res.guides).toEqual([{ type: "vertical", coord: 50 }]);
  });

  it("snaps on both axes at once", () => {
    const res = snap({ rawInchX: 99.5, rawInchY: 100.4 });
    expect(res).toMatchObject({ inchX: 100, inchY: 100 });
    expect(res.guides).toHaveLength(2);
  });

  it("snaps to field corners and to the vertices of visible obstacles only", () => {
    const shapes = [
      { id: "s1", name: "s", vertices: [{ x: 30, y: 30 }], visible: true },
      { id: "s2", name: "t", vertices: [{ x: 20, y: 120 }], visible: false },
    ] as any[];
    expect(snap({ rawInchX: 30.5, rawInchY: 30.5, shapes })).toMatchObject({
      inchX: 30,
      inchY: 30,
    });
    expect(snap({ rawInchX: 20.5, rawInchY: 120.5, shapes }).inchX).toBeCloseTo(
      20.5,
    );
    expect(
      snap({
        rawInchX: 143.8,
        rawInchY: 0.4,
        settings: settings({ restrictDraggingToField: false }),
      }),
    ).toMatchObject({
      inchX: 144,
      inchY: 0,
    });
  });

  it("doesn't snap a point to itself", () => {
    // Path a's end (50,50) is the point being dragged.
    const res = snap({ id: "point-1-0", rawInchX: 50.2, rawInchY: 50.2 });
    expect(res.guides).toEqual([]);
    expect(res.inchX).toBeCloseTo(50.2);
  });

  it("doesn't snap a control point to its own path's end point either way, but snaps to the start point", () => {
    const res = snap({ id: "point-2-0", rawInchX: 10.4, rawInchY: 70 });
    expect(res.inchX).toBe(10);
  });

  it("turns snapping off, or on, while Alt is held", () => {
    // Dragging path b's end point, so path a's end (50, 50) is something to snap to.
    const b = { id: "point-2-0", rawInchX: 50.4, rawInchY: 90 };
    expect(snap({ ...b, isAltKey: true }).inchX).toBeCloseTo(50.4);
    expect(
      snap({ ...b, smartSnappingEnabled: false, isAltKey: true }).inchX,
    ).toBe(50);
    expect(snap({ ...b, smartSnappingEnabled: false }).inchX).toBeCloseTo(50.4);
  });

  it("only snaps points, not event markers or obstacle vertices", () => {
    expect(
      snap({ id: "event-0-0", rawInchX: 50.4, rawInchY: 90 }).inchX,
    ).toBeCloseTo(50.4);
  });

  it("snaps to the grid first when that is on", () => {
    const res = snap({
      rawInchX: 73,
      rawInchY: 68,
      snapToGrid: true,
      showGrid: true,
      gridSize: 10,
      smartSnappingEnabled: false,
    });
    expect(res).toMatchObject({ inchX: 70, inchY: 70 });
    // Not without a visible grid, or with a grid of no size.
    expect(
      snap({
        rawInchX: 73,
        snapToGrid: true,
        showGrid: false,
        smartSnappingEnabled: false,
      }).inchX,
    ).toBe(73);
    expect(
      snap({
        rawInchX: 73,
        snapToGrid: true,
        showGrid: true,
        gridSize: 0,
        smartSnappingEnabled: false,
      }).inchX,
    ).toBe(73);
  });

  describe("keeping things on the field", () => {
    const at = (id: string, over: Record<string, unknown> = {}) =>
      snap({
        id,
        rawInchX: -20,
        rawInchY: 500,
        smartSnappingEnabled: false,
        ...over,
      });

    it("keeps the start point a robot-radius in from the edge", () => {
      // Half of the smaller robot dimension: 12 / 2 = 6.
      expect(at("point-0-0")).toMatchObject({ inchX: 6, inchY: 138 });
    });

    it("keeps an end point further in by the safety margin", () => {
      expect(at("point-1-0")).toMatchObject({ inchX: 8, inchY: 136 });
    });

    it("lets control points go anywhere on the field", () => {
      expect(at("point-1-1")).toMatchObject({ inchX: 0, inchY: 144 });
    });

    it("keeps markers and obstacle vertices on the field", () => {
      expect(at("event-0-0")).toMatchObject({ inchX: 0, inchY: 144 });
    });

    it("lets anything go anywhere when dragging isn't restricted", () => {
      expect(
        at("point-1-0", {
          settings: settings({ restrictDraggingToField: false }),
        }),
      ).toMatchObject({
        inchX: -20,
        inchY: 500,
      });
    });

    it("uses 18 inches for a robot with no size set", () => {
      const res = at("point-0-0", {
        settings: settings({ rLength: 0, rWidth: 0 }),
      });
      expect(res.inchX).toBe(9);
    });
  });
});

describe("computeMultiDragOffsets", () => {
  const ctx = (over: Record<string, unknown> = {}) => ({
    lines: [
      line("a", 30, 30, {
        controlPoints: [{ x: 20, y: 25 } as Point],
        eventMarkers: [
          {
            id: "m",
            name: "m",
            position: 0.5,
            type: "pose",
            poseX: 40,
            poseY: 41,
          } as any,
          { id: "n", name: "n", position: 0.5 } as any,
        ],
      }),
    ],
    shapes: [{ id: "s", name: "s", vertices: [{ x: 70, y: 80 }] }] as any[],
    startPoint: start,
    sequence: [] as SequenceItem[],
    ...over,
  });
  const offsets = (ids: string[], c = ctx()) =>
    computeMultiDragOffsets(ids, 100, 100, c);

  it("measures from the mouse to the start point, end points and control points", () => {
    const res = offsets(["point-0-0", "point-1-0", "point-1-1"]);
    expect(res.get("point-0-0")).toEqual({ x: -90, y: -90 });
    expect(res.get("point-1-0")).toEqual({ x: -70, y: -70 });
    expect(res.get("point-1-1")).toEqual({ x: -80, y: -75 });
  });

  it("measures to obstacle vertices and pose markers", () => {
    const res = offsets(["obstacle-0-0", "event-0-0"]);
    expect(res.get("obstacle-0-0")).toEqual({ x: -30, y: -20 });
    expect(res.get("event-0-0")).toEqual({ x: -60, y: -59 });
  });

  it("measures from a pose marker on a wait", () => {
    const sequence = [
      {
        kind: "wait",
        id: "w",
        name: "",
        durationMs: 1,
        eventMarkers: [
          { id: "p", name: "p", position: 0, type: "pose", poseX: 5, poseY: 6 },
        ],
      },
    ] as any;
    expect(
      offsets(["wait-event-w-0"], ctx({ sequence })).get("wait-event-w-0"),
    ).toEqual({ x: -95, y: -94 });
  });

  it("treats things without a position of their own as sitting under the mouse", () => {
    const res = offsets([
      "event-0-1",
      "point-9-0",
      "point-1-9",
      "nonsense",
      "event-0-7",
      "obstacle-5-0",
    ]);
    for (const id of res.keys()) expect(res.get(id)).toEqual({ x: 0, y: 0 });
    expect(res.size).toBe(6);
  });

  it("measures to a facing target, the chain's if it has a global heading", () => {
    const facing = line("a", 30, 30, {
      endPoint: {
        x: 30,
        y: 30,
        heading: "facingPoint",
        targetX: 3,
        targetY: 4,
      } as any,
    });
    expect(
      offsets(["targetpoint-1"], ctx({ lines: [facing] })).get("targetpoint-1"),
    ).toEqual({ x: -97, y: -96 });
    const global = line("a", 30, 30, {
      globalHeading: "facingPoint",
      globalTargetX: 7,
      globalTargetY: 8,
    });
    expect(
      offsets(["targetpoint-1"], ctx({ lines: [global] })).get("targetpoint-1"),
    ).toEqual({ x: -93, y: -92 });
  });
});

describe("executeMultiDragIteration", () => {
  const run = (ids: string[], over: Record<string, unknown> = {}) =>
    executeMultiDragIteration({
      multiSelectedPointIds: ids,
      multiDragOffsets: new Map(ids.map((id) => [id, { x: 0, y: 0 }])),
      xPos: 60,
      yPos: 70,
      xInvert: (v: number) => v,
      yInvert: (v: number) => v,
      snapToGrid: false,
      showGrid: false,
      gridSize: 1,
      smartSnappingEnabled: false,
      isAltKey: false,
      lines: [line("a", 30, 30), line("b", 40, 40)],
      shapes: [],
      startPoint: start,
      sequence: [],
      timePrediction: undefined,
      currentElem: null,
      fieldW: 144,
      fieldH: 144,
      settings: { ...DEFAULT_SETTINGS, restrictDraggingToField: false },
      ...over,
    } as any);

  it("moves every selected element by the mouse position plus its offset", () => {
    const res = run(["point-0-0", "point-1-0"], {
      multiDragOffsets: new Map([
        ["point-0-0", { x: -5, y: 0 }],
        ["point-1-0", { x: 10, y: 10 }],
      ]),
    });
    expect(res.startPoint).toMatchObject({ x: 55, y: 70 });
    expect(res.lines[0].endPoint).toMatchObject({ x: 70, y: 80 });
    expect(res.startPointChanged && res.linesChanged).toBe(true);
    expect(res.shapesChanged).toBe(false);
  });

  it("leaves elements of a locked path where they are", () => {
    const res = run(["point-1-0", "point-2-0"], {
      lines: [line("a", 30, 30, { locked: true }), line("b", 40, 40)],
    });
    expect(res.lines[0].endPoint).toMatchObject({ x: 30, y: 30 });
    expect(res.lines[1].endPoint).toMatchObject({ x: 60, y: 70 });
  });

  it("collects snap guides and marker id changes from all of the elements", () => {
    const lines = [
      line("a", 110, 10, {
        eventMarkers: [{ id: "m", name: "m", position: 0.1 } as any],
      }),
      line("b", 110, 110),
    ];
    const res = run(["event-0-0"], {
      lines,
      xPos: 111,
      yPos: 60,
      currentElem: "event-0-0",
    });
    expect(res.idReplacements).toEqual([
      { oldId: "event-0-0", newId: "event-1-0" },
    ]);
    expect(res.currentElem).toBe("event-1-0");

    const snapped = run(["point-2-0"], {
      xPos: 30.4,
      yPos: 90,
      smartSnappingEnabled: true,
    });
    expect(snapped.guides).toEqual([{ type: "vertical", coord: 30 }]);
  });

  it("reports changes to obstacles and waits", () => {
    const shape = {
      id: "s",
      name: "s",
      vertices: [{ x: 1, y: 1 }],
      locked: false,
    } as any;
    const sequence = [
      {
        kind: "wait",
        id: "w",
        name: "",
        durationMs: 1,
        eventMarkers: [
          { id: "p", name: "p", position: 0, type: "pose", poseX: 0, poseY: 0 },
        ],
      },
    ] as any;
    const res = run(["obstacle-0-0", "wait-event-w-0"], {
      shapes: [shape],
      sequence,
    });
    expect(res.shapesChanged).toBe(true);
    expect(res.sequenceChanged).toBe(true);
    expect(res.shapes[0].vertices[0]).toMatchObject({ x: 60, y: 70 });
  });
});
