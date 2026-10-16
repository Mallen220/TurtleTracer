// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Simulating the robot. Simulators come from plugins (simulatorRegistry);
// when the user picks one, it's run again a moment after each change, and
// its result is drawn on the field as a ghost robot, or followed by the
// robot itself during playback.
import { derived, get, writable } from "svelte/store";
import debounce from "lodash/debounce";
import type { PoseTrack, TimePrediction } from "../types";
import { simulatorRegistry, type SimulationNote } from "./registries";
import { timePredictionStore } from "./projectStore";
import { poseOnTrack } from "../utils/poseTrack";

export interface SimulationState {
  /** The chosen simulator, or null for none. */
  simulatorId: string | null;
  /** Draw a ghost robot, or have the robot follow the simulation. */
  mode: "ghost" | "drive";
  status: "idle" | "running" | "done" | "failed";
  result: { poses: PoseTrack; notes: SimulationNote[] } | null;
  error?: string;
  /** How far the simulated robot strays from the plan, in inches. */
  deviation?: { max: number; mean: number; worstTime: number };
}

const IDLE: SimulationState = {
  simulatorId: null,
  mode: "ghost",
  status: "idle",
  result: null,
};

export const simulationStore = writable<SimulationState>(IDLE);

/** The simulated poses to draw or follow, if there are any. */
export const simulatedPoses = derived(
  simulationStore,
  ($s) => $s.result?.poses ?? null,
);

/**
 * How far the simulation strays from the plan, compared every 0.1 s.
 * `plannedAt` gives the planned position at a time.
 */
export function measureDeviation(
  poses: PoseTrack,
  plannedAt: (time: number) => { x: number; y: number } | null,
) {
  const end = poses.t.at(-1) ?? 0;
  let max = 0;
  let total = 0;
  let count = 0;
  let worstTime = 0;
  for (let t = 0; t <= end; t += 0.1) {
    const simulated = poseOnTrack(poses, t);
    const planned = plannedAt(t);
    if (!simulated || !planned) continue;
    const distance = Math.hypot(
      simulated.x - planned.x,
      simulated.y - planned.y,
    );
    total += distance;
    count += 1;
    if (distance > max) {
      max = distance;
      worstTime = t;
    }
  }
  return { max, mean: count ? total / count : 0, worstTime };
}

let run = 0;
let plannedAt: ((time: number) => { x: number; y: number } | null) | null =
  null;

/** Runs the chosen simulator now. Results of older runs are ignored. */
async function simulate() {
  const { simulatorId } = get(simulationStore);
  const simulator = simulatorRegistry
    .getAll()
    .find((s) => s.id === simulatorId);
  if (!simulator) return;
  const thisRun = ++run;
  simulationStore.update((s) => ({
    ...s,
    status: "running",
    error: undefined,
  }));
  try {
    const { poses, notes = [] } = await simulator.simulate();
    if (thisRun !== run) return;
    simulationStore.update((s) => ({
      ...s,
      status: "done",
      result: { poses, notes },
      deviation: plannedAt ? measureDeviation(poses, plannedAt) : undefined,
    }));
  } catch (error) {
    if (thisRun !== run) return;
    simulationStore.update((s) => ({
      ...s,
      status: "failed",
      error: String((error as Error)?.message ?? error),
    }));
  }
}

const simulateSoon = debounce(simulate, 300);
let stop: (() => void) | null = null;

/**
 * Picks the simulator to run (null for none). `planned` gives the planned
 * position at a time, to measure how far the simulation strays.
 */
export function selectSimulator(
  simulatorId: string | null,
  planned?: (
    prediction: TimePrediction,
    time: number,
  ) => { x: number; y: number } | null,
) {
  run++;
  simulateSoon.cancel();
  stop?.();
  stop = null;
  simulationStore.update((s) => ({ ...IDLE, mode: s.mode, simulatorId }));
  if (!simulatorId) return;

  const unsubscribers = [
    timePredictionStore.subscribe((prediction) => {
      plannedAt =
        prediction && planned ? (time) => planned(prediction, time) : null;
      void simulateSoon();
    }),
    // Stop if the simulator goes away (its plugin was turned off).
    simulatorRegistry.subscribe((simulators) => {
      if (!simulators.some((s) => s.id === simulatorId)) {
        queueMicrotask(() => selectSimulator(null));
      }
    }),
  ];
  stop = () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}

export function setSimulationMode(mode: SimulationState["mode"]) {
  simulationStore.update((s) => ({ ...s, mode }));
}
