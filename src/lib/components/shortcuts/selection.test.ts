// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { get } from "svelte/store";

const focus = vi.hoisted(() => ({
  value: false,
  sequenceIndex: null as number | null,
}));
vi.mock("./utils", () => ({
  isUIElementFocused: () => focus.value,
  getSelectedSequenceIndex: () => focus.sequenceIndex,
}));

import {
  linesStore,
  sequenceStore,
  shapesStore,
  startPointStore,
} from "../../projectStore";
import {
  gridSize,
  multiSelectedLineIds,
  multiSelectedPointIds,
  selectedLineId,
  selectedPointId,
  showGrid,
  snapToGrid,
} from "../../../stores";
import {
  cycleSequenceSelection,
  getSelectableItems,
  movePoint,
  removeSelected,
  selectAll,
} from "./selection";
import type { Line, SequenceItem, Shape } from "../../../types";

const record = vi.fn();

const marker = (id: string, position: number) => ({
  id,
  name: id,
  position,
  parameters: [],
});

const line = (id: string, over: Partial<Line> = {}): Line =>
  ({
    id,
    name: id,
    endPoint: { x: 50, y: 60, heading: "tangential", reverse: false },
    controlPoints: [
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ],
    color: "red",
    ...over,
  }) as Line;

const wait = (id: string, over: Record<string, unknown> = {}) =>
  ({ kind: "wait", id, name: "", durationMs: 100, ...over }) as SequenceItem;
const turn = (id: string, over: Record<string, unknown> = {}) =>
  ({ kind: "rotate", id, name: "", degrees: 90, ...over }) as SequenceItem;
const path = (lineId: string) => ({ kind: "path", lineId }) as SequenceItem;

function setState(
  state: {
    start?: Record<string, unknown>;
    lines?: Line[];
    sequence?: SequenceItem[];
    shapes?: Shape[];
    selected?: string | null;
    multi?: string[];
    line?: string | null;
  } = {},
) {
  startPointStore.set({
    x: 20,
    y: 30,
    heading: "tangential",
    reverse: false,
    ...state.start,
  } as never);
  linesStore.set(state.lines ?? []);
  sequenceStore.set(state.sequence ?? []);
  shapesStore.set(state.shapes ?? []);
  selectedPointId.set(state.selected ?? null);
  multiSelectedPointIds.set(state.multi ?? []);
  selectedLineId.set(state.line ?? null);
  multiSelectedLineIds.set([]);
}

beforeEach(() => {
  focus.value = false;
  focus.sequenceIndex = null;
  record.mockReset();
  snapToGrid.set(false);
  showGrid.set(false);
  gridSize.set(6);
  setState();
});

