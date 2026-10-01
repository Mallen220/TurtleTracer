// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Line, Settings, BasePoint, PiecewiseSegment } from "../../types";
import type { PathAnalysis } from "./types";
import {
  getCurvePoint,
  getEffectiveHeadingSource,
  linearHeadingSweep,
  radiansToDegrees,
  type HeadingSource,
} from "../math";
import { calculateRotationTime } from "./rotation";
import { unwrapAngle } from "./segmentAnalyzer";

export interface HeadingProfileInput {
  line: Line;
  prevPoint: BasePoint;
  /** First line of the chain this line belongs to. */
  rootLine: Line | undefined;
  /** Where this line sits within its chain, if it's chained. */
  chainMeta?: { chainTotalLength: number; distanceBefore: number };
  /** Heading at the start of the line. */
  currentHeading: number;
  /** Heading the line should end at (used for chained lines). */
  endHeading: number;
  /** Time needed to turn from currentHeading to endHeading. */
  physicalRotationTime: number;
  analysis: PathAnalysis;
  /** Cumulative time at each analysis step. */
  motionProfile: number[];
  settings: Settings;
  /** Length of this line, in inches. */
  length: number;
  isChained: boolean;
  /** Whether the chain's heading applies instead of the line's own. */
  isGlobalOverride: boolean;
  /**
   * Gives the heading wanted at each step as if the robot could turn
   * instantly, instead of limiting it by the robot's turn rate and the time
   * each step takes.
   */
  ignoreTurnRate?: boolean;
}

const TANGENT_STEP = 0.005;

/** `from` moved toward `target`, by at most `limit` degrees. */
export function turnToward(
  from: number,
  target: number,
  limit: number,
): number {
  return from + Math.max(-limit, Math.min(limit, target - from));
}

/** Direction of travel at t (unwrapped near `current`), or null if stationary. */
function tangentHeading(
  curve: BasePoint[],
  t: number,
  reverse: boolean | undefined,
  current: number,
): number | null {
  const a = getCurvePoint(Math.max(0, t - TANGENT_STEP), curve);
  const b = getCurvePoint(Math.min(1, t + TANGENT_STEP), curve);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return null;
  const angle = radiansToDegrees(Math.atan2(dy, dx));
  return unwrapAngle(reverse ? angle + 180 : angle, current);
}

/** Heading that points from the curve at t towards the target. */
function facingHeading(
  curve: BasePoint[],
  t: number,
  source: HeadingSource,
  current: number,
): number {
  const pos = getCurvePoint(t, curve);
  const angle = radiansToDegrees(
    Math.atan2((source.targetY || 0) - pos.y, (source.targetX || 0) - pos.x),
  );
  return unwrapAngle(source.reverse ? angle + 180 : angle, current);
}

/**
 * The robot's heading at each step of the motion profile along a line,
 * unwrapped so consecutive values never jump by more than 180 degrees.
 */
export function buildHeadingProfile(input: HeadingProfileInput): number[] {
  const {
    line,
    prevPoint,
    rootLine,
    chainMeta,
    currentHeading,
    endHeading,
    physicalRotationTime,
    analysis,
    motionProfile,
    settings,
    length,
    isChained,
    isGlobalOverride,
    ignoreTurnRate,
  } = input;

  const profile: number[] = [currentHeading];
  const samples = analysis.steps.length;
  const curve = [prevPoint, ...line.controlPoints, line.endPoint];
  const { source } = getEffectiveHeadingSource(line, rootLine);

  // How far along the line step i is. Pedro v3 measures this by distance
  // travelled; v2 by the curve parameter, which is even across the steps.
  const arc = progressByDistance(analysis, settings);
  const along = (i: number) => (arc ? arc[i] : i / samples);

  // A global heading is spread over the whole chain, so progress is
  // measured along the chain rather than along this line.
  const chainLength = chainMeta?.chainTotalLength ?? length;
  const distanceBefore = chainMeta?.distanceBefore ?? 0;
  const chainT = (i: number) =>
    chainLength > 0
      ? (distanceBefore + along(i) * length) / chainLength
      : along(i);

  // Chained lines turn from the start heading to the end heading as fast as
  // the robot can.
  const turnedByStep = (i: number) => {
    const ratio =
      physicalRotationTime > 0
        ? Math.min(1, motionProfile[i] / physicalRotationTime)
        : 1;
    return currentHeading + (endHeading - currentHeading) * ratio;
  };

  const maxTurnRate = radiansToDegrees(Math.max(settings.aVelocity, 0.001));
  const stepDuration = (i: number) =>
    ignoreTurnRate
      ? Infinity
      : (motionProfile[i] ?? motionProfile.at(-1)) -
        (motionProfile[i - 1] ?? 0);

  switch (source.heading) {
    case "tangential":
      if (!isChained) {
        for (const step of analysis.steps) profile.push(step.heading);
        break;
      }
      // Follow the direction of travel, limited by the maximum turn rate.
      for (let i = 1, h = currentHeading; i <= samples; i++) {
        const target =
          tangentHeading(curve, i / samples, source.reverse, h) ?? h;
        const maxTurn = maxTurnRate * stepDuration(i);
        h = turnToward(h, target, maxTurn);
        profile.push(h);
      }
      break;

    case "constant": {
      const degrees = (source.degrees || 0) + (source.reverse ? 180 : 0);
      const target = unwrapAngle(degrees, currentHeading);
      for (let i = 1; i <= samples; i++) {
        profile.push(isChained ? turnedByStep(i) : target);
      }
      break;
    }

    case "linear": {
      const start = unwrapAngle(source.startDeg || 0, currentHeading);
      const sweep = linearHeadingSweep(
        source.startDeg || 0,
        source.endDeg || 0,
        source.reverse,
      );
      for (let i = 1; i <= samples; i++) {
        // The sweep follows the progress along the path; a robot that isn't
        // facing it yet catches up as fast as it can (see `limitTurnRate`).
        profile.push(start + sweep * (isGlobalOverride ? chainT(i) : along(i)));
      }
      break;
    }

    case "facingPoint":
      // The robot turns to face the point as fast as it can, which is slower
      // than the direction to the point can change as the robot passes it.
      for (let i = 1, h = currentHeading; i <= samples; i++) {
        const target = facingHeading(curve, i / samples, source, h);
        const maxTurn = maxTurnRate * stepDuration(i);
        h = turnToward(h, target, maxTurn);
        profile.push(h);
      }
      break;

    case "piecewise":
      profile.push(
        ...piecewiseProfile(
          source.segments ?? [],
          curve,
          samples,
          currentHeading,
          (i) => (isGlobalOverride ? chainT(i) : along(i)),
          stepDuration,
          maxTurnRate,
          settings,
        ),
      );
      break;
  }

  // Unwrap so consecutive headings never differ by more than 180 degrees.
  for (let k = 1; k < profile.length; k++) {
    let curr = profile[k];
    while (curr - profile[k - 1] > 180) curr -= 360;
    while (curr - profile[k - 1] < -180) curr += 360;
    profile[k] = curr;
  }

  return ignoreTurnRate
    ? profile
    : limitTurnRate(profile, motionProfile, maxTurnRate);
}

