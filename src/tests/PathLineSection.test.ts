// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "svelte/store";
import PathLineSectionWrapper from "./PathLineSectionWrapper.svelte";
import { registerCoreUI } from "../lib/coreRegistrations";
import { actionRegistry } from "../lib/actionRegistry";
import { settingsStore, startPointStore } from "../lib/projectStore";
import { selectedLineId, selectedPointId, focusRequest } from "../stores";
import { DEFAULT_SETTINGS } from "../config/defaults";
import { toUser } from "../utils/coordinates";
import type { Line, Point } from "../types";

// The section draws a small preview of the path; it needs a ResizeObserver.
class FakeResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

const line = (
  id: string,
  over: Partial<Line> = {},
  end: Partial<Point> = {},
): Line => ({
  id,
  name: "",
  endPoint: {
    x: 30,
    y: 40,
    heading: "tangential",
    reverse: false,
    ...end,
  } as Point,
  controlPoints: [],
  color: "#ff0000",
  ...over,
});

type Options = {
  idx?: number;
  collapsedStart?: boolean;
  [callback: string]: unknown;
};

function mount(lines: Line[], options: Options = {}) {
  const callbacks = {
    recordChange: vi.fn(),
    onRemove: vi.fn(),
    onMoveUp: vi.fn(),
    onMoveDown: vi.fn(),
    onAddAction: vi.fn(),
  };
  const view = render(PathLineSectionWrapper, {
    initial: lines,
    ...callbacks,
    ...options,
  } as any);
  const wrapper = view.component as any;
  return {
    ...callbacks,
    lines: () => wrapper.getLines() as Line[],
    collapsed: () => wrapper.isCollapsed() as boolean,
  };
}

const xBox = () =>
  screen.getByLabelText("Target X position") as HTMLInputElement;
const yBox = () =>
  screen.getByLabelText("Target Y position") as HTMLInputElement;
const type = async (box: HTMLInputElement, value: string) => {
  await fireEvent.focus(box);
  await fireEvent.input(box, { target: { value } });
  await fireEvent.blur(box);
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  actionRegistry.reset();
  registerCoreUI();
  settingsStore.set({ ...DEFAULT_SETTINGS } as any);
  startPointStore.set({
    x: 0,
    y: 0,
    heading: "tangential",
    reverse: false,
  } as Point);
  selectedLineId.set(null);
  selectedPointId.set(null);
  focusRequest.set(null);
});

describe("the card header", () => {
  it("numbers the path and shows its name", () => {
    mount([line("a"), line("b", { name: "Score" })], { idx: 1 });
    expect(screen.getByText("Path 2")).toBeInTheDocument();
    expect((screen.getByLabelText("Path name") as HTMLInputElement).value).toBe(
      "Score",
    );
  });

  it("collapses and expands", async () => {
    const t = mount([line("a")]);
    expect(xBox()).toBeInTheDocument();
    await fireEvent.click(screen.getByLabelText("Collapse Path 1"));
    await waitFor(() =>
      expect(screen.queryByLabelText("Target X position")).toBeNull(),
    );
    expect(t.collapsed()).toBe(true);
    await fireEvent.click(screen.getByLabelText("Expand Path 1"));
    await waitFor(() => expect(xBox()).toBeInTheDocument());
  });

  it("starts collapsed when told to", () => {
    mount([line("a")], { collapsedStart: true });
    expect(screen.queryByLabelText("Target X position")).toBeNull();
  });

  it("selects the path when its card is clicked or activated from the keyboard", async () => {
    mount([line("a")]);
    const card = screen.getByRole("button", { pressed: false });
    await fireEvent.click(card);
    expect(get(selectedLineId)).toBe("a");

    selectedLineId.set(null);
    await fireEvent.keyDown(card, { key: "Enter" });
    expect(get(selectedLineId)).toBe("a");
    selectedLineId.set(null);
    await fireEvent.keyDown(card, { key: " " });
    expect(get(selectedLineId)).toBe("a");
    selectedLineId.set(null);
    await fireEvent.keyDown(card, { key: "x" });
    expect(get(selectedLineId)).toBeNull();
  });

  it("marks the selected path", async () => {
    mount([line("a")]);
    selectedLineId.set("a");
    await waitFor(() =>
      expect(screen.getByRole("button", { pressed: true })).toBeInTheDocument(),
    );
  });
});

