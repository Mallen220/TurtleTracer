// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Line, Settings, BasePoint, PiecewiseSegment } from "../../types";
import type { PathAnalysis } from "./types";
import { getCurvePoint, linearHeadingSweep, radiansToDegrees } from "../math";
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
}

// The heading fields shared by points, piecewise segments and a chain's
// global heading.
type HeadingSource = {
  heading?: string;
  degrees?: number;
  startDeg?: number;
  endDeg?: number;
  targetX?: number;
  targetY?: number;
  reverse?: boolean;
  segments?: PiecewiseSegment[];
};

function globalHeadingOf(root: Line): HeadingSource {
  return {
    heading: root.globalHeading,
    degrees: root.globalDegrees,
    startDeg: root.globalStartDeg,
    endDeg: root.globalEndDeg,
    targetX: root.globalTargetX,
    targetY: root.globalTargetY,
    reverse: root.globalReverse,
    segments: root.globalSegments,
  };
}

const TANGENT_STEP = 0.005;

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
  } = input;

  const profile: number[] = [currentHeading];
  const samples = analysis.steps.length;
  const curve = [prevPoint, ...line.controlPoints, line.endPoint];
  const source: HeadingSource =
    isGlobalOverride && rootLine ? globalHeadingOf(rootLine) : line.endPoint;

  // A global heading is spread over the whole chain, so progress is
  // measured along the chain rather than along this line.
  const chainLength = chainMeta?.chainTotalLength ?? length;
  const distanceBefore = chainMeta?.distanceBefore ?? 0;
  const chainT = (i: number) =>
    chainLength > 0
      ? (distanceBefore + (i / samples) * length) / chainLength
      : i / samples;

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
    (motionProfile[i] ?? motionProfile.at(-1)) - (motionProfile[i - 1] ?? 0);

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
        h += Math.max(-maxTurn, Math.min(maxTurn, target - h));
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
        if (isGlobalOverride) profile.push(start + sweep * chainT(i));
        else if (isChained) profile.push(turnedByStep(i));
        else profile.push(start + (sweep * i) / samples);
      }
      break;
    }

    case "facingPoint":
      for (let i = 1, h = currentHeading; i <= samples; i++) {
        h = facingHeading(curve, i / samples, source, h);
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
          (i) => (isGlobalOverride ? chainT(i) : i / samples),
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

  return profile;
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
      h += Math.max(-maxTurn, Math.min(maxTurn, target - h));
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
