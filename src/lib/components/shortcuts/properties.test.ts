// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { get } from "svelte/store";

const focus = vi.hoisted(() => ({ value: false }));
vi.mock("./utils", () => ({ isUIElementFocused: () => focus.value }));

import { linesStore, sequenceStore, startPointStore } from "../../projectStore";
import { selectedLineId, selectedPointId, notification } from "../../../stores";
import {
  modifyValue,
  toggleHeadingMode,
  toggleReverse,
  toggleLock,
  togglePathChain,
  togglePiecewise,
  toggleGlobalHeading,
} from "./properties";
import type { Line, Point, SequenceItem } from "../../../types";

const record = vi.fn();

const endPoint = (over: Record<string, unknown> = {}): Point =>
  ({ x: 10, y: 10, heading: "tangential", reverse: false, ...over }) as Point;

const makeLine = (id: string, over: Partial<Line> = {}): Line => ({
  id,
  endPoint: endPoint(),
  controlPoints: [],
  color: "red",
  ...over,
});

const marker = (position: number) => ({
  id: "e",
  name: "marker",
  position,
  parameters: [],
});

function setState(state: {
  start?: Record<string, unknown>;
  lines?: Line[];
  sequence?: SequenceItem[];
  point?: string | null;
  line?: string | null;
}) {
  startPointStore.set({
    x: 0,
    y: 0,
    heading: "tangential",
    reverse: false,
    ...state.start,
  } as Point);
  linesStore.set(state.lines ?? []);
  sequenceStore.set(state.sequence ?? []);
  selectedPointId.set(state.point ?? null);
  selectedLineId.set(state.line ?? null);
}

beforeEach(() => {
  focus.value = false;
  record.mockClear();
  notification.set(null);
  setState({});
});

describe("modifyValue", () => {
  const wait = (over = {}) =>
    ({ kind: "wait", id: "w1", name: "Wait", durationMs: 500, ...over }) as any;

  it("does nothing while a text field has focus or nothing is selected", () => {
    setState({ sequence: [wait()], point: "wait-w1" });
    focus.value = true;
    modifyValue(1, record);
    expect(record).not.toHaveBeenCalled();

    focus.value = false;
    selectedPointId.set(null);
    modifyValue(1, record);
    expect(record).not.toHaveBeenCalled();
  });

  it("changes a wait by 100 ms per step and never below zero", () => {
    setState({ sequence: [wait()], point: "wait-w1" });
    modifyValue(2, record);
    expect((get(sequenceStore)[0] as any).durationMs).toBe(700);
    modifyValue(-100, record);
    expect((get(sequenceStore)[0] as any).durationMs).toBe(0);
    expect(record).toHaveBeenCalledWith("Modify Duration");
  });

  it("leaves a locked wait or rotation alone", () => {
    setState({
      sequence: [
        wait({ locked: true }),
        { kind: "rotate", id: "r1", name: "Turn", degrees: 10, locked: true },
      ],
      point: "wait-w1",
    });
    modifyValue(1, record);
    selectedPointId.set("rotate-r1");
    modifyValue(1, record);
    expect((get(sequenceStore)[0] as any).durationMs).toBe(500);
    expect((get(sequenceStore)[1] as any).degrees).toBe(10);
    expect(record).not.toHaveBeenCalled();
  });

  it("turns a rotation by 5 degrees per step", () => {
    setState({
      sequence: [{ kind: "rotate", id: "r1", name: "Turn", degrees: 10.5 }],
      point: "rotate-r1",
    });
    modifyValue(-3, record);
    expect((get(sequenceStore)[0] as any).degrees).toBe(-4.5);
    expect(record).toHaveBeenCalledWith("Modify Rotation");
  });

  it("moves an event marker on a wait, keeping it inside 0 to 1", () => {
    setState({
      sequence: [wait({ eventMarkers: [marker(0.5)] })],
      point: "event-wait-w1-0",
    });
    modifyValue(10, record);
    expect((get(sequenceStore)[0] as any).eventMarkers[0].position).toBeCloseTo(
      0.6,
    );
    modifyValue(1000, record);
    expect((get(sequenceStore)[0] as any).eventMarkers[0].position).toBe(1);
    expect(record).toHaveBeenCalledWith("Move Event Marker");
  });

  it("doesn't move a marker that doesn't exist or belongs to a locked step", () => {
    setState({
      sequence: [wait({ eventMarkers: [marker(0.5)], locked: true })],
      point: "event-wait-w1-0",
    });
    modifyValue(10, record);
    selectedPointId.set("event-wait-w1-3");
    modifyValue(10, record);
    selectedPointId.set("event-wait-missing-0");
    modifyValue(10, record);
    expect(record).not.toHaveBeenCalled();
  });

  it("moves an event marker on a path, but not on a locked one", () => {
    const unlocked = makeLine("a", { eventMarkers: [marker(0.2)] });
    setState({ lines: [unlocked], point: "event-0-0" });
    modifyValue(-5, record);
    expect(get(linesStore)[0].eventMarkers![0].position).toBeCloseTo(0.15);

    setState({
      lines: [{ ...unlocked, locked: true }],
      point: "event-0-0",
    });
    modifyValue(-5, record);
    expect(get(linesStore)[0].eventMarkers![0].position).toBe(0.2);
  });

  it("moves the last marker of the selected path when no point is picked", () => {
    setState({
      lines: [makeLine("a", { eventMarkers: [marker(0.1), marker(0.5)] })],
      point: "unknown-thing",
      line: "a",
    });
    modifyValue(10, record);
    const markers = get(linesStore)[0].eventMarkers!;
    expect(markers[0].position).toBe(0.1);
    expect(markers[1].position).toBeCloseTo(0.6);
  });

  it("ignores a selected path with no markers", () => {
    setState({ lines: [makeLine("a")], point: "unknown-thing", line: "a" });
    modifyValue(10, record);
    expect(record).not.toHaveBeenCalled();
  });
});

