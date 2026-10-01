// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// The settings a robot profile carries that come from how the robot is tuned,
// as opposed to its size and looks: its path-following gain, braking and how
// long it holds at the end of a path. A profile saved before these existed
// doesn't have them, so applying one leaves the current values alone.
import type { RobotProfile, Settings } from "../types";

export type RobotTuning = Pick<
  Settings,
  "translationalP" | "brakingQuadratic" | "brakingLinear" | "pathSettleTime"
>;

const TUNING_KEYS = [
  "translationalP",
  "brakingQuadratic",
  "brakingLinear",
  "pathSettleTime",
] as const satisfies readonly (keyof RobotTuning)[];

/** The tuning to save in a profile, from the current settings. */
export function tuningOf(settings: Partial<Settings>): RobotTuning {
  const tuning: RobotTuning = {};
  for (const key of TUNING_KEYS) tuning[key] = settings[key];
  return tuning;
}

/**
 * The tuning to use when a profile is applied (or imported): the profile's own,
 * and for anything it doesn't have, the current settings'.
 */
export function tuningFromProfile(
  profile: Partial<RobotProfile>,
  current: Partial<Settings>,
): RobotTuning {
  const tuning: RobotTuning = {};
  for (const key of TUNING_KEYS) {
    const own = profile[key];
    tuning[key] = typeof own === "number" ? own : current[key];
  }
  return tuning;
}
