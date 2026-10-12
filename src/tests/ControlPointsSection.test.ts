// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/svelte";
import { get } from "svelte/store";
import Wrapper from "./ControlPointsSectionWrapper.svelte";
import { selectedLineId, selectedPointId } from "../stores";
import type { Line } from "../types";

const makeLine = (over: Partial<Line> = {}): Line => ({
  id: "line-1",
  name: "Out",
  endPoint: { x: 100, y: 100, heading: "tangential" },
  controlPoints: [
    { x: 20, y: 30 },
    { x: 60, y: 70 },
    { x: 80, y: 90 },
  ],
  color: "#22aa55",
  ...over,
});

function show(line = makeLine(), props: Record<string, unknown> = {}) {
  const recordChange = vi.fn();
  const view = render(Wrapper, { initial: line, recordChange, ...props });
  const component = view.component as unknown as {
    currentLine: () => Line;
    isCollapsed: () => boolean;
  };
  return { recordChange, ...component, ...view };
}

const input = (point: number, axis: "X" | "Y") =>
  screen.getByLabelText(`Line 1 Control Point ${point} ${axis}`);

describe("ControlPointsSection", () => {
  beforeEach(() => {
    selectedPointId.set(null);
    selectedLineId.set(null);
  });

  it("lists each point with its number and position", () => {
    show();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(input(2, "X")).toHaveValue(60);
    expect(input(2, "Y")).toHaveValue(70);
  });

  it("says how many points there are", () => {
    show(makeLine({ controlPoints: [{ x: 1, y: 2 }] }));
    const header = screen.getByTitle("Hide control points");
    expect(header).toHaveTextContent("Control Point (1)");
  });

  it("explains an empty list instead of showing nothing", () => {
    show(makeLine({ controlPoints: [] }));
    expect(
      screen.getByText("Add a control point to bend the path."),
    ).toBeTruthy();
  });

  it("adds a point, opens the list and selects the new point", async () => {
    const { recordChange, currentLine, isCollapsed } = show(
      makeLine({ controlPoints: [] }),
      { startCollapsed: true },
    );

    await fireEvent.click(screen.getByRole("button", { name: "Add Point" }));

    expect(currentLine().controlPoints).toHaveLength(1);
    expect(isCollapsed()).toBe(false);
    expect(recordChange).toHaveBeenCalledTimes(1);
    // Point 0 is the end of the path, so the first control point is 1.
    expect(get(selectedPointId)).toBe("point-1-1");
    expect(get(selectedLineId)).toBe("line-1");
  });

  it("selects a point when its row is clicked, for the field to highlight", async () => {
    show();
    await fireEvent.click(screen.getAllByRole("listitem")[1]);
    expect(get(selectedPointId)).toBe("point-1-2");
  });

  it("selects a point when you tab into its fields", async () => {
    show();
    await fireEvent.focusIn(input(3, "Y"));
    expect(get(selectedPointId)).toBe("point-1-3");
  });

  it("marks the selected row", () => {
    selectedPointId.set("point-1-2");
    show();
    const [first, second] = screen.getAllByRole("listitem");
    expect(second).toHaveClass("border-emerald-600");
    expect(first).not.toHaveClass("border-emerald-600");
  });

  it("moves a point as you type, and records the edit once, when you leave the field", async () => {
    const { recordChange, currentLine } = show();

    await fireEvent.input(input(1, "X"), { target: { value: "42" } });
    await fireEvent.input(input(1, "X"), { target: { value: "43" } });
    expect(currentLine().controlPoints[0].x).toBe(43);
    expect(recordChange).not.toHaveBeenCalled();

    await fireEvent.blur(input(1, "X"));
    expect(recordChange).toHaveBeenCalledTimes(1);

    // Leaving a field that wasn't edited records nothing.
    await fireEvent.blur(input(2, "Y"));
    expect(recordChange).toHaveBeenCalledTimes(1);
  });

  it("ignores a field that holds no number yet", async () => {
    const { currentLine } = show();
    await fireEvent.input(input(1, "Y"), { target: { value: "" } });
    expect(currentLine().controlPoints[0].y).toBe(30);
  });

  it("moves a point up and down, and its highlight goes with it", async () => {
    selectedPointId.set("point-1-1");
    const { recordChange, currentLine } = show();

    await fireEvent.click(
      screen.getAllByRole("button", { name: "Move control point down" })[0],
    );

    expect(currentLine().controlPoints.map((p) => p.x)).toEqual([60, 20, 80]);
    expect(recordChange).toHaveBeenCalledTimes(1);
    expect(get(selectedPointId)).toBe("point-1-2");
  });

  it("removes a point after a second click to confirm, and drops its highlight", async () => {
    selectedPointId.set("point-1-2");
    const { recordChange, currentLine } = show();

    await fireEvent.click(
      screen.getAllByRole("button", { name: "Remove Control Point" })[1],
    );
    // One click only asks.
    expect(currentLine().controlPoints).toHaveLength(3);

    await fireEvent.click(
      screen.getByRole("button", { name: "Confirm Deletion" }),
    );

    expect(currentLine().controlPoints.map((p) => p.x)).toEqual([20, 80]);
    expect(recordChange).toHaveBeenCalledTimes(1);
    expect(get(selectedPointId)).toBeNull();
  });

  it("can't move the first point up or the last one down", () => {
    show();
    const ups = screen.getAllByRole("button", {
      name: "Move control point up",
    });
    const downs = screen.getAllByRole("button", {
      name: "Move control point down",
    });
    expect(ups[0]).toBeDisabled();
    expect(ups[1]).toBeEnabled();
    expect(downs.at(-1)).toBeDisabled();
  });

  it("hides the list when collapsed", async () => {
    show();
    await fireEvent.click(screen.getByTitle("Hide control points"));
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByTitle("Show control points")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("is read-only on a locked path", () => {
    show(makeLine({ locked: true }));
    expect(input(1, "X")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add Point" })).toBeDisabled();
    expect(screen.queryByTitle("Drag to reorder")).toBeNull();
  });
});