describe("toggleHeadingMode", () => {
  it("cycles the start point through tangential, constant and linear", () => {
    setState({ point: "point-0-0", start: { reverse: true } });
    toggleHeadingMode(record);
    expect(get(startPointStore)).toMatchObject({
      heading: "constant",
      degrees: 0,
    });
    toggleHeadingMode(record);
    expect(get(startPointStore)).toMatchObject({
      heading: "linear",
      startDeg: 90,
      endDeg: 180,
    });
    toggleHeadingMode(record);
    expect(get(startPointStore)).toMatchObject({
      heading: "tangential",
      reverse: false,
    });
    expect(record).toHaveBeenCalledTimes(3);
    expect(record).toHaveBeenCalledWith("Toggle Heading Mode");
  });

  it("cycles a path's end point the same way", () => {
    setState({ lines: [makeLine("a")], point: "point-1-0" });
    const heading = () => (get(linesStore)[0].endPoint as any).heading;
    toggleHeadingMode(record);
    expect(heading()).toBe("constant");
    toggleHeadingMode(record);
    expect(get(linesStore)[0].endPoint).toMatchObject({
      heading: "linear",
      startDeg: 90,
      endDeg: 180,
    });
    toggleHeadingMode(record);
    expect(heading()).toBe("tangential");
  });

  it("does nothing for control points, locked items, or other selections", () => {
    setState({ lines: [makeLine("a", { locked: true })], point: "point-1-0" });
    toggleHeadingMode(record);
    selectedPointId.set("point-1-2"); // a control point
    toggleHeadingMode(record);
    selectedPointId.set("point-5-0"); // no such path
    toggleHeadingMode(record);
    selectedPointId.set("wait-x");
    toggleHeadingMode(record);
    setState({ start: { locked: true }, point: "point-0-0" });
    toggleHeadingMode(record);
    expect(get(startPointStore).heading).toBe("tangential");
    expect(record).not.toHaveBeenCalled();
  });

  it("does nothing while a text field has focus", () => {
    setState({ point: "point-0-0" });
    focus.value = true;
    toggleHeadingMode(record);
    expect(get(startPointStore).heading).toBe("tangential");
  });
});

describe("toggleReverse", () => {
  it("flips reverse on a tangential start point or path end", () => {
    setState({ lines: [makeLine("a")], point: "point-0-0" });
    toggleReverse(record);
    expect((get(startPointStore) as any).reverse).toBe(true);

    selectedPointId.set("point-1-0");
    toggleReverse(record);
    expect((get(linesStore)[0].endPoint as any).reverse).toBe(true);
    toggleReverse(record);
    expect((get(linesStore)[0].endPoint as any).reverse).toBe(false);
    expect(record).toHaveBeenCalledWith("Toggle Reverse");
  });

  it("only applies to tangential headings and unlocked items", () => {
    setState({
      start: { heading: "constant", degrees: 0 },
      lines: [
        makeLine("a", { endPoint: endPoint({ heading: "constant" }) }),
        makeLine("b", { locked: true }),
      ],
      point: "point-0-0",
    });
    toggleReverse(record);
    selectedPointId.set("point-1-0");
    toggleReverse(record);
    selectedPointId.set("point-2-0");
    toggleReverse(record);
    selectedPointId.set("point-9-0");
    toggleReverse(record);
    selectedPointId.set("wait-w");
    toggleReverse(record);
    setState({ start: { locked: true }, point: "point-0-0" });
    toggleReverse(record);
    expect(record).not.toHaveBeenCalled();
  });
});

