// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// A small, fixed example of what the translational P gain does: a robot at top
// speed meets a path that turns a right angle, swings off it, and is steered
// back. Shown in the settings so a team can see the effect of the gain they set.
import type { Settings } from "../../types";
import { brakingDistance } from "./braking";
import { simulateRecovery } from "./chainRecovery";

/** Where the two paths join, and how long the second one is, in inches. */
const JOINT = { x: 60, y: 10 };
const NEXT_LENGTH = 90;
const STEPS = 100;

export type GainVerdict = "weak" | "good";

export interface GainPreview {
  /** The route the robot takes, from where it is handed over. */
  trace: { x: number; y: number }[];
  /** The path it is steered onto. */
  path: { x: number; y: number }[];
  joint: { x: number; y: number };
  /** Where the robot is handed over to the second path. */
  from: { x: number; y: number };
  overshoot: number;
  duration: number;
  settled: boolean;
  verdict: GainVerdict;
}

/** How the example comes out with the robot's current settings. */
export function previewTranslationalGain(settings: Settings): GainPreview {
  const speed = settings.maxVelocity || 40;
  const stop = brakingDistance(speed, settings);
  const from = { x: JOINT.x - stop, y: JOINT.y };
  const path = Array.from({ length: STEPS + 1 }, (_, i) => ({
    x: JOINT.x,
    y: JOINT.y + (NEXT_LENGTH * i) / STEPS,
  }));
  const run = simulateRecovery({
    position: from,
    velocity: { x: speed, y: 0 },
    path,
    settings,
  });

  // Not getting back onto the path, or swinging very wide, is a weak correction.
  const verdict: GainVerdict =
    !run.settled || run.overshoot > WIDE_SWING * Math.max(1, speed / 40)
      ? "weak"
      : "good";

  return {
    trace: run.x.map((x, i) => ({ x, y: run.y[i] })),
    path,
    joint: JOINT,
    from,
    overshoot: run.overshoot,
    duration: run.duration,
    settled: run.settled,
    verdict,
  };
}

/** Swinging wider than this (inches, at 40 in/s) is called a weak correction. */
const WIDE_SWING = 12;