describe("naming", () => {
  it("renames the path and records the change when the box loses focus", async () => {
    const t = mount([line("a")]);
    const box = screen.getByLabelText("Path name");
    await fireEvent.input(box, { target: { value: "Score" } });
    expect(t.lines()[0].name).toBe("Score");
    await fireEvent.blur(box);
    expect(t.recordChange).toHaveBeenCalledWith("Rename Path");
  });

  it("points out that paths sharing a name share a position", async () => {
    mount([line("a", { name: "Shoot" }), line("b", { name: "Shoot" })]);
    const marker = document.querySelector('[role="presentation"].cursor-help')!;
    expect(marker).not.toBeNull();
    await fireEvent.mouseEnter(marker);
    expect(await screen.findByText("Linked Path")).toBeInTheDocument();
    expect(screen.getByText(/shares its X\/Y coordinates/)).toBeInTheDocument();
  });

  it("shows no link marker for a name that is unique", () => {
    mount([line("a", { name: "Shoot" }), line("b", { name: "Park" })]);
    expect(document.querySelector(".cursor-help")).toBeNull();
  });
});

describe("hiding, locking and moving", () => {
  it("hides and shows the path", async () => {
    const t = mount([line("a")]);
    await fireEvent.click(screen.getByLabelText("Hide Path"));
    await waitFor(() =>
      expect(screen.getByLabelText("Show Path")).toBeInTheDocument(),
    );
    expect(t.lines()[0].hidden).toBe(true);
    await fireEvent.click(screen.getByLabelText("Show Path"));
    await waitFor(() =>
      expect(screen.getByLabelText("Hide Path")).toBeInTheDocument(),
    );
    expect(t.lines()[0].hidden).toBe(false);
    expect(t.recordChange).toHaveBeenCalledTimes(2);
  });

  it("locking disables editing, moving and deleting", async () => {
    const t = mount([line("a")]);
    await fireEvent.click(screen.getByLabelText("Lock Path"));
    await waitFor(() =>
      expect(screen.getByLabelText("Unlock Path")).toBeInTheDocument(),
    );
    expect(t.lines()[0].locked).toBe(true);
    expect(xBox()).toBeDisabled();
    expect(yBox()).toBeDisabled();
    expect(screen.getByLabelText("Path name")).toBeDisabled();
    expect(screen.getByLabelText("Move Up")).toBeDisabled();
    expect(screen.getByLabelText("Move Down")).toBeDisabled();
    expect(screen.getByLabelText("Delete Path")).toBeDisabled();

    await fireEvent.click(screen.getByLabelText("Unlock Path"));
    await waitFor(() => expect(xBox()).not.toBeDisabled());
  });

  it("moves the path up or down", async () => {
    const t = mount([line("a"), line("b")]);
    await fireEvent.click(screen.getByLabelText("Move Up"));
    await fireEvent.click(screen.getByLabelText("Move Down"));
    expect(t.onMoveUp).toHaveBeenCalledTimes(1);
    expect(t.onMoveDown).toHaveBeenCalledTimes(1);
  });

  it("disables the arrow that can't be used", () => {
    mount([line("a")], { canMoveUp: false, canMoveDown: false });
    expect(screen.getByLabelText("Move Up")).toBeDisabled();
    expect(screen.getByLabelText("Move Down")).toBeDisabled();
  });

  it("asks for confirmation before deleting", async () => {
    const t = mount([line("a")]);
    await fireEvent.click(screen.getByLabelText("Delete Path"));
    expect(t.onRemove).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByLabelText("Confirm Deletion"));
    expect(t.onRemove).toHaveBeenCalledTimes(1);
  });

  it("adds a step after this path from the insert bar", async () => {
    const t = mount([line("a")]);
    await fireEvent.click(screen.getByLabelText("Add Wait After"));
    expect(t.onAddAction).toHaveBeenCalledTimes(1);
    expect(t.onAddAction.mock.calls[0][0]).toMatchObject({ kind: "wait" });
  });
});