describe("toggleLock", () => {
  it("locks and unlocks waits and rotations by id", () => {
    setState({
      sequence: [
        { kind: "wait", id: "w1", name: "W", durationMs: 1 } as any,
        { kind: "rotate", id: "r1", name: "R", degrees: 1 },
      ],
      point: "wait-w1",
    });
    toggleLock(record);
    expect(get(sequenceStore).map((s: any) => !!s.locked)).toEqual([
      true,
      false,
    ]);
    selectedPointId.set("rotate-r1");
    toggleLock(record);
    toggleLock(record);
    expect(get(sequenceStore).map((s: any) => !!s.locked)).toEqual([
      true,
      false,
    ]);
    expect(record).toHaveBeenCalledWith("Toggle Lock");
  });

  it("locks the start point or the path a point belongs to", () => {
    setState({ lines: [makeLine("a"), makeLine("b")], point: "point-0-0" });
    toggleLock(record);
    expect(get(startPointStore).locked).toBe(true);

    selectedPointId.set("point-2-1");
    toggleLock(record);
    expect(get(linesStore).map((l) => !!l.locked)).toEqual([false, true]);

    // A path number that doesn't exist changes nothing.
    selectedPointId.set("point-7-0");
    toggleLock(record);
    expect(get(linesStore).map((l) => !!l.locked)).toEqual([false, true]);
  });

  it("locks the selected path when something else is selected", () => {
    setState({
      lines: [makeLine("a"), makeLine("b")],
      point: "obstacle-0-0",
      line: "b",
    });
    toggleLock(record);
    expect(get(linesStore).map((l) => !!l.locked)).toEqual([false, true]);

    selectedLineId.set("missing");
    toggleLock(record);
    expect(get(linesStore).map((l) => !!l.locked)).toEqual([false, true]);
  });

  it("does nothing with no selection or while typing", () => {
    setState({ lines: [makeLine("a")], point: null, line: "a" });
    toggleLock(record);
    focus.value = true;
    selectedPointId.set("point-0-0");
    toggleLock(record);
    expect(record).not.toHaveBeenCalled();
  });
});

describe("togglePathChain", () => {
  const twoPaths = (): SequenceItem[] => [
    { kind: "path", lineId: "a" },
    { kind: "path", lineId: "b" },
  ];

  it("chains the selected path to the one before it, and back", () => {
    setState({
      lines: [makeLine("a"), makeLine("b")],
      sequence: twoPaths(),
      line: "b",
    });
    togglePathChain(record);
    expect((get(sequenceStore)[1] as any).isChain).toBe(true);
    expect(get(linesStore)[1].isChain).toBe(true);
    expect(get(notification)?.message).toBe("Path chain enabled");

    togglePathChain(record);
    expect((get(sequenceStore)[1] as any).isChain).toBe(false);
    expect(get(notification)?.message).toBe("Path chain disabled");
  });

  it("can't chain the first path, an unknown path, or with nothing selected", () => {
    setState({
      lines: [makeLine("a"), makeLine("b")],
      sequence: twoPaths(),
      line: "a",
    });
    togglePathChain(record);
    selectedLineId.set("nope");
    togglePathChain(record);
    selectedLineId.set(null);
    togglePathChain(record);
    focus.value = true;
    selectedLineId.set("b");
    togglePathChain(record);
    expect(record).not.toHaveBeenCalled();
    expect(get(notification)).toBeNull();
  });
});

describe("togglePiecewise", () => {
  it("switches a path to a piecewise heading that keeps its reverse setting", () => {
    setState({
      lines: [makeLine("a", { endPoint: endPoint({ reverse: true }) })],
      point: "point-1-0",
    });
    togglePiecewise(record);
    expect(get(linesStore)[0].endPoint).toMatchObject({
      heading: "piecewise",
      segments: [{ tStart: 0, tEnd: 1, heading: "tangential", reverse: true }],
    });
    expect(get(notification)?.message).toBe("Piecewise heading enabled");

    togglePiecewise(record);
    expect(get(linesStore)[0].endPoint).toMatchObject({
      heading: "tangential",
      reverse: false,
    });
    expect((get(linesStore)[0].endPoint as any).segments).toBeUndefined();
    expect(get(notification)?.message).toBe("Piecewise heading disabled");
  });

  it("ignores locked paths, control points and non-point selections", () => {
    setState({ lines: [makeLine("a", { locked: true })], point: "point-1-0" });
    togglePiecewise(record);
    selectedPointId.set("point-1-1");
    togglePiecewise(record);
    selectedPointId.set("point-4-0");
    togglePiecewise(record);
    selectedPointId.set("wait-w");
    togglePiecewise(record);
    expect(record).not.toHaveBeenCalled();
  });
});

