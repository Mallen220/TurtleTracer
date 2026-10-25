// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// The speed limits offered for chained corners the robot swings wide of or
// cuts, found by trying them in the simulation. The robot's tuning is never
// offered as a fix: translational P is measured on the robot.
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import { fireEvent, render, screen } from "@testing-library/svelte";
import { get } from "svelte/store";
import PathLineSectionWrapper from "./PathLineSectionWrapper.svelte";
import { calculatePathTime } from "../utils/timeCalculator";
import { computePathStatistics } from "../utils/pathStatistics";
import {
  applySpeedFix,
  cornerSpeedFixes,
  holdsCorner,
  speedFixLabel,
  type FixContext,
} from "../utils/timeCalculator/fixSearch";
import {
  settingsStore,
  startPointStore,
  sequenceStore,
  timePredictionStore,
} from "../lib/projectStore";
import { selectedLineId, selectedPointId, focusRequest } from "../stores";
import { actionRegistry } from "../lib/actionRegistry";
import { DEFAULT_SETTINGS } from "../config/defaults";
import { SCENARIO_MOTION } from "./helpers/motion";
import { registerCoreUI } from "../lib/coreRegistrations";
import type { Line, Point, SequenceItem, Settings } from "../types";

beforeAll(() => registerCoreUI());

const start = { x: 10, y: 72, heading: "constant", degrees: 0 } as Point;
const line = (id: string, x: number, y: number, chain = false): Line => ({
  id,
  name: id.toUpperCase(),
  endPoint: { x, y, heading: "constant", degrees: 0 } as Point,
  controlPoints: [],
  color: "#000",
  ...(chain ? { isChain: true } : {}),
});

/** A straight path, then one chained on at `turn` degrees. */
const corner = (turn: number): Line[] => {
  const rad = (turn * Math.PI) / 180;
  return [
    line("a", 80, 72),
    line("b", 80 + 50 * Math.cos(rad), 72 + 50 * Math.sin(rad), true),
  ];
};
const sequenceOf = (lines: Line[]): SequenceItem[] =>
  lines.map((l) => ({
    kind: "path",
    lineId: l.id!,
    ...(l.isChain ? { isChain: true } : {}),
  }));

const settings = {
  ...DEFAULT_SETTINGS,
  ...SCENARIO_MOTION,
  maxVelocity: 50,
} as Settings;

const ctxOf = (lines: Line[]): FixContext => ({
  startPoint: start,
  lines,
  sequence: sequenceOf(lines),
  settings,
});

const timed = (lines: Line[], sequence = sequenceOf(lines)) =>
  calculatePathTime(start, lines, settings, sequence);
const recoveryOf = (lines: Line[]) =>
  timed(lines).timeline.find((e) => e.type === "recovery");
/** How long the run takes with the robot stopping at the corner instead. */
const unchainedTime = (lines: Line[]) => {
  const stops = lines.map((l) => ({ ...l, isChain: false }));
  return timed(stops).totalTime;
};

