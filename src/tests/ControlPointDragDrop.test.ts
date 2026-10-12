// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { fireEvent, render, screen } from "@testing-library/svelte";
import Wrapper from "./PathTabWrapper.svelte";
import { registerCoreUI } from "../lib/coreRegistrations";
import { DEFAULT_SETTINGS, getDefaultStartPoint } from "../config";
import type { Line, SequenceItem } from "../types";

beforeAll(() => registerCoreUI());

const line = (id: string, xs: number[]): Line => ({
  id,
  name: id,
  endPoint: { x: 100, y: 100, heading: "tangential", reverse: false },
  controlPoints: xs.map((x) => ({ x, y: 50 })),
  color: "#22aa55",
});

type View = {
  currentLines: () => Line[];
  currentSequence: () => SequenceItem[];
};

function show() {
  const recordChange = vi.fn();
  const lines = [line("first", [10, 20, 30]), line("second", [40])];
  const sequence: SequenceItem[] = lines.map((l) => ({
    kind: "path",
    lineId: l.id!,
  }));
  const view = render(Wrapper, {
    initialLines: lines,
    initialSequence: sequence,
    startPoint: getDefaultStartPoint(),
    settings: structuredClone(DEFAULT_SETTINGS),
    recordChange,
  });
  return { recordChange, ...(view.component as unknown as View) };
}

/** A drag event with a position; jsdom has no DragEvent to fill in. */
const drag = (type: string, clientY: number) =>
  new MouseEvent(type, { bubbles: true, cancelable: true, clientY });

describe("Dragging control points in the Paths tab", () => {
  beforeEach(() => {
    // PathTab asks what is under the pointer when a drag starts.
    document.elementFromPoint = () => null;
    // Give every control point row a place on the page, 40px apart.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const index = Number(this.dataset.cpIndex ?? 0);
        const top = index * 40;
        return {
          top,
          bottom: top + 36,
          height: 36,
          left: 0,
          right: 200,
          width: 200,
          x: 0,
          y: top,
          toJSON: () => ({}),
        };
      },
    );
  });
  afterEach(() => vi.restoreAllMocks());

  async function openFirstPathsPoints() {
    await fireEvent.click(screen.getAllByTitle("Show control points")[0]);
    return Array.from(
      document.querySelectorAll<HTMLElement>(
        "#control-points-list-0 [data-cp-index]",
      ),
    );
  }

  it("moves a point to where it is dropped, and leaves the paths where they are", async () => {
    const { recordChange, currentLines, currentSequence } = show();
    const rows = await openFirstPathsPoints();
    expect(rows).toHaveLength(3);

    rows[0].dispatchEvent(drag("dragstart", 18));
    // Hover over the lower half of the last row, then let go.
    globalThis.dispatchEvent(drag("dragover", 2 * 40 + 30));
    globalThis.dispatchEvent(drag("drop", 2 * 40 + 30));

    expect(currentLines()[0].controlPoints.map((p) => p.x)).toEqual([
      20, 30, 10,
    ]);
    expect(recordChange).toHaveBeenCalledTimes(1);
    expect(recordChange).toHaveBeenCalledWith("Update Control Points");
    // The paths themselves were not reordered.
    expect(currentLines().map((l) => l.id)).toEqual(["first", "second"]);
    expect(
      currentSequence().map((s) => (s as { lineId: string }).lineId),
    ).toEqual(["first", "second"]);
  });

  it("puts a point above the row it is dropped on the top half of", async () => {
    const { currentLines } = show();
    const rows = await openFirstPathsPoints();

    rows[2].dispatchEvent(drag("dragstart", 2 * 40 + 18));
    globalThis.dispatchEvent(drag("dragover", 4));
    globalThis.dispatchEvent(drag("drop", 4));

    expect(currentLines()[0].controlPoints.map((p) => p.x)).toEqual([
      30, 10, 20,
    ]);
  });

  it("changes nothing when a point is dropped where it started", async () => {
    const { recordChange, currentLines } = show();
    const rows = await openFirstPathsPoints();

    rows[1].dispatchEvent(drag("dragstart", 40 + 18));
    globalThis.dispatchEvent(drag("dragover", 40 + 20));
    globalThis.dispatchEvent(drag("drop", 40 + 20));

    expect(currentLines()[0].controlPoints.map((p) => p.x)).toEqual([
      10, 20, 30,
    ]);
    expect(recordChange).not.toHaveBeenCalled();
  });

  it("still drags a whole path by its card", async () => {
    const { currentSequence } = show();
    const items = Array.from(
      document.querySelectorAll<HTMLElement>("[data-index][draggable='true']"),
    );
    expect(items).toHaveLength(2);
    // The event's target is the item itself, as when grabbing the card.
    items[0].dispatchEvent(drag("dragstart", 0));
    expect(currentSequence()).toHaveLength(2);
  });
});