describe("toggleGlobalHeading", () => {
  /** Paths a, b, c where b and c are chained to a. */
  const chain = (first: Partial<Line> = {}): Line[] => [
    makeLine("a", {
      ...first,
      endPoint: endPoint({ heading: "constant", degrees: 45 }),
    }),
    makeLine("b", {
      isChain: true,
      endPoint: endPoint({ heading: "linear", startDeg: 1, endDeg: 2 }),
    }),
    makeLine("c", { isChain: true }),
  ];

  it("only works on paths that are part of a chain", () => {
    setState({ lines: [makeLine("a"), makeLine("b")], line: "a" });
    toggleGlobalHeading(record);
    selectedLineId.set("missing");
    toggleGlobalHeading(record);
    selectedLineId.set(null);
    toggleGlobalHeading(record);
    expect(record).not.toHaveBeenCalled();
  });

  it("does nothing on a locked path", () => {
    setState({ lines: chain({ locked: true }), line: "a" });
    toggleGlobalHeading(record);
    expect(record).not.toHaveBeenCalled();
  });

  it("copies the selected path's heading onto the chain's first path", () => {
    setState({ lines: chain(), line: "b" });
    toggleGlobalHeading(record);
    expect(get(linesStore)[0]).toMatchObject({
      globalHeading: "linear",
      globalStartDeg: 1,
      globalEndDeg: 2,
    });
    expect(get(notification)?.message).toBe("Global chain heading enabled");

    toggleGlobalHeading(record);
    expect(get(linesStore)[0].globalHeading).toBeUndefined();
    expect(get(notification)?.message).toBe("Global chain heading disabled");
  });

  it("works from the first path of the chain, keeping tangential direction and targets", () => {
    const lines = chain();
    lines[0].endPoint = endPoint({
      heading: "facingPoint",
      targetX: 7,
      targetY: 8,
      reverse: true,
    });
    setState({ lines, line: "a" });
    toggleGlobalHeading(record);
    expect(get(linesStore)[0]).toMatchObject({
      globalHeading: "facingPoint",
      globalTargetX: 7,
      globalTargetY: 8,
      globalReverse: true,
    });
  });

  it("carries a piecewise heading over, adding a default segment if there are none", () => {
    const lines = chain();
    lines[1].endPoint = endPoint({ heading: "piecewise", reverse: true });
    setState({ lines, line: "b" });
    toggleGlobalHeading(record);
    expect(get(linesStore)[0].globalSegments).toEqual([
      { tStart: 0, tEnd: 1, heading: "tangential", reverse: true },
    ]);

    const withSegments = chain();
    const segments = [
      { tStart: 0, tEnd: 0.5, heading: "constant", degrees: 9 },
    ];
    withSegments[1].endPoint = endPoint({ heading: "piecewise", segments });
    setState({ lines: withSegments, line: "b" });
    toggleGlobalHeading(record);
    expect(get(linesStore)[0].globalSegments).toEqual(segments);
  });

  describe("when the chain starts at the first path, the start point follows", () => {
    const enableFrom = (endPointOver: Record<string, unknown>) => {
      const lines = chain();
      lines[0].endPoint = endPoint(endPointOver);
      setState({ lines, line: "a" });
      toggleGlobalHeading(record);
      return get(startPointStore) as any;
    };

    it("for a constant heading", () => {
      expect(enableFrom({ heading: "constant", degrees: 30 })).toMatchObject({
        heading: "constant",
        degrees: 30,
      });
    });

    it("for a linear heading", () => {
      expect(
        enableFrom({ heading: "linear", startDeg: 10, endDeg: 20 }),
      ).toMatchObject({ heading: "linear", startDeg: 10, endDeg: 20 });
    });

    it("for facing a point", () => {
      expect(
        enableFrom({ heading: "facingPoint", targetX: 3, targetY: 4 }),
      ).toMatchObject({ heading: "facingPoint", targetX: 3, targetY: 4 });
    });

    it("for a tangential heading", () => {
      expect(enableFrom({ heading: "tangential" })).toMatchObject({
        heading: "tangential",
      });
    });
  });
});