describe("cornerSpeedFixes", () => {
  it("slows the path into a corner the robot cuts until it holds it", () => {
    const lines = corner(45);
    expect(holdsCorner(recoveryOf(lines))).toBe(false);
    const fixes = cornerSpeedFixes(ctxOf(lines), 1);
    const own = fixes.find((f) => f.field === "maxSpeed")!;
    // Set on the path the robot arrives on: that is what sets its speed at
    // the corner. The path it turns onto doesn't change the swing.
    expect(own.lineIndex).toBe(0);
    expect(speedFixLabel(own)).toBe(`Limit A to ${own.speed} in/s`);

    const fixed = applySpeedFix(lines, own);
    expect(holdsCorner(recoveryOf(fixed))).toBe(true);
    // The fastest that does: one in/s faster doesn't.
    const faster = applySpeedFix(lines, { ...own, speed: own.speed + 1 });
    expect(holdsCorner(recoveryOf(faster))).toBe(false);
    // And it beats stopping at the corner.
    expect(timed(fixed).totalTime).toBeLessThan(unchainedTime(lines));
  });

  it("offers the whole chain a speed too", () => {
    const lines = corner(45);
    const chain = cornerSpeedFixes(ctxOf(lines), 1).find(
      (f) => f.field === "chainMaxSpeed",
    )!;
    expect(chain.lineIndex).toBe(0);
    expect(speedFixLabel(chain)).toBe(
      `Limit the whole chain to ${chain.speed} in/s`,
    );
    expect(holdsCorner(recoveryOf(applySpeedFix(lines, chain)))).toBe(true);
  });

  it("offers nothing slower than stopping at the corner", () => {
    // Holding a right angle takes a crawl, which takes twice as long as
    // unchaining the paths.
    const lines = corner(90);
    expect(holdsCorner(recoveryOf(lines))).toBe(false);
    expect(cornerSpeedFixes(ctxOf(lines), 1)).toEqual([]);
  });

  it("offers nothing for a corner the robot already holds, or no corner", () => {
    const lines = corner(45);
    const [own] = cornerSpeedFixes(ctxOf(lines), 1);
    const slow = applySpeedFix(lines, own);
    expect(holdsCorner(recoveryOf(slow))).toBe(true);
    expect(cornerSpeedFixes(ctxOf(slow), 1)).toEqual([]);
    expect(cornerSpeedFixes(ctxOf([line("a", 80, 72)]), 0)).toEqual([]);
  });

  it("finds the path into the corner by the order the paths are driven in", () => {
    // The lines listed in another order than they're driven.
    const [a, b] = corner(45);
    const lines = [b, a];
    const ctx = { ...ctxOf(lines), sequence: sequenceOf([a, b]) };
    const own = cornerSpeedFixes(ctx, 0).find((f) => f.field === "maxSpeed");
    expect(own?.lineIndex).toBe(1);
  });
});

describe("Path Statistics", () => {
  it("offers speed limits on the corner warning, never a gain", () => {
    const lines = corner(45);
    const stats = computePathStatistics(
      start,
      lines,
      sequenceOf(lines),
      settings,
    );
    const cut = stats.insights.find((i) => i.message.includes("cuts"))!;
    expect(cut.fixes?.length).toBeGreaterThan(0);
    for (const fix of cut.fixes!) {
      expect(fix).not.toHaveProperty("translationalP");
      expect(fix.field).toMatch(/^(maxSpeed|chainMaxSpeed)$/);
    }
  });
});

class FakeResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

describe("the path card", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    actionRegistry.reset();
    registerCoreUI();
    settingsStore.set(settings);
    selectedLineId.set(null);
    selectedPointId.set(null);
    focusRequest.set(null);
  });
  afterEach(() => timePredictionStore.set(null));

  const show = (lines: Line[]) => {
    startPointStore.set(start);
    sequenceStore.set(sequenceOf(lines));
    timePredictionStore.set(timed(lines));
    const recordChange = vi.fn();
    const view = render(PathLineSectionWrapper, {
      initial: lines,
      idx: 1,
      recordChange,
    } as never);
    return { recordChange, view };
  };

  it("flags the corner on the path it turns onto and slows the path into it", async () => {
    const lines = corner(45);
    const { recordChange } = show(lines);

    expect(screen.getByText("Cuts the corner")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: /Chain Motion/ }));
    expect(
      screen.getByText(/passes \d+\.\d in from the point the paths join/),
    ).toBeTruthy();

    const button = await screen.findByRole(
      "button",
      { name: /^Limit A to \d+ in\/s$/ },
      { timeout: 3000 },
    );
    await fireEvent.click(button);
    expect(recordChange).toHaveBeenCalledWith("Set Max Speed");
    // The robot's tuning is left as it was.
    expect(get(settingsStore).translationalP).toBe(settings.translationalP);
    expect(
      screen.queryByRole("button", { name: /Translational P/ }),
    ).toBeNull();
  });

  it("says so when no speed beats stopping at the corner", async () => {
    show(corner(90));
    expect(screen.getByText("Swings wide")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: /Chain Motion/ }));
    expect(
      await screen.findByText(
        /No speed limit gets it through faster than stopping there\./,
        undefined,
        { timeout: 3000 },
      ),
    ).toBeTruthy();
  });
});