describe("removeSelected", () => {
  it("does nothing while typing or with nothing selected", () => {
    setState({ lines: [line("a")], selected: "point-1-1" });
    focus.value = true;
    removeSelected(record);
    expect(get(linesStore)[0].controlPoints).toHaveLength(2);

    focus.value = false;
    setState({ lines: [line("a")] });
    removeSelected(record);
    expect(record).not.toHaveBeenCalled();
  });

  it("removes the selected control point and clears the selection", () => {
    setState({ lines: [line("a")], selected: "point-1-1" });
    removeSelected(record);
    expect(get(linesStore)[0].controlPoints).toEqual([{ x: 30, y: 40 }]);
    expect(get(selectedPointId)).toBeNull();
    expect(record).toHaveBeenCalledWith("Delete Selection");
  });

  it("removes a path and its step when its end point is selected", () => {
    setState({
      lines: [line("a"), line("b")],
      sequence: [path("a"), wait("w"), path("b")],
      selected: "point-1-0",
    });
    removeSelected(record);
    expect(get(linesStore).map((l) => l.id)).toEqual(["b"]);
    expect(get(sequenceStore).map((s) => s.kind)).toEqual(["wait", "path"]);
  });

  it("can't remove the start point", () => {
    setState({ lines: [line("a")], selected: "point-0-0" });
    removeSelected(record);
    expect(get(linesStore)).toHaveLength(1);
    expect(record).toHaveBeenCalledWith("Delete Selection");
  });

  it("leaves a locked path alone", () => {
    setState({ lines: [line("a", { locked: true })], selected: "point-1-1" });
    removeSelected(record);
    expect(get(linesStore)[0].controlPoints).toHaveLength(2);
  });

  it("removes several control points from one path, highest first", () => {
    setState({
      lines: [
        line("a", {
          controlPoints: [
            { x: 1, y: 1 },
            { x: 2, y: 2 },
            { x: 3, y: 3 },
          ],
        }),
      ],
      multi: ["point-1-1", "point-1-3"],
    });
    removeSelected(record);
    expect(get(linesStore)[0].controlPoints).toEqual([{ x: 2, y: 2 }]);
  });

  it("removes selected waits and turns, but not locked ones", () => {
    setState({
      sequence: [wait("a"), wait("b", { locked: true }), turn("c"), turn("d")],
      multi: ["wait-a", "wait-b", "rotate-c"],
    });
    removeSelected(record);
    expect(get(sequenceStore).map((s) => (s as { id: string }).id)).toEqual([
      "b",
      "d",
    ]);
  });

  it("removes the selected event marker from a wait or turn", () => {
    setState({
      sequence: [
        wait("a", { eventMarkers: [marker("m0", 0.1), marker("m1", 0.9)] }),
      ],
      selected: "event-wait-a-0",
    });
    removeSelected(record);
    const item = get(sequenceStore)[0] as { eventMarkers: { id: string }[] };
    expect(item.eventMarkers.map((m) => m.id)).toEqual(["m1"]);
  });

  it("leaves event markers on a locked step", () => {
    setState({
      sequence: [
        turn("a", { locked: true, eventMarkers: [marker("m0", 0.1)] }),
      ],
      selected: "event-rotate-a-0",
    });
    removeSelected(record);
    const item = get(sequenceStore)[0] as { eventMarkers: unknown[] };
    expect(item.eventMarkers).toHaveLength(1);
  });

  it("removes the selected event marker from a path", () => {
    setState({
      lines: [
        line("a", {
          eventMarkers: [marker("m0", 0.2), marker("m1", 0.8)] as never,
        }),
      ],
      selected: "event-0-1",
    });
    removeSelected(record);
    expect(get(linesStore)[0].eventMarkers?.map((m) => m.id)).toEqual(["m0"]);
  });

  it("handles a mixed selection in one go", () => {
    setState({
      lines: [line("a")],
      sequence: [path("a"), wait("w")],
      multi: ["point-1-2", "wait-w"],
    });
    removeSelected(record);
    expect(get(linesStore)[0].controlPoints).toEqual([{ x: 10, y: 20 }]);
    expect(get(sequenceStore).map((s) => s.kind)).toEqual(["path"]);
    expect(record).toHaveBeenCalledTimes(1);
  });
});

