// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/svelte";
import { get } from "svelte/store";

// The optimizer is replaced with one the tests control.
const optimizer = vi.hoisted(() => ({
  constructed: [] as any[][],
  optimize: null as null | ((cb: (r: any) => void) => Promise<any>),
  stop: vi.fn(),
}));
vi.mock("../utils/pathOptimizer", () => ({
  PathOptimizer: class {
    constructor(...args: any[]) {
      optimizer.constructed.push(args);
    }
    optimize = (cb: (r: any) => void) => optimizer.optimize!(cb);
    stop = optimizer.stop;
  },
}));

import OptimizationDialog from "../lib/components/dialogs/OptimizationDialog.svelte";
import { dimmedLinesStore } from "../stores";
import { DEFAULT_SETTINGS } from "../config/defaults";
import type { Line } from "../types";

const makeLine = (id: string, over: Partial<Line> = {}): Line => ({
  id,
  name: `Name ${id}`,
  controlPoints: [{ x: 5, y: 5 } as any],
  color: "red",
  endPoint: { x: 20, y: 20, heading: "tangential", reverse: false },
  eventMarkers: [],
  ...over,
});

const succeeded =
  (lines: Line[], bestTime = 3.25) =>
  async (cb: (r: any) => void) => {
    cb({ generation: 7, bestTime: 4.5, bestLines: lines });
    return { lines, bestTime };
  };

function mount(over: Record<string, unknown> = {}) {
  const props = {
    isOpen: true,
    startPoint: { x: 0, y: 0, heading: "tangential", reverse: false },
    lines: [makeLine("a"), makeLine("b")],
    sequence: [],
    settings: { ...DEFAULT_SETTINGS },
    onApply: vi.fn(),
    onClose: vi.fn(),
    onPreviewChange: vi.fn(),
    ...over,
  };
  const view = render(OptimizationDialog, { props: props as any });
  return { ...view, props };
}

const start = () => fireEvent.click(screen.getByText("Start Optimization"));
const boxes = () => screen.getAllByRole("checkbox") as HTMLInputElement[];

beforeEach(() => {
  optimizer.constructed.length = 0;
  optimizer.stop.mockClear();
  optimizer.optimize = succeeded([makeLine("a"), makeLine("b")]);
  dimmedLinesStore.set([]);
});

describe("choosing paths", () => {
  it("lists each path by name, or by position if it has none", () => {
    mount({ lines: [makeLine("a"), makeLine("b", { name: "" })] });
    expect(screen.getByText("Name a")).toBeInTheDocument();
    expect(screen.getByText("Path 2")).toBeInTheDocument();
  });

  it("says when there are no paths", () => {
    mount({ lines: [] });
    expect(screen.getByText("No paths available")).toBeInTheDocument();
  });

  it("dims the paths that are left out, and stops dimming when closed", async () => {
    const { unmount } = mount();
    await fireEvent.click(boxes()[1]);
    await waitFor(() => expect(get(dimmedLinesStore)).toEqual(["b"]));
    await fireEvent.click(boxes()[1]);
    await waitFor(() => expect(get(dimmedLinesStore)).toEqual([]));

    await fireEvent.click(boxes()[0]);
    await waitFor(() => expect(get(dimmedLinesStore)).toEqual(["a"]));
    unmount();
    expect(get(dimmedLinesStore)).toEqual([]);
  });

  it("only hands selected paths to the optimizer; the rest are locked in place", async () => {
    const lines = [
      makeLine("a"),
      makeLine("b"),
      makeLine("c", { locked: true }),
    ];
    mount({ lines });
    await fireEvent.click(boxes()[1]); // leave out b
    await start();
    await waitFor(() => expect(optimizer.constructed).toHaveLength(1));

    const given = optimizer.constructed[0][1] as Line[];
    expect(given.map((l) => !!l.locked)).toEqual([false, true, true]);
    // The caller's own paths are untouched.
    expect(lines.map((l) => !!l.locked)).toEqual([false, false, true]);
  });

  it("gives left-out paths their original lock back in the result", async () => {
    const lines = [makeLine("a"), makeLine("b")];
    // The optimizer returns paths as it received them, so b comes back locked.
    optimizer.optimize = async (cb) => {
      const given = optimizer.constructed[0][1] as Line[];
      cb({ generation: 1, bestTime: 2, bestLines: structuredClone(given) });
      return { lines: structuredClone(given), bestTime: 2 };
    };
    const { props } = mount({ lines });
    await fireEvent.click(boxes()[1]);
    await start();
    await fireEvent.click(await screen.findByText("Apply New Path"));

    const applied = props.onApply.mock.calls[0][0] as Line[];
    expect(applied.map((l) => !!l.locked)).toEqual([false, false]);
    const previewed = (
      props.onPreviewChange.mock.calls as [Line[] | null][]
    ).find(([l]: [Line[] | null]) => l?.length === 2)![0] as Line[];
    expect(previewed[1].locked).toBeFalsy();
  });

  it("does nothing without settings to optimize against", async () => {
    mount({ settings: undefined });
    await start();
    expect(optimizer.constructed).toHaveLength(0);
    expect(screen.getByText("Start Optimization")).toBeInTheDocument();
  });
});

