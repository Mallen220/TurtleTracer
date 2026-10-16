// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeAll } from "vitest";
import {
  buildPlan,
  buildSnapshot,
  type ProjectState,
} from "../../lib/plugins/host/snapshot";
import { calculatePathTime } from "../../utils/timeCalculator";
import { DEFAULT_SETTINGS } from "../../config/defaults";
import type { Settings } from "../../types";
import { registerCoreUI } from "../../lib/coreRegistrations";

// Waits are timed by their action, as in the app.
beforeAll(registerCoreUI);

const state = (): ProjectState => ({
  startPoint: { x: 10, y: 10, heading: "constant", degrees: 90 },
  lines: [
    {
      id: "a",
      name: "First",
      endPoint: { x: 50, y: 10, heading: "constant", degrees: 90 },
      controlPoints: [],
      color: "#111111",
    },
    {
      id: "b",
      name: "",
      endPoint: { x: 50, y: 60, heading: "linear", startDeg: 90, endDeg: 180 },
      controlPoints: [{ x: 70, y: 30 }],
      color: "#222222",
      isChain: true,
    },
  ],
  shapes: [
    {
      id: "s",
      name: "Wall",
      vertices: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ],
      color: "#f00",
      fillColor: "#f00",
      type: "keep-in",
    },
  ],
  sequence: [
    { kind: "path", lineId: "a" },
    { kind: "wait", id: "w", name: "Pause", durationMs: 500 },
    { kind: "path", lineId: "b" },
    { kind: "plugin", id: "p", type: "x.go", name: "Go", data: { n: 1 } },
  ],
  settings: { ...(DEFAULT_SETTINGS as Settings), visualizerUnits: "metric" },
  extraData: { plugins: { mine: { saved: true }, other: { secret: 1 } } },
  filePath: "/Users/me/autos/Left.turt",
});

describe("buildSnapshot", () => {
  it("copies the project into the API's shapes", () => {
    const snapshot = buildSnapshot(state(), "mine");
    expect(snapshot.fileName).toBe("Left.turt");
    expect(snapshot.start).toEqual({ x: 10, y: 10, heading: 90 });
    expect(snapshot.paths.map((p) => [p.id, p.from, p.to])).toEqual([
      ["a", { x: 10, y: 10 }, { x: 50, y: 10 }],
      ["b", { x: 50, y: 10 }, { x: 50, y: 60 }],
    ]);
    expect(snapshot.paths[1]).toMatchObject({
      chained: true,
      heading: { mode: "linear", startDegrees: 90, endDegrees: 180 },
    });
    expect(snapshot.steps.map((s) => s.kind)).toEqual([
      "path",
      "wait",
      "path",
      "plugin",
    ]);
    expect(snapshot.shapes[0]).toMatchObject({ kind: "keep-in", name: "Wall" });
    expect(snapshot.units).toBe("metric");
  });

  it("gives a plugin only its own saved data", () => {
    expect(buildSnapshot(state(), "mine").data).toEqual({ saved: true });
    expect(buildSnapshot(state(), "nobody").data).toBeNull();
  });

  it("doesn't share objects with the app", () => {
    const s = state();
    const snapshot = buildSnapshot(s, "mine");
    (snapshot.data as any).saved = false;
    const step = snapshot.steps[3] as { data: Record<string, unknown> };
    step.data.n = 99;
    expect(s.extraData.plugins.mine.saved).toBe(true);
    expect((s.sequence[3] as any).data.n).toBe(1);
  });
});

describe("buildPlan", () => {
  it("samples the timed routine and says when each step happens", () => {
    const s = state();
    const prediction = calculatePathTime(
      s.startPoint,
      s.lines,
      s.settings,
      s.sequence,
    );
    const plan = buildPlan(s, prediction);
    expect(plan.duration).toBeCloseTo(prediction.totalTime);
    expect(plan.poses.t[0]).toBe(0);
    expect(plan.poses.t.at(-1)).toBeCloseTo(prediction.totalTime);
    expect(plan.poses.x[0]).toBeCloseTo(10);
    expect(plan.poses.x.at(-1)).toBeCloseTo(50);
    expect(plan.poses.y.at(-1)).toBeCloseTo(60);
    expect(plan.steps.map((step) => step.id)).toEqual(["a", "w", "b"]);
    const wait = plan.steps[1];
    expect(wait.end - wait.start).toBeCloseTo(0.5);
    expect(plan.paths.map((p) => p.id)).toEqual(["a", "b"]);
    expect(plan.paths[1].points).toHaveLength(41);
  });

  it("reports headings counter-clockwise from +x", () => {
    const s = state();
    const prediction = calculatePathTime(
      s.startPoint,
      s.lines,
      s.settings,
      s.sequence,
    );
    expect(buildPlan(s, prediction).poses.heading[0]).toBeCloseTo(90);
  });

  it("works without timing", () => {
    const plan = buildPlan(state(), null);
    expect(plan.duration).toBe(0);
    expect(plan.poses.t).toEqual([0]);
  });
});