describe("the target position", () => {
  it("shows the path's end point", () => {
    mount([line("a")]);
    expect(xBox().value).toBe("30.00");
    expect(yBox().value).toBe("40.00");
  });

  it("moves the end point when a value is typed and committed", async () => {
    const t = mount([line("a")]);
    await type(xBox(), "55.5");
    await type(yBox(), "66");
    expect(t.lines()[0].endPoint).toMatchObject({ x: 55.5, y: 66 });
  });

  it("puts the old value back when what was typed isn't a number", async () => {
    const t = mount([line("a")]);
    await type(xBox(), "");
    expect(t.lines()[0].endPoint).toMatchObject({ x: 30, y: 40 });
    await waitFor(() => expect(xBox().value).toBe("30.00"));
  });

  it("keeps the typed text while it is being edited", async () => {
    mount([line("a")]);
    await fireEvent.focus(xBox());
    await fireEvent.input(xBox(), { target: { value: "12" } });
    // Not reformatted as "12.00" until the box is left.
    expect(xBox().value).toBe("12");
    await fireEvent.blur(xBox());
    await waitFor(() => expect(xBox().value).toBe("12.00"));
  });

  it("takes centimetres when the units are metric", async () => {
    settingsStore.set({
      ...DEFAULT_SETTINGS,
      visualizerUnits: "metric",
    } as any);
    const t = mount([line("a", {}, { x: 10, y: 20 })]);
    expect(Number(xBox().value)).toBeCloseTo(25.4, 1);
    await type(xBox(), "50.8");
    expect(t.lines()[0].endPoint.x).toBeCloseTo(20);
    expect(t.lines()[0].endPoint.y).toBeCloseTo(20);
  });

  it("works in the FTC coordinate system, with limits centred on the field", async () => {
    settingsStore.set({ ...DEFAULT_SETTINGS, coordinateSystem: "FTC" } as any);
    const t = mount([line("a", {}, { x: 30, y: 40 })]);
    const shown = toUser({ x: 30, y: 40 } as Point, "FTC");
    expect(Number(xBox().value)).toBeCloseTo(shown.x, 1);
    expect(xBox().min).toBe("-72");
    expect(xBox().max).toBe("72");
    // Retyping what is shown leaves the point where it was.
    await type(xBox(), String(shown.x));
    expect(t.lines()[0].endPoint.x).toBeCloseTo(30);
    expect(t.lines()[0].endPoint.y).toBeCloseTo(40);
  });

  it("limits the boxes to the field in the default coordinate system", () => {
    mount([line("a")]);
    expect(xBox().min).toBe("0");
    expect(xBox().max).toBe("144");
    expect(yBox().max).toBe("144");
  });

  it("focuses the right box when asked, but only for this path's end point", async () => {
    mount([line("a")]);
    selectedPointId.set("point-1-0");
    focusRequest.set({ field: "y", timestamp: 1 });
    await waitFor(() => expect(document.activeElement).toBe(yBox()));
    focusRequest.set({ field: "x", timestamp: 2 });
    await waitFor(() => expect(document.activeElement).toBe(xBox()));

    (document.activeElement as HTMLElement).blur();
    selectedPointId.set("point-2-0"); // a different path's point
    focusRequest.set({ field: "x", timestamp: 3 });
    await new Promise((r) => setTimeout(r, 20));
    expect(document.activeElement).not.toBe(xBox());
  });

  it("focuses the name box on a rename request for this path", async () => {
    mount([line("a")]);
    focusRequest.set({ field: "name", id: "a", timestamp: 1 });
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText("Path name")),
    );
  });
});

