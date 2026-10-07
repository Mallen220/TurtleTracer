// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Regression tests for dragging facing targets and step event markers.
import { describe, it, expect } from "vitest";
import type { Line, Point, SequenceItem } from "../../../types";
import {
  applyDragToElement,
  computeMultiDragOffsets,
} from "./FieldDragHandler";
import {
  parseStepEventId,
  normalizeEventElementId,
  resolveHoveredMarkerId,
} from "./ElementIdParser";
import { resolveSelectionOnDown } from "./FieldSelection";

const startPoint: Point = { x: 0, y: 0, heading: "tangential" };
const facing = (targetX: number, targetY: number) =>
  ({ x: 10, y: 10, heading: "facingPoint", targetX, targetY }) as Point;

// Ids made by makeId() contain a hyphen.
const waitId = "m1x2y3-4k9d2f";
const sequence: SequenceItem[] = [
  {
    kind: "wait",
    id: waitId,
    name: "",
    durationMs: 100,
    eventMarkers: [
      {
        id: "marker",
        name: "Grab",
        position: 0,
        type: "pose",
        poseX: 5,
        poseY: 5,
      },
    ],
  } as SequenceItem,
];

describe("step event marker ids", () => {
  it("keeps hyphens that are part of the step id", () => {
    expect(parseStepEventId(`wait-event-circle-${waitId}-0`)).toEqual({
      kind: "wait",
      itemId: waitId,
      eventIndex: 0,
    });
    expect(normalizeEventElementId(`rotate-event-arrow-${waitId}-2`)).toBe(
      `rotate-event-${waitId}-2`,
    );
  });

  it("finds the marker for hover highlighting", () => {
    expect(
      resolveHoveredMarkerId(`wait-event-${waitId}-0`, [], sequence as any),
    ).toBe("marker");
  });

  it("selects the wait when its marker is clicked", () => {
    const selection = resolveSelectionOnDown({
      clickedElem: `wait-event-${waitId}-0`,
      lines: [],
      currentPointIds: [],
      currentLineIds: [],
      currentSelectedPointId: null,
      currentSelectedLineId: null,
      isModifierKey: false,
    });
    expect(selection.selectedPointId).toBe(`wait-${waitId}`);
  });

  it("can be dragged", () => {
    const seq = structuredClone(sequence);
    const res = applyDragToElement({
      id: `wait-event-${waitId}-0`,
      inchX: 20,
      inchY: 30,
      lines: [],
      shapes: [],
      startPoint,
      sequence: seq,
      currentElem: null,
    });
    expect(res.sequenceChanged).toBe(true);
    expect((seq[0] as any).eventMarkers[0]).toMatchObject({
      poseX: 20,
      poseY: 30,
    });
  });
});

describe("facing target dragging", () => {
  it("starts from the chain's shared target for a chained line", () => {
    const lines: Line[] = [
      {
        id: "a",
        endPoint: facing(0, 0),
        controlPoints: [],
        color: "r",
        globalHeading: "facingPoint",
        globalTargetX: 50,
        globalTargetY: 60,
      },
      {
        id: "b",
        endPoint: facing(0, 0),
        controlPoints: [],
        color: "r",
        isChain: true,
      },
    ];
    const offsets = computeMultiDragOffsets(["targetpoint-2"], 40, 40, {
      lines,
      shapes: [],
      startPoint,
      sequence: [],
    });
    expect(offsets.get("targetpoint-2")).toEqual({ x: 10, y: 20 });
  });

  it("moves the line's own target when its global heading is 'none'", () => {
    const lines: Line[] = [
      {
        id: "a",
        endPoint: facing(1, 2),
        controlPoints: [],
        color: "r",
        globalHeading: "none",
      },
    ];
    const res = applyDragToElement({
      id: "targetpoint-1",
      inchX: 30,
      inchY: 40,
      lines,
      shapes: [],
      startPoint,
      sequence: [],
      currentElem: null,
    });
    expect(res.lines[0].endPoint).toMatchObject({ targetX: 30, targetY: 40 });
    expect(res.lines[0].globalTargetX).toBeUndefined();
  });
});
