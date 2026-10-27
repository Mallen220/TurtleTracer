// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Where one chained path hands over to the next, and what the robot does about
// it. `chainRecovery` simulates the swing; this decides where it starts, what
// heading the robot has through it, and keeps the answers for corners that
// haven't changed.
import { getCurvePoint } from "../math";
import type { Line, Point, Settings } from "../../types";
import { handoverDistance } from "./braking";
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
 * The step at which a chained path is handed to the next: once Pedro thinks
 * the robot couldn't stop before the end of the path if it braked from here
 * (`handoverDistance`, which depends on which way the robot faces). A turn too
 * small to matter is driven straight through to the end.
 */
export function handoverStep(
  steps: PathStep[],
  velocities: number[],
  startStep: number,
  settings: Settings,
  turnDegrees: number,
  /** The robot's heading at each step boundary, in degrees. */
  headings: readonly number[] = [],
): number {
  const end = steps.length;
  if (turnDegrees < RECOVERY_MIN_TURN_DEGREES) return end;
  let remaining = steps
    .slice(startStep)
    .reduce((sum, step) => sum + step.deltaLength, 0);
  for (let i = startStep; i < end; i++) {
    const direction = steps[i].direction;
    const heading = headings[i];
    const travelAngle =
      direction === undefined || heading === undefined
        ? 0
        : direction - heading;
    if (remaining <= handoverDistance(velocities[i], travelAngle, settings)) {
      return i;
    }
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
  /** Anything else the answer depends on. */
  extra = "",
): string {
  return [
    brakeAtEnd,
    extra,
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
    settings.pedroQuadraticBrakeForward,
    settings.pedroQuadraticBrakeStrafe,
    settings.pedroLinearBrakeForward,
    settings.pedroLinearBrakeStrafe,
    settings.aVelocity,
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
  /** The fastest `nextLine` is driven, if below the robot's Max Velocity. */
  nextMaxSpeed?: number;
  /** The robot's heading at the handover and the headings `nextLine` wants (see `RecoveryInput`). */
  heading?: { start: number; wanted: readonly number[] };
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
    nextMaxSpeed,
    heading,
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

  const key = cacheKey(
    position,
    velocity,
    nextCurve,
    settings,
    nextIsLast,
    `cap${nextMaxSpeed ?? ""}` +
      (heading
        ? `/h${round(heading.start)}:${heading.wanted.map((h) => Math.round(h * 10)).join(":")}`
        : ""),
  );
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
    maxSpeed: nextMaxSpeed,
    heading,
  });
  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}

/**
 * What the robot does from step `fromStep` of `line`, on the path and going
 * `speed` along it, when it can't follow the bends ahead at that speed: it
 * goes wide and is steered back, until it is on the path again at or past
 * step `releaseStep` (the end of the last bend it can't follow). Steps in the
 * result count from `fromStep`. Null if the line has no direction there.
 */
export function runWideFromStep(input: {
  line: Line;
  prevPoint: Point;
  stepCount: number;
  fromStep: number;
  releaseStep: number;
  speed: number;
  settings: Settings;
  /** Whether no path is chained after `line`, so the robot stops at its end. */
  brakeAtEnd: boolean;
  /** The longest the robot is simulated for, in seconds. */
  maxTime: number;
  /** The fastest `line` is driven, if below the robot's Max Velocity. */
  maxSpeed?: number;
}): RecoveryResult | null {
  const {
    line,
    prevPoint,
    stepCount,
    fromStep,
    releaseStep,
    speed,
    settings,
    brakeAtEnd,
    maxTime,
    maxSpeed,
  } = input;
  const curve = [prevPoint, ...line.controlPoints, line.endPoint];
  const t = fromStep / stepCount;
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
  const path = Array.from({ length: stepCount - fromStep + 1 }, (_, i) =>
    getCurvePoint((fromStep + i) / stepCount, curve),
  );
  const release = releaseStep - fromStep;

  const key = cacheKey(
    position,
    velocity,
    path,
    settings,
    brakeAtEnd,
    `${release}/${Math.round(maxTime)}/cap${maxSpeed ?? ""}`,
  );
  const kept = cache.get(key);
  if (kept) return kept;

  const result = simulateRecovery({
    position,
    velocity,
    path,
    settings,
    brakeAtEnd,
    releaseStep: release,
    maxTime,
    maxSpeed,
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