/**
 * The heading the robot really has when the heading it wants changes faster
 * than it can turn (across a cusp, say, or the loop of a path that curves
 * back on itself): it turns at its top rate and catches up when it can.
 */
function limitTurnRate(
  wanted: number[],
  times: number[],
  maxTurnRate: number,
): number[] {
  const limited = [wanted[0]];
  for (let i = 1; i < wanted.length; i++) {
    const dt = Math.max(0, (times[i] ?? times.at(-1)!) - (times[i - 1] ?? 0));
    const most = maxTurnRate * dt;
    limited.push(turnToward(limited[i - 1], wanted[i], most));
  }
  return limited;
}

/** Fraction of the line's length covered by each step boundary, or null for v2. */
function progressByDistance(
  analysis: PathAnalysis,
  settings: Settings,
): number[] | null {
  if (settings.pedroVersion === "v2") return null;
  const total = analysis.steps.reduce((sum, step) => sum + step.deltaLength, 0);
  if (!(total > 0)) return null;
  const progress = [0];
  let covered = 0;
  for (const step of analysis.steps) {
    covered += step.deltaLength;
    progress.push(covered / total);
  }
  return progress;
}

/**
 * Headings for a piecewise heading: each segment covers part of the path
 * (by t), and the robot turns towards each segment's heading as fast as it
 * physically can.
 */
function piecewiseProfile(
  segments: PiecewiseSegment[],
  curve: BasePoint[],
  samples: number,
  startHeading: number,
  tAtStep: (i: number) => number,
  stepDuration: (i: number) => number,
  maxTurnRate: number,
  settings: Settings,
): number[] {
  const headings: number[] = [];
  let h = startHeading;

  for (let i = 1; i <= samples; i++) {
    const localT = i / samples;
    const t = tAtStep(i);
    const seg = segments.find((s) => t >= s.tStart && t <= s.tEnd);
    if (!seg) {
      headings.push(h);
      continue;
    }

    let target = h;
    switch (seg.heading) {
      case "constant":
        target = unwrapAngle((seg.degrees ?? 0) + (seg.reverse ? 180 : 0), h);
        break;
      case "tangential":
        target = tangentHeading(curve, localT, seg.reverse, h) ?? h;
        break;
      case "linear": {
        const span = seg.tEnd - seg.tStart;
        const segT =
          span > 0 ? Math.max(0, Math.min(1, (t - seg.tStart) / span)) : 0;
        const start = seg.startDeg ?? 0;
        target =
          unwrapAngle(start, h) +
          linearHeadingSweep(start, seg.endDeg ?? 0, seg.reverse) * segT;
        break;
      }
      case "facingPoint":
        target = facingHeading(curve, localT, seg, h);
        break;
    }

    const dt = stepDuration(i);
    if (seg.heading === "tangential") {
      const maxTurn = maxTurnRate * dt;
      h = turnToward(h, target, maxTurn);
    } else {
      // Close as much of the gap as the robot can in this step.
      const turnTime = calculateRotationTime(Math.abs(target - h), settings);
      h =
        turnTime > 0 && dt < turnTime
          ? h + (target - h) * Math.min(1, dt / turnTime)
          : target;
    }
    headings.push(h);
  }
  return headings;
}
