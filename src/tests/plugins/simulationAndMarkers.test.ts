// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, afterEach } from "vitest";
import { get } from "svelte/store";
import {
  measureDeviation,
  selectSimulator,
  setSimulationMode,
  simulationStore,
} from "../../lib/simulation";
import { simulatorRegistry } from "../../lib/registries";
import { timePredictionStore } from "../../lib/projectStore";
import { positionAt } from "../../lib/plugins/host/markerResolver";

afterEach(() => {
  selectSimulator(null);
  simulatorRegistry.reset();
  vi.useRealTimers();
});

describe("measureDeviation", () => {
  it("finds the largest and average gap from the plan", () => {
    const poses = { t: [0, 1], x: [0, 0], y: [0, 10], heading: [0, 0] };
    const result = measureDeviation(poses, () => ({ x: 0, y: 0 }));
    expect(result.max).toBeCloseTo(10, 0);
    expect(result.worstTime).toBeCloseTo(1, 0);
    expect(result.mean).toBeCloseTo(5, 0);
  });
});

describe("simulation", () => {
  it("runs the chosen simulator after a change, and keeps its result", async () => {
    vi.useFakeTimers();
    const simulate = vi.fn(async () => ({
      poses: { t: [0, 1], x: [0, 1], y: [0, 1], heading: [0, 0] },
      notes: [{ time: 0.5, text: "slip" }],
    }));
    simulatorRegistry.register({
      id: "p.sim",
      owner: "p",
      label: "Sim",
      simulate,
    });
    selectSimulator("p.sim", () => ({ x: 0, y: 0 }));
    timePredictionStore.set({
      totalTime: 1,
      segmentTimes: [],
      totalDistance: 0,
      timeline: [],
    });
    await vi.advanceTimersByTimeAsync(350);
    expect(simulate).toHaveBeenCalled();
    const state = get(simulationStore);
    expect(state).toMatchObject({ simulatorId: "p.sim", status: "done" });
    expect(state.result?.notes[0].text).toBe("slip");
    expect(state.deviation?.max).toBeGreaterThan(0);
    setSimulationMode("drive");
    expect(get(simulationStore).mode).toBe("drive");
  });

  it("says when a simulation fails", async () => {
    vi.useFakeTimers();
    simulatorRegistry.register({
      id: "p.bad",
      label: "Bad",
      simulate: async () => {
        throw new Error("diverged");
      },
    });
    selectSimulator("p.bad");
    await vi.advanceTimersByTimeAsync(350);
    expect(get(simulationStore)).toMatchObject({
      status: "failed",
      error: "diverged",
    });
  });

  it("turns itself off when the simulator goes away", async () => {
    simulatorRegistry.register({
      id: "p.gone",
      label: "Gone",
      simulate: vi.fn(),
    });
    selectSimulator("p.gone");
    simulatorRegistry.unregister("p.gone");
    await Promise.resolve();
    expect(get(simulationStore).simulatorId).toBeNull();
  });
});

describe("plugin marker positions", () => {
  it("is the share of the time for steps that don't drive a curve", () => {
    expect(positionAt(1, 2, 6, undefined)).toBe(0.25);
    expect(positionAt(9, 2, 6, undefined)).toBe(1);
    expect(positionAt(1, 2, 2, undefined)).toBe(0);
  });

  it("is the point along the curve for a path", () => {
    // Steps reached at 0, 1, 3 s: halfway through the curve at 1 s.
    const travel = { startTime: 2, motionProfile: [0, 1, 3] } as any;
    expect(positionAt(1, 2, 5, travel)).toBeCloseTo(0.5);
  });
});
