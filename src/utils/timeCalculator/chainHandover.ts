// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Where one chained path hands over to the next, and what the robot does about
// it. `chainRecovery` simulates the swing; this decides where it starts, what
// heading the robot has through it, and keeps the answers for corners that
// haven't changed.
import { getCurvePoint } from "../math";
import type { Line, Point, Settings } from "../../types";
import { brakingDistance } from "./braking";
import { calculateEndHeadingAndRotation, hasGlobalHeading } from "./chainMeta";
import type { ChainInfo } from "./chainMeta";
import {
  RECOVERY_MIN_TURN_DEGREES,
  simulateRecovery,
  type RecoveryResult,
} from "./chainRecovery";
import { buildHeadingProfile, turnToward } from "./headingProfile";
import { analyzePathSegment, unwrapAngle } from "./segmentAnalyzer";
import type { PathStep } from "./types";

/** How many steps a chained path is split into (see `analyzePathSegment`). */
export const CHAIN_STEPS = 100;

/**
 * The step at which a chained path is handed to the next: once the robot
 * couldn't stop before the end of the path if it braked from here. A turn too
 * small to matter is driven straight through to the end.
 */
export function handoverStep(
  steps: PathStep[],
  velocities: number[],
  startStep: number,
  settings: Settings,
  turnDegrees: number,
): number {
  const end = steps.length;
  // v2 only moves on once the path is (nearly) finished.
  if (
    turnDegrees < RECOVERY_MIN_TURN_DEGREES ||
    settings.pedroVersion === "v2"
  ) {
    return end;
  }
  let remaining = steps
    .slice(startStep)
    .reduce((sum, step) => sum + step.deltaLength, 0);
  for (let i = startStep; i < end; i++) {
    if (remaining <= brakingDistance(velocities[i], settings)) return i;
    remaining -= steps[i].deltaLength;
  }
  return end;
}

// --- Keeping answers for corners that haven't changed ---

const CACHE_SIZE = 256;
const cache = new Map<string, RecoveryResult>();

/** Forgets every kept answer (for tests that must not share them). */
export function clearRecoveryCache() {
  cache.clear();
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** What a recovery depends on, as a string. */
function cacheKey(
  position: { x: number; y: number },
  velocity: { x: number; y: number },
  path: { x: number; y: number }[],
  settings: Settings,
  brakeAtEnd: boolean,
): string {
  return [
    brakeAtEnd,
    round(position.x),
    round(position.y),
    round(velocity.x),
    round(velocity.y),
    settings.maxVelocity,
    settings.maxAcceleration,
    settings.maxDeceleration,
    settings.translationalP,
    settings.brakingQuadratic,
    settings.brakingLinear,
    ...path.flatMap((p) => [round(p.x), round(p.y)]),
  ].join(",");
}

/**
 * What the robot does after `line` is handed over to `nextLine` at step
 * `endStep`: still moving along `line`, it is steered onto `nextLine`. Moving
 * one path leaves most chained corners as they were, so each answer is kept
 * (and shared: it must not be changed). Null if `line` has no direction there.
 */
export function recoverFromHandover(input: {
  line: Line;
  prevPoint: Point;
  nextLine: Line;
  stepCount: number;
  endStep: number;
  speed: number;
  settings: Settings;
  /** Whether no path is chained after `nextLine`, so the robot stops at its end. */
  nextIsLast: boolean;
}): RecoveryResult | null {
  const {
    line,
    prevPoint,
    nextLine,
    stepCount,
    endStep,
    speed,
    settings,
    nextIsLast,
  } = input;
  const curve = [prevPoint, ...line.controlPoints, line.endPoint];
  const t = endStep / stepCount;
  const around = 0.5 / stepCount;
  const before = getCurvePoint(Math.max(0, t - around), curve);
  const after = getCurvePoint(Math.min(1, t + around), curve);
  const length = Math.hypot(after.x - before.x, after.y - before.y);
  if (length < 1e-9) return null;

  const position = getCurvePoint(t, curve);
  const velocity = {
    x: ((after.x - before.x) / length) * speed,
    y: ((after.y - before.y) / length) * speed,
  };
  const nextCurve = [
    line.endPoint,
    ...nextLine.controlPoints,
    nextLine.endPoint,
  ];

  const key = cacheKey(position, velocity, nextCurve, settings, nextIsLast);
  const kept = cache.get(key);
  if (kept) return kept;

  const result = simulateRecovery({
    position,
    velocity,
    path: Array.from({ length: CHAIN_STEPS + 1 }, (_, i) =>
      getCurvePoint(i / CHAIN_STEPS, nextCurve),
    ),
    settings,
    brakeAtEnd: nextIsLast,
  });
  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}

// --- The robot's heading through a recovery ---

/**
 * The heading the robot wants at each step of `line`, ignoring how long it
 * takes to turn there: where the heading would be if it could turn instantly.
 * `line` is chained to the path before it.
 */
export function idealHeadings(input: {
  line: Line;
  prevPoint: Point;
  chainMeta: ChainInfo | undefined;
  currentHeading: number;
  settings: Settings;
}): number[] {
  const { line, prevPoint, chainMeta, currentHeading, settings } = input;
  const rootLine = chainMeta?.rootLine;
  const analysis = analyzePathSegment(
    prevPoint,
    line.controlPoints,
    line.endPoint,
    CHAIN_STEPS,
    currentHeading,
    CHAIN_STEPS,
  );
  const { endHeading } = calculateEndHeadingAndRotation(
    line,
    prevPoint,
    rootLine,
    chainMeta,
    currentHeading,
    analysis.length,
    true,
    analysis,
  );
  return buildHeadingProfile({
    line,
    prevPoint,
    rootLine,
    chainMeta,
    currentHeading,
    endHeading,
    physicalRotationTime: 0,
    analysis,
    motionProfile: [],
    settings,
    length: analysis.length,
    isChained: true,
    isGlobalOverride: hasGlobalHeading(rootLine),
    ignoreTurnRate: true,
  });
}

/**
 * The robot's heading at each sample of a recovery, as it turns toward the
 * heading wanted where it is along the next path (`along`, in steps), no
 * faster than it can turn.
 */
export function headingsAlong(
  times: readonly number[],
  along: readonly number[],
  wanted: readonly number[],
  startHeading: number,
  settings: Settings,
): number[] {
  const maxTurnRate = (settings.aVelocity * 180) / Math.PI;
  const headings = [startHeading];
  let heading = startHeading;
  for (let i = 1; i < times.length; i++) {
    const dt = times[i] - times[i - 1];
    // Step 0 only holds the heading the path is entered with.
    const step = Math.min(wanted.length - 1, Math.max(1, Math.round(along[i])));
    const target = unwrapAngle(wanted[step], heading);
    const limit = maxTurnRate * dt;
    heading = turnToward(heading, target, limit);
    headings.push(heading);
  }
  return headings;
}