describe("movePoint", () => {
  it("does nothing while typing or with nothing selected", () => {
    setState({ lines: [line("a")], selected: "point-1-0" });
    focus.value = true;
    movePoint(1, 0, record);
    expect(get(linesStore)[0].endPoint.x).toBe(50);

    focus.value = false;
    setState({ lines: [line("a")] });
    movePoint(1, 0, record);
    expect(record).not.toHaveBeenCalled();
  });

  it("moves a path's end point an inch, recording the change", () => {
    setState({ lines: [line("a")], selected: "point-1-0" });
    movePoint(1, -1, record);
    expect(get(linesStore)[0].endPoint).toMatchObject({ x: 51, y: 59 });
    expect(record).toHaveBeenCalledWith("Move Point");
  });

  it("moves a control point", () => {
    setState({ lines: [line("a")], selected: "point-1-2" });
    movePoint(0, 1, record);
    expect(get(linesStore)[0].controlPoints[1]).toEqual({ x: 30, y: 41 });
  });

  it("keeps points on the field", () => {
    setState({
      lines: [
        line("a", {
          endPoint: { x: 143.5, y: 0.5, heading: "tangential" } as never,
        }),
      ],
      selected: "point-1-0",
    });
    movePoint(1, -1, record);
    expect(get(linesStore)[0].endPoint).toMatchObject({ x: 144, y: 0 });
  });

  it("leaves locked paths and missing control points alone", () => {
    setState({ lines: [line("a", { locked: true })], selected: "point-1-0" });
    movePoint(1, 0, record);
    expect(get(linesStore)[0].endPoint.x).toBe(50);

    setState({ lines: [line("a")], selected: "point-1-9" });
    movePoint(1, 0, record);
    expect(get(linesStore)[0].controlPoints[0].x).toBe(10);
  });

  it("moves an obstacle corner", () => {
    setState({
      shapes: [
        {
          id: "s",
          name: "s",
          vertices: [
            { x: 5, y: 5 },
            { x: 9, y: 9 },
          ],
          color: "#000",
          fillColor: "#000",
        },
      ] as never,
      selected: "obstacle-0-1",
    });
    movePoint(1, 1, record);
    expect(get(shapesStore)[0].vertices[1]).toEqual({ x: 10, y: 10 });
    expect(get(shapesStore)[0].vertices[0]).toEqual({ x: 5, y: 5 });
  });

  it("moves an event marker along its step by a hundredth", () => {
    setState({
      sequence: [wait("a", { eventMarkers: [marker("m0", 0.5)] })],
      selected: "event-wait-a-0",
    });
    movePoint(1, 0, record);
    const item = get(sequenceStore)[0] as {
      eventMarkers: { position: number }[];
    };
    expect(item.eventMarkers[0].position).toBeCloseTo(0.51, 5);
  });

  it("moves an event marker along its path", () => {
    setState({
      lines: [line("a", { eventMarkers: [marker("m0", 0.5)] as never })],
      selected: "event-0-0",
    });
    movePoint(0, -1, record);
    expect(get(linesStore)[0].eventMarkers?.[0].position).toBeCloseTo(0.49, 5);
  });

  it("moves everything in a multiple selection", () => {
    setState({
      lines: [line("a"), line("b")],
      multi: ["point-1-0", "point-2-1"],
    });
    movePoint(2, 0, record);
    expect(get(linesStore)[0].endPoint.x).toBe(52);
    expect(get(linesStore)[1].controlPoints[0].x).toBe(12);
    expect(record).toHaveBeenCalledTimes(1);
  });

  describe("snapping to the grid", () => {
    beforeEach(() => {
      snapToGrid.set(true);
      showGrid.set(true);
    });

    it("steps to the next grid line", () => {
      setState({
        lines: [
          line("a", {
            endPoint: { x: 50, y: 61, heading: "tangential" } as never,
          }),
        ],
        selected: "point-1-0",
      });
      movePoint(1, 1, record);
      expect(get(linesStore)[0].endPoint).toMatchObject({ x: 54, y: 66 });
      movePoint(-1, -1, record);
      expect(get(linesStore)[0].endPoint).toMatchObject({ x: 48, y: 60 });
    });

    it("steps off a grid line, not onto the same one", () => {
      setState({
        lines: [
          line("a", {
            endPoint: { x: 48, y: 60, heading: "tangential" } as never,
          }),
        ],
        selected: "point-1-0",
      });
      movePoint(1, 0, record);
      expect(get(linesStore)[0].endPoint.x).toBe(54);
    });

    it("stays within the field", () => {
      setState({
        lines: [
          line("a", {
            endPoint: { x: 143, y: 2, heading: "tangential" } as never,
          }),
        ],
        selected: "point-1-0",
      });
      movePoint(1, -1, record);
      expect(get(linesStore)[0].endPoint).toMatchObject({ x: 144, y: 0 });
    });
  });

  describe("the start point", () => {
    it("moves", () => {
      setState({ selected: "point-0-0" });
      movePoint(1, -1, record);
      expect(get(startPointStore)).toMatchObject({ x: 21, y: 29 });
    });

    it("moves along with other selected points", () => {
      setState({ lines: [line("a")], multi: ["point-0-0", "point-1-0"] });
      movePoint(1, 0, record);
      expect(get(startPointStore).x).toBe(21);
      expect(get(linesStore)[0].endPoint.x).toBe(51);
    });

    it("stays put while locked", () => {
      setState({ start: { locked: true }, selected: "point-0-0" });
      movePoint(1, 0, record);
      expect(get(startPointStore).x).toBe(20);
    });
  });
});

