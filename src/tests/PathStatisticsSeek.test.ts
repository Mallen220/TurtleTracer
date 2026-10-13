// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/svelte";
import PathStatisticsDialog from "../lib/components/dialogs/PathStatisticsDialog.svelte";
import { computePathStatistics } from "../utils/pathStatistics";
import { DEFAULT_SETTINGS } from "../config/defaults";
import { registerCoreUI } from "../lib/coreRegistrations";
import type { Line, Point, SequenceItem } from "../types";

beforeAll(() => registerCoreUI());

const startPoint: Point = { x: 10, y: 10, heading: "tangential" };
const lines: Line[] = [
  {
    id: "a",
    name: "Out",
    endPoint: { x: 130, y: 10, heading: "tangential" },
    controlPoints: [],
    color: "#f00",
  },
];
const sequence: SequenceItem[] = [
  { kind: "wait", id: "w0", name: "Settle", durationMs: 400 },
  { kind: "path", lineId: "a" },
  { kind: "wait", id: "w1", name: "Hold", durationMs: 600 },
];
const settings = { ...DEFAULT_SETTINGS };

// Worked out once the core step kinds are registered (see beforeAll above).
let stats: ReturnType<typeof computePathStatistics>;
beforeAll(() => {
  stats = computePathStatistics(startPoint, lines, sequence, settings);
});
const percentOf = (seconds: number) => (seconds / stats.totalTime) * 100;
const segment = (name: string) => stats.segments.find((s) => s.name === name)!;

function open(props: Record<string, unknown> = {}) {
  const onSeek = vi.fn();
  render(PathStatisticsDialog, {
    isOpen: true,
    startPoint,
    lines,
    sequence,
    settings,
    onClose: vi.fn(),
    onSeek,
    ...props,
  });
  return onSeek;
}

describe("Path statistics jump the timeline", () => {
  beforeEach(() => {
    // Charts only draw once they have a width.
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      value: 480,
    });
  });

  it("goes to the start of a summary row when it is clicked", async () => {
    const onSeek = open();
    const out = segment("Out");
    expect(out.startTime).toBeGreaterThan(0);

    await fireEvent.click(screen.getByTitle(/Go to Out at/));

    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onSeek.mock.calls[0][0]).toBeCloseTo(percentOf(out.startTime));
  });

  it("answers Enter on a summary row, for keyboard users", async () => {
    const onSeek = open();
    const hold = segment("Hold");

    await fireEvent.keyDown(screen.getByTitle(/Go to Hold at/), {
      key: "Enter",
    });

    expect(onSeek.mock.calls[0][0]).toBeCloseTo(percentOf(hold.startTime));
  });

  it("goes to the start of an insight when it is clicked", async () => {
    const onSeek = open();
    const insight = stats.insights[0];
    expect(insight).toBeDefined();

    await fireEvent.click(
      screen.getByRole("button", { name: "Insights view" }),
    );
    await fireEvent.click(screen.getAllByTitle(/^Go to \d/)[0]);

    expect(onSeek.mock.calls[0][0]).toBeCloseTo(percentOf(insight.startTime));
  });

  it("goes to the time under the pointer when a graph is clicked", async () => {
    const onSeek = open();
    await fireEvent.click(screen.getByRole("button", { name: "Graphs view" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const plot = document.querySelector("svg rect[fill='transparent']")!;
    expect(plot).toBeTruthy();
    // Pointer events carry the position in clientX; a plain MouseEvent does too.
    plot.dispatchEvent(
      new MouseEvent("pointerdown", { clientX: 200, bubbles: true }),
    );

    expect(onSeek).toHaveBeenCalledTimes(1);
    const percent = onSeek.mock.calls[0][0];
    expect(percent).toBeGreaterThan(0);
    expect(percent).toBeLessThanOrEqual(100);
  });

  it("measures against the timeline's own length when it differs", async () => {
    // In diff mode the timeline can be longer than this path.
    const onSeek = open({ totalSeconds: stats.totalTime * 2 });
    const out = segment("Out");

    await fireEvent.click(screen.getByTitle(/Go to Out at/));

    expect(onSeek.mock.calls[0][0]).toBeCloseTo(percentOf(out.startTime) / 2);
  });

  it("marks the row the timeline is inside", () => {
    const out = segment("Out");
    open({ percent: percentOf(out.startTime + out.time / 2) });

    expect(screen.getByTitle(/Go to Out at/)).toHaveClass("bg-emerald-50");
    expect(screen.getByTitle(/Go to Hold at/)).not.toHaveClass("bg-emerald-50");
  });

  it("does nothing, and shows no pointer, when there is no timeline to move", async () => {
    open({ onSeek: undefined });
    const row = screen.getByTitle(/Go to Out at/);
    expect(row).not.toHaveClass("cursor-pointer");
    await fireEvent.click(row);
  });
});
