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
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import PathStatisticsDialog from "../lib/components/dialogs/PathStatisticsDialog.svelte";
import PathLineSectionWrapper from "./PathLineSectionWrapper.svelte";
import { computePathStatistics } from "../utils/pathStatistics";
import { calculatePathTime } from "../utils/timeCalculator";
import {
  applySpeedFix,
  chainRootIndex,
  followsBends,
  speedFixes,
  speedFixLabel,
  type FixContext,
  type SpeedFix,
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

const settings = { ...DEFAULT_SETTINGS } as Settings;

// A bend with a radius under an inch, taken at the robot's full speed.
const start = { x: 81, y: 11.4, heading: "constant", degrees: 0 } as Point;
const hairpin = (over: Partial<Line> = {}, id = "h"): Line => ({
  id,
  name: "Hairpin",
  endPoint: { x: 93.7, y: 14.6, heading: "constant", degrees: 0 } as Point,
  controlPoints: [{ x: 105, y: 59.25 }],
  color: "#c05",
  ...over,
});
const pathItem = (l: Line): SequenceItem => ({
  kind: "path",
  lineId: l.id!,
  ...(l.isChain ? { isChain: true } : {}),
});
const sequenceOf = (lines: Line[]) => lines.map(pathItem);
const ctxOf = (lines: Line[]): FixContext => ({
  startPoint: start,
  lines,
  sequence: sequenceOf(lines),
  settings,
});
const runsWide = (lines: Line[], index = 0) =>
  calculatePathTime(start, lines, settings, sequenceOf(lines)).timeline.find(
    (e) => e.type === "travel" && e.lineIndex === index,
  )!.excursion !== undefined;
const noExcursion = followsBends(settings);

describe("fixes that set a speed", () => {
  it("offers a Max Speed for a path on its own, that clears the bend", () => {
    const lines = [hairpin()];
    expect(runsWide(lines)).toBe(true);
    const fixes = speedFixes(ctxOf(lines), 0, noExcursion);
    expect(fixes).toHaveLength(1);
    expect(fixes[0]).toMatchObject({ lineIndex: 0, field: "maxSpeed" });
    expect(runsWide(applySpeedFix(lines, fixes[0]))).toBe(false);
  });

  it("offers the chain a speed too, set on its first path, when the path is chained", () => {
    // A straight lead-in, then the hairpin, chained to it.
    const lead: Line = {
      id: "lead",
      name: "Lead",
      endPoint: { x: 81, y: 11.4, heading: "constant", degrees: 0 } as Point,
      controlPoints: [],
      color: "#000",
    };
    const lines = [lead, hairpin({ isChain: true })];
    const fixes = speedFixes(ctxOf(lines), 1, noExcursion);
    const own = fixes.find((f) => f.field === "maxSpeed");
    const chain = fixes.find((f) => f.field === "chainMaxSpeed");
    // Each is set where it belongs, and each clears the bend.
    expect(own).toMatchObject({ lineIndex: 1 });
    expect(chain).toMatchObject({ lineIndex: 0 });
    for (const fix of fixes) {
      expect(runsWide(applySpeedFix(lines, fix), 1)).toBe(false);
    }
  });

  it("leaves out a chain speed that can't clear it, because the path has a faster one of its own", () => {
    const lead: Line = {
      id: "lead",
      name: "Lead",
      endPoint: { x: 81, y: 11.4, heading: "constant", degrees: 0 } as Point,
      controlPoints: [],
      color: "#000",
    };
    const lines = [lead, hairpin({ isChain: true, maxSpeed: 40 })];
    const fixes = speedFixes(ctxOf(lines), 1, noExcursion);
    expect(fixes.some((f) => f.field === "chainMaxSpeed")).toBe(false);
    expect(fixes.some((f) => f.field === "maxSpeed")).toBe(true);
  });

  it("applies a fix to the path it names, and only that", () => {
    const lines = [hairpin({}, "a"), hairpin({}, "b")];
    const fix: SpeedFix = { lineIndex: 1, field: "chainMaxSpeed", speed: 12 };
    const applied = applySpeedFix(lines, fix);
    expect(applied[1].chainMaxSpeed).toBe(12);
    expect(applied[0].chainMaxSpeed).toBeUndefined();
    expect(lines[1].chainMaxSpeed).toBeUndefined();
  });

  it("finds the first path of a chain", () => {
    const lines = [
      hairpin({}, "a"),
      hairpin({ isChain: true }, "b"),
      hairpin({ isChain: true }, "c"),
      hairpin({}, "d"),
    ];
    expect(chainRootIndex(lines, 2)).toBe(0);
    expect(chainRootIndex(lines, 1)).toBe(0);
    expect(chainRootIndex(lines, 3)).toBe(3);
  });

  it("says plainly what a button will do", () => {
    expect(speedFixLabel({ lineIndex: 0, field: "maxSpeed", speed: 9 })).toBe(
      "Limit this path to 9 in/s",
    );
    expect(
      speedFixLabel({ lineIndex: 0, field: "chainMaxSpeed", speed: 14 }),
    ).toBe("Limit the whole chain to 14 in/s");
  });
});

describe("Path Statistics offers the fix", () => {
  beforeEach(() => {
    // Charts only draw once they have a width.
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      value: 480,
    });
  });

  const open = (props: Record<string, unknown> = {}) => {
    const lines = [hairpin()];
    render(PathStatisticsDialog, {
      isOpen: true,
      startPoint: start,
      lines,
      sequence: sequenceOf(lines),
      settings,
      onClose: vi.fn(),
      onSeek: vi.fn(),
      ...props,
    });
  };
  const showInsights = () =>
    fireEvent.click(screen.getByRole("button", { name: "Insights view" }));

  it("puts the fix on the bend warning", () => {
    const stats = computePathStatistics(
      start,
      [hairpin()],
      sequenceOf([hairpin()]),
      settings,
    );
    const bend = stats.insights.find((i) => i.message.includes("too tight"))!;
    expect(bend.fixes).toHaveLength(1);
    expect(bend.fixes![0].field).toBe("maxSpeed");
    // The speed in the words is the speed on the button.
    expect(bend.message).toContain(`Max Speed to ${bend.fixes![0].speed} in/s`);
    // And warnings with nothing to set have no fixes.
    const plain = stats.insights.filter(
      (i) => !i.message.includes("too tight"),
    );
    expect(plain.every((i) => i.fixes === undefined)).toBe(true);
  });

  it("applies it when the button is pressed, without jumping the timeline", async () => {
    const onApplyFix = vi.fn();
    const onSeek = vi.fn();
    open({ onApplyFix, onSeek });
    await showInsights();
    const button = screen.getByRole("button", {
      name: /^Limit this path to \d+ in\/s$/,
    });
    await fireEvent.click(button);
    expect(onApplyFix).toHaveBeenCalledTimes(1);
    expect(onApplyFix.mock.calls[0][0]).toMatchObject({
      lineIndex: 0,
      field: "maxSpeed",
    });
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("shows no button where nothing can apply it", async () => {
    open();
    await showInsights();
    expect(screen.queryByRole("button", { name: /^Limit / })).toBeNull();
  });

  it("clears the bend warning, and the wheel slip warning too, once the fix is applied", () => {
    const lines = [hairpin()];
    const slips = (ls: Line[]) =>
      computePathStatistics(start, ls, sequenceOf(ls), settings).insights.some(
        (i) => i.message.includes("Risk of Wheel Slip"),
      );
    const before = computePathStatistics(
      start,
      lines,
      sequenceOf(lines),
      settings,
    );
    const fix = before.insights.find((i) => i.fixes)!.fixes![0];
    const fixed = applySpeedFix(lines, fix);
    const after = computePathStatistics(
      start,
      fixed,
      sequenceOf(fixed),
      settings,
    );
    expect(after.insights.some((i) => i.message.includes("too tight"))).toBe(
      false,
    );
    expect(slips(fixed)).toBe(false);

    // A speed that only keeps the robot within a few inches of the path isn't
    // enough: the path still asks more of the wheels than they hold, and the
    // red wheel slip warning would be left behind.
    const loose = speedFixes(ctxOf(lines), 0, (e) => e.excursion === undefined);
    expect(loose[0].speed).toBeGreaterThan(fix.speed);
    expect(slips(applySpeedFix(lines, loose[0]))).toBe(true);
  });

  it("records how much the path asks of the wheels, and the fix keeps it within what they hold", () => {
    const lines = [hairpin()];
    const timed = (ls: Line[]) =>
      calculatePathTime(start, ls, settings, sequenceOf(ls)).timeline.find(
        (e) => e.type === "travel",
      )!;
    expect(timed(lines).peakDemand).toBeGreaterThan(154);
    const [fix] = speedFixes(ctxOf(lines), 0, followsBends(settings));
    expect(timed(applySpeedFix(lines, fix)).peakDemand).toBeLessThanOrEqual(
      0.4 * 386.22,
    );
  });
});

// The path card, on a project the simulation says runs wide.
class FakeResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

describe("the path card offers the fix", () => {
  const mount = (lines: Line[], idx = 0) => {
    const recordChange = vi.fn();
    const view = render(PathLineSectionWrapper, {
      initial: lines,
      idx,
      recordChange,
    } as never);
    return {
      recordChange,
      lines: () =>
        (view.component as never as { getLines: () => Line[] }).getLines(),
    };
  };
  const time = (lines: Line[]) => {
    startPointStore.set(start);
    sequenceStore.set(sequenceOf(lines));
    timePredictionStore.set(
      calculatePathTime(start, lines, settings, sequenceOf(lines)),
    );
  };

  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    actionRegistry.reset();
    registerCoreUI();
    settingsStore.set({ ...settings } as never);
    selectedLineId.set(null);
    selectedPointId.set(null);
    focusRequest.set(null);
  });
  afterEach(() => timePredictionStore.set(null));

  const chainMotion = () =>
    screen.getByRole("button", { name: /Chain Motion/ });

  it("flags the problem on the closed section, where it can't be missed", () => {
    const lines = [hairpin()];
    time(lines);
    mount(lines);
    expect(screen.getByText("Runs wide")).toBeTruthy();
  });

  it("says nothing when the path is fine", () => {
    const lines = [hairpin({ maxSpeed: 8 })];
    time(lines);
    mount(lines);
    expect(screen.queryByText("Runs wide")).toBeNull();
  });

  it("explains it and offers the fix when opened, and applies it on a click", async () => {
    const lines = [hairpin()];
    time(lines);
    const t = mount(lines);
    await fireEvent.click(chainMotion());
    expect(screen.getByText(/runs \d+\.\d in wide of a bend/)).toBeTruthy();

    // The fix is worked out a moment after the card settles.
    const button = await screen.findByRole(
      "button",
      { name: /^Limit this path to \d+ in\/s$/ },
      { timeout: 3000 },
    );
    const speed = Number(button.textContent!.match(/(\d+) in\/s/)![1]);
    await fireEvent.click(button);

    expect(t.lines()[0].maxSpeed).toBe(speed);
    expect(t.recordChange).toHaveBeenCalledWith("Set Max Speed");
    // The new speed would clear it.
    expect(
      runsWide(
        applySpeedFix(lines, { lineIndex: 0, field: "maxSpeed", speed }),
      ),
    ).toBe(false);
  });

  it("can't be pressed while the path is locked", async () => {
    const lines = [hairpin({ locked: true })];
    time(lines);
    mount(lines);
    await fireEvent.click(chainMotion());
    const button = await screen.findByRole(
      "button",
      { name: /^Limit this path to/ },
      { timeout: 3000 },
    );
    expect(button).toBeDisabled();
  });

  it("says so when no speed limit would fix it", async () => {
    // Held to 5 in/s or more, this robot still can't hold the bend.
    settingsStore.set({
      ...settings,
      kFriction: 0,
      maxAcceleration: 1,
    } as never);
    const lines = [hairpin()];
    const tuned = { ...settings, kFriction: 0, maxAcceleration: 1 } as Settings;
    startPointStore.set(start);
    sequenceStore.set(sequenceOf(lines));
    timePredictionStore.set(
      calculatePathTime(start, lines, tuned, sequenceOf(lines)),
    );
    mount(lines);
    await fireEvent.click(chainMotion());
    await waitFor(
      () => expect(screen.getByText(/No speed limit fixes it/)).toBeTruthy(),
      { timeout: 3000 },
    );
    expect(screen.queryByRole("button", { name: /^Limit / })).toBeNull();
  });
});
