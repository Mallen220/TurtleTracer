// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeAll } from "vitest";
import {
  buildPlan,
  buildSnapshot,
  type ProjectState,
} from "../../lib/plugins/host/snapshot";
import { calculatePathTime } from "../../utils/timeCalculator";
import {
  DEFAULT_ROBOT_LENGTH,
  DEFAULT_ROBOT_WIDTH,
  DEFAULT_SETTINGS,
} from "../../config/defaults";
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

  it("describes every kind of heading and step, with defaults for what's missing", () => {
    const s = state();
    s.lines = [
      {
        endPoint: {
          x: 20,
          y: 20,
          heading: "facingPoint",
          targetX: 1,
          targetY: 2,
        },
        controlPoints: [],
        color: "#333333",
      },
      {
        id: "c",
        startPoint: { x: 5, y: 5, heading: "tangential", reverse: false },
        endPoint: { x: 30, y: 30, heading: "tangential", reverse: true },
        controlPoints: [],
        color: "#444444",
      },
      {
        id: "d",
        endPoint: { x: 40, y: 40, heading: "piecewise", segments: [] },
        controlPoints: [],
        color: "#555555",
      },
    ] as unknown as ProjectState["lines"];
    s.sequence = [
      { kind: "path", lineId: undefined as unknown as string },
      { kind: "path", lineId: "c" },
      { kind: "path", lineId: "d" },
      { kind: "path", lineId: "gone" },
      {
        kind: "rotate",
        id: "r",
        degrees: 45,
      } as ProjectState["sequence"][number],
      {
        kind: "macro",
        id: "m",
        filePath: "x.turt",
      } as ProjectState["sequence"][number],
      {
        kind: "wait",
        id: "w",
        durationMs: 100,
      } as ProjectState["sequence"][number],
      {
        kind: "plugin",
        id: "p",
        type: "x.go",
        data: {},
      } as ProjectState["sequence"][number],
    ];
    s.shapes = [
      { id: "o", vertices: [], color: "#000", fillColor: "#000" },
    ] as unknown as ProjectState["shapes"];
    s.settings = {
      ...s.settings,
      rLength: 0,
      rWidth: 0,
      maxDeceleration: undefined,
      robotDriveType: undefined,
      fieldWidth: undefined,
      fieldHeight: undefined,
      visualizerUnits: undefined,
    } as unknown as Settings;
    s.extraData = undefined as unknown as ProjectState["extraData"];
    s.filePath = null;

    const snapshot = buildSnapshot(s, "mine");
    expect(
      snapshot.paths.map((p) => [p.id, p.name, p.from, p.heading]),
    ).toEqual([
      ["", "", { x: 10, y: 10 }, { mode: "facingPoint", x: 1, y: 2 }],
      ["c", "", { x: 5, y: 5 }, { mode: "tangential", reverse: true }],
      ["d", "", { x: 30, y: 30 }, { mode: "piecewise" }],
    ]);
    expect(snapshot.steps.slice(4)).toEqual([
      { kind: "rotate", id: "r", name: "", degrees: 45 },
      { kind: "macro", id: "m", name: "" },
      { kind: "wait", id: "w", name: "", durationMs: 100 },
      { kind: "plugin", id: "p", type: "x.go", name: "", data: {} },
    ]);
    expect(snapshot.shapes[0]).toMatchObject({ name: "", kind: "obstacle" });
    expect(snapshot.robot).toMatchObject({
      length: DEFAULT_ROBOT_LENGTH,
      width: DEFAULT_ROBOT_WIDTH,
      maxDeceleration: s.settings.maxAcceleration,
      driveType: "holonomic",
    });
    expect(snapshot.field).toEqual({ width: 144, height: 144 });
    expect(snapshot.units).toBe("imperial");
    expect(snapshot.fileName).toBeNull();
    expect(snapshot.data).toBeNull();
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