describe("getSelectableItems and selectAll", () => {
  it("lists the start point, then each step in order with its points and markers", () => {
    setState({
      lines: [
        line("a", {
          controlPoints: [{ x: 1, y: 1 }],
          eventMarkers: [marker("m", 0.5)] as never,
        }),
      ],
      sequence: [
        path("a"),
        wait("w", { eventMarkers: [marker("e", 0.5)] }),
        turn("r"),
      ],
      shapes: [
        {
          id: "s",
          name: "s",
          vertices: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
          color: "#000",
          fillColor: "#000",
        },
      ] as never,
    });
    expect(getSelectableItems()).toEqual([
      "point-0-0",
      "point-1-1",
      "point-1-0",
      "wait-w",
      "event-wait-w-0",
      "rotate-r",
      "event-0-0",
      "obstacle-0-0",
      "obstacle-0-1",
    ]);
  });

  it("selects every path point, ending on the last", () => {
    setState({ lines: [line("a"), line("b", { controlPoints: [] })] });
    selectAll();
    expect(get(multiSelectedPointIds)).toEqual([
      "point-0-0",
      "point-1-0",
      "point-1-1",
      "point-1-2",
      "point-2-0",
    ]);
    expect(get(multiSelectedLineIds)).toEqual(["a", "b"]);
    expect(get(selectedPointId)).toBe("point-2-0");
    expect(get(selectedLineId)).toBe("b");
  });

  it("does nothing without paths", () => {
    selectAll();
    expect(get(multiSelectedPointIds)).toEqual([]);
  });
});

describe("cycleSequenceSelection", () => {
  const scroll = vi.fn();

  beforeEach(() => scroll.mockReset());

  it("starts at the first step when nothing is selected", () => {
    setState({ lines: [line("a")], sequence: [path("a"), wait("w")] });
    cycleSequenceSelection(1, { scrollToItem: scroll });
    expect(get(selectedPointId)).toBe("point-1-0");
    expect(get(selectedLineId)).toBe("a");
    expect(get(multiSelectedPointIds)).toEqual(["point-1-0"]);
    expect(scroll).toHaveBeenCalledWith("path", "a");
  });

  it("moves to the next and previous step, wrapping round", () => {
    setState({
      lines: [line("a")],
      sequence: [path("a"), wait("w"), turn("r")],
    });
    focus.sequenceIndex = 2;
    cycleSequenceSelection(1, { scrollToItem: scroll });
    expect(get(selectedPointId)).toBe("point-1-0");

    focus.sequenceIndex = 0;
    cycleSequenceSelection(-1, { scrollToItem: scroll });
    expect(get(selectedPointId)).toBe("rotate-r");
    expect(get(selectedLineId)).toBeNull();
    expect(scroll).toHaveBeenLastCalledWith("rotate", "r");
  });

  it("selects a wait and scrolls to it", () => {
    setState({ sequence: [wait("w"), turn("r")] });
    focus.sequenceIndex = 1;
    cycleSequenceSelection(1, { scrollToItem: scroll });
    expect(get(selectedPointId)).toBe("wait-w");
    expect(scroll).toHaveBeenCalledWith("wait", "w");
  });

  it("scrolls to the marker when one is selected", () => {
    setState({
      lines: [line("a", { eventMarkers: [marker("m9", 0.5)] as never })],
      selected: "event-0-0",
    });
    // syncSelectionToUI is reached through cycling; start from a one-step sequence
    setState({
      lines: [line("a", { eventMarkers: [marker("m9", 0.5)] as never })],
      sequence: [path("a")],
    });
    cycleSequenceSelection(1, { scrollToItem: scroll });
    expect(scroll).toHaveBeenCalledWith("path", "a");
  });

  it("does nothing while typing, with no steps, or without somewhere to scroll", () => {
    setState({ sequence: [wait("w")] });
    focus.value = true;
    cycleSequenceSelection(1, { scrollToItem: scroll });
    expect(get(selectedPointId)).toBeNull();

    focus.value = false;
    setState();
    cycleSequenceSelection(1, { scrollToItem: scroll });
    expect(get(selectedPointId)).toBeNull();

    setState({ sequence: [wait("w")] });
    cycleSequenceSelection(1, null);
    expect(get(selectedPointId)).toBe("wait-w");
  });
});