describe("chains", () => {
  const chain = (globalOn?: Partial<Line>) => [
    line("a", { ...globalOn }),
    line("b", { isChain: true }),
    line("c", { isChain: true }),
  ];

  it("offers a global heading on the paths of a chain, but not on a lone path", () => {
    mount([line("a"), line("b")]);
    expect(screen.queryByText("Global Chain Heading")).toBeNull();
  });

  it("turns a chain's global heading on from the first path, copying its heading", async () => {
    const lines = chain();
    lines[0].endPoint = {
      x: 30,
      y: 40,
      heading: "constant",
      degrees: 45,
    } as Point;
    const t = mount(lines, { idx: 0 });
    await fireEvent.click(screen.getByLabelText("Global Chain Heading"));
    await waitFor(() => expect(t.lines()[0].globalHeading).toBe("constant"));
    expect(t.lines()[0].globalDegrees).toBe(45);
    expect(t.recordChange).toHaveBeenCalledWith("Toggle Global Heading");
    // The first path of the project sets the start point's heading too.
    expect(get(startPointStore)).toMatchObject({
      heading: "constant",
      degrees: 45,
    });
  });

  it("turns it on from a later path by setting it on the chain's first path", async () => {
    const lines = chain();
    lines[1].endPoint = {
      x: 1,
      y: 2,
      heading: "facingPoint",
      targetX: 10,
      targetY: 20,
    } as Point;
    const t = mount(lines, { idx: 1 });
    await fireEvent.click(screen.getByLabelText("Global Chain Heading"));
    await waitFor(() => expect(t.lines()[0].globalHeading).toBe("facingPoint"));
    expect(t.lines()[0]).toMatchObject({
      globalTargetX: 10,
      globalTargetY: 20,
    });
    expect(t.lines()[1].globalHeading).toBeUndefined();
  });

  it("creates a default segment when a piecewise heading is made global", async () => {
    const lines = chain();
    lines[0].endPoint = {
      x: 30,
      y: 40,
      heading: "piecewise",
      reverse: true,
      segments: [],
    } as any;
    const t = mount(lines, { idx: 0 });
    await fireEvent.click(screen.getByLabelText("Global Chain Heading"));
    await waitFor(() => expect(t.lines()[0].globalSegments).toHaveLength(1));
    expect(t.lines()[0].globalSegments![0]).toMatchObject({
      tStart: 0,
      tEnd: 1,
      heading: "tangential",
      reverse: true,
    });
  });

  it("turns it off again", async () => {
    const t = mount(chain({ globalHeading: "constant", globalDegrees: 10 }), {
      idx: 0,
    });
    const box = screen.getByLabelText(
      "Global Chain Heading",
    ) as HTMLInputElement;
    expect(box.checked).toBe(true);
    await fireEvent.click(box);
    await waitFor(() => expect(t.lines()[0].globalHeading).toBeUndefined());
  });

  it("can't be changed while the path is locked", () => {
    const lines = chain();
    lines[0].locked = true;
    mount(lines, { idx: 0 });
    expect(screen.getByLabelText("Global Chain Heading")).toBeDisabled();
  });

  it("tells later paths their heading is overridden, and jumps to the source", async () => {
    const onScrollToItem = vi.fn();
    mount(chain({ globalHeading: "constant", globalDegrees: 10 }), {
      idx: 2,
      onScrollToItem,
    });
    expect(screen.queryByLabelText("Global Chain Heading")).toBeNull();
    await fireEvent.click(
      screen.getByText("Overridden by Global Chain Heading"),
    );
    expect(onScrollToItem).toHaveBeenCalledWith("a");
  });

  it("does nothing on that button when nothing handles the jump", async () => {
    mount(chain({ globalHeading: "constant" }), { idx: 1 });
    await expect(
      fireEvent.click(screen.getByText("Overridden by Global Chain Heading")),
    ).resolves.not.toThrow();
  });
});