describe("a successful run", () => {
  it("shows the generation and best time, then offers to apply", async () => {
    mount();
    await start();
    await screen.findByText("Apply New Path");
    expect(screen.getByText("Gen 7")).toBeInTheDocument();
    expect(screen.getByText("4.500s")).toBeInTheDocument();
    expect(screen.getByText("Discard")).toBeInTheDocument();
  });

  it("previews the best path found so far while running", async () => {
    const { props } = mount();
    await start();
    await screen.findByText("Apply New Path");
    const previews = (
      props.onPreviewChange.mock.calls as [Line[] | null][]
    ).map(([l]: [Line[] | null]) => l);
    expect(previews.some((l: Line[] | null) => l?.length === 2)).toBe(true);
  });

  it("applies the optimized paths, clears the preview and closes", async () => {
    const { props } = mount();
    await start();
    await fireEvent.click(await screen.findByText("Apply New Path"));
    expect(props.onApply).toHaveBeenCalledTimes(1);
    expect(props.onApply.mock.calls[0][0]).toHaveLength(2);
    expect(props.onPreviewChange).toHaveBeenLastCalledWith(null);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("discarding clears the preview and applies nothing", async () => {
    const { props } = mount();
    await start();
    await fireEvent.click(await screen.findByText("Discard"));
    expect(props.onApply).not.toHaveBeenCalled();
    expect(props.onPreviewChange).toHaveBeenLastCalledWith(null);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("hides and shows the preview on request", async () => {
    const { props } = mount();
    await start();
    await fireEvent.click(await screen.findByText("Hide Preview"));
    expect(props.onPreviewChange).toHaveBeenLastCalledWith(null);
    await fireEvent.click(screen.getByText("Show Preview"));
    const last = props.onPreviewChange.mock.lastCall![0] as Line[];
    expect(last).toHaveLength(2);
  });
});

describe("stopping", () => {
  it("asks the optimizer to stop, and says so while it winds down", async () => {
    let finish!: (r: any) => void;
    optimizer.optimize = () => new Promise((resolve) => (finish = resolve));
    mount();
    await start();
    expect(await screen.findByText("Optimizing...")).toBeInTheDocument();
    expect(screen.getByText("--")).toBeInTheDocument(); // nothing found yet

    await fireEvent.click(screen.getByText("Stop"));
    expect(optimizer.stop).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Stopping...")).toBeDisabled();

    finish({ lines: [makeLine("a")], bestTime: 6 });
    expect(await screen.findByText("Apply New Path")).toBeInTheDocument();
  });

  it("shows 'Validating...' while the best time is still an invalid placeholder", async () => {
    let report!: (r: any) => void;
    let finish!: (r: any) => void;
    optimizer.optimize = (cb) => {
      report = cb;
      return new Promise((resolve) => (finish = resolve));
    };
    mount();
    await start();
    await screen.findByText("Optimizing...");
    report({ generation: 2, bestTime: 5000, bestLines: [] });
    expect(await screen.findByText("Validating...")).toBeInTheDocument();
    finish({ lines: [], bestTime: 1 });
  });
});

describe("when no valid path is found", () => {
  it("explains the collision problem and offers to retry instead of apply", async () => {
    optimizer.optimize = async () => ({
      lines: [makeLine("a")],
      bestTime: 10000,
    });
    const { props } = mount();
    await start();
    expect(await screen.findByText("No valid path")).toBeInTheDocument();
    expect(screen.getByText(/Collision Avoidance Failed/)).toBeInTheDocument();
    expect(screen.queryByText("Apply New Path")).toBeNull();
    expect(screen.queryByText("Hide Preview")).toBeNull();
    expect(props.onPreviewChange).toHaveBeenLastCalledWith(null);
  });

  it("retries with another run", async () => {
    optimizer.optimize = async () => ({
      lines: [makeLine("a")],
      bestTime: 10000,
    });
    mount();
    await start();
    await fireEvent.click(await screen.findByText("Retry Optimization"));
    await waitFor(() => expect(optimizer.constructed).toHaveLength(2));
  });

  it("can be discarded", async () => {
    optimizer.optimize = async () => ({
      lines: [makeLine("a")],
      bestTime: 10000,
    });
    const { props } = mount();
    await start();
    await fireEvent.click(await screen.findByText("Discard"));
    expect(props.onClose).toHaveBeenCalled();
    expect(props.onApply).not.toHaveBeenCalled();
  });

  it("shows the optimizer's own error instead of the collision message", async () => {
    optimizer.optimize = async () => ({
      lines: [makeLine("a")],
      bestTime: 3,
      error: "Sequence refers to a missing path",
    });
    mount();
    await start();
    expect(
      await screen.findByText("Sequence refers to a missing path"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/structure is currently invalid/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Collision Avoidance Failed/)).toBeNull();
    expect(screen.queryByText("Apply New Path")).toBeNull();
  });
});
