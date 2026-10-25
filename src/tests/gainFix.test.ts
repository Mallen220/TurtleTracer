// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// A stronger Translational P offered for chained corners the robot swings
// wide of, found by trying gains in the simulation.
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
  applyGainFix,
  gainFix,
  HELD_SWING,
  isGainFix,
  motionFixLabel,
  type FixContext,
  type GainFix,
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

const settingsWith = (over: Partial<Settings> = {}) =>
  ({ ...DEFAULT_SETTINGS, maxVelocity: 50, ...over }) as Settings;

const ctxOf = (lines: Line[], settings = settingsWith()): FixContext => ({
  startPoint: start,
  lines,
  sequence: sequenceOf(lines),
  settings,
});

const recoveryWith = (lines: Line[], settings: Settings) =>
  calculatePathTime(start, lines, settings, sequenceOf(lines)).timeline.find(
    (e) => e.type === "recovery",
  )!;

describe("gainFix", () => {
  it("offers a stronger gain that cuts the swing at a sharp corner", () => {
    const lines = corner(90);
    const fix = gainFix(ctxOf(lines), 1)!;
    expect(fix.translationalP).toBeGreaterThan(0.1);
    // No more than three times the current gain.
    expect(fix.translationalP).toBeLessThanOrEqual(0.3);
    expect(fix.swingAfter).toBeLessThan(fix.swingBefore * 0.7);

    // What it says is what the simulation does with it.
    const after = recoveryWith(lines, applyGainFix(settingsWith(), fix));
    expect(after.overshoot).toBeCloseTo(fix.swingAfter, 5);
    expect(after.settled).not.toBe(false);
  });

  it("finds the weakest gain that holds the corner when one does", () => {
    const lines = corner(90);
    const firmer = settingsWith({ translationalP: 0.3 });
    const fix = gainFix(ctxOf(lines, firmer), 1)!;
    expect(fix.swingAfter).toBeLessThanOrEqual(HELD_SWING);
    const weaker = recoveryWith(lines, {
      ...firmer,
      translationalP: fix.translationalP - 0.01,
    });
    expect(weaker.overshoot).toBeGreaterThan(HELD_SWING);
  });

  it("gets a robot that never rejoins back onto the path", () => {
    const lines = corner(90);
    const weak = settingsWith({ translationalP: 0.02 });
    expect(recoveryWith(lines, weak).settled).toBe(false);
    const fix = gainFix(ctxOf(lines, weak), 1)!;
    expect(fix.unsettledBefore).toBe(true);
    expect(recoveryWith(lines, applyGainFix(weak, fix)).settled).not.toBe(
      false,
    );
    expect(motionFixLabel(fix)).toMatch(
      /^Raise Translational P to 0\.\d+ \(gets back on the path, swing \d+\.\d in\)$/,
    );
  });

  it("leaves a corner the robot already holds alone", () => {
    const lines = corner(90);
    expect(gainFix(ctxOf(lines, settingsWith({ translationalP: 1 })), 1)).toBe(
      null,
    );
    // And paths with no chained corner.
    expect(gainFix(ctxOf([line("a", 80, 72)]), 0)).toBeNull();
  });
});

describe("Path Statistics", () => {
  it("puts the fix on the chained corner warning", () => {
    const lines = corner(90);
    const stats = computePathStatistics(
      start,
      lines,
      sequenceOf(lines),
      settingsWith(),
    );
    const sharp = stats.insights.find((i) => i.message.startsWith("Sharp"))!;
    expect(sharp.fixes).toHaveLength(1);
    const fix = sharp.fixes![0] as GainFix;
    expect(isGainFix(fix)).toBe(true);
    expect(motionFixLabel(fix)).toBe(
      `Raise Translational P to ${fix.translationalP} (swing ${fix.swingBefore.toFixed(1)} → ${fix.swingAfter.toFixed(1)} in)`,
    );
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
    settingsStore.set(settingsWith());
    selectedLineId.set(null);
    selectedPointId.set(null);
    focusRequest.set(null);
  });
  afterEach(() => timePredictionStore.set(null));

  it("flags the corner on the path it turns onto and applies the gain", async () => {
    const lines = corner(90);
    startPointStore.set(start);
    sequenceStore.set(sequenceOf(lines));
    timePredictionStore.set(
      calculatePathTime(start, lines, settingsWith(), sequenceOf(lines)),
    );
    const recordChange = vi.fn();
    render(PathLineSectionWrapper, {
      initial: lines,
      idx: 1,
      recordChange,
    } as never);

    expect(screen.getByText("Swings wide")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: /Chain Motion/ }));
    expect(
      screen.getByText(/the robot swings \d+\.\d in past it/),
    ).toBeTruthy();

    const button = await screen.findByRole(
      "button",
      { name: /^Raise Translational P to / },
      { timeout: 3000 },
    );
    const gain = Number(button.textContent!.match(/to (\d+\.\d+)/)![1]);
    await fireEvent.click(button);
    expect(get(settingsStore).translationalP).toBe(gain);
    expect(recordChange).toHaveBeenCalledWith("Set Translational P");
  });
});
