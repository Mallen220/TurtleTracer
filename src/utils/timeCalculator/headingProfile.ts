// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type {
  Line,
  Settings,
  BasePoint,
  PiecewiseSegment,
  PiecewiseShortfall,
} from "../../types";
import type { PathAnalysis } from "./types";
import {
  getCurvePoint,
  getEffectiveHeadingSource,
  linearHeadingSweep,
  radiansToDegrees,
  type HeadingSource,
} from "../math";
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

/** What the heading calculations of one line share. */
interface ProfileContext {
  input: HeadingProfileInput;
  samples: number;
  /** The control points of the line, for working out where it points. */
  curve: BasePoint[];
  /** The fastest the robot turns, in degrees per second. */
  maxTurnRate: number;
  /**
   * How far along the line step i is, by distance travelled, as Pedro 3
   * measures it.
   */
  along: (i: number) => number;
  /**
   * How far along its path step i is for headings that follow it: along the
   * whole chain when a global heading is spread over it, else along the line.
   */
  progress: (i: number) => number;
  /** How long step i takes, or infinity where the turn rate is ignored. */
  stepDuration: (i: number) => number;
}

function profileContext(input: HeadingProfileInput): ProfileContext {
  const {
    line,
    prevPoint,
    chainMeta,
    analysis,
    motionProfile,
    settings,
    length,
    isGlobalOverride,
    ignoreTurnRate,
  } = input;
  const samples = analysis.steps.length;
  const arc = progressByDistance(analysis);
  const along = (i: number) => (arc ? arc[i] : i / samples);

  const chainLength = chainMeta?.chainTotalLength ?? length;
  const distanceBefore = chainMeta?.distanceBefore ?? 0;
  const chainT = (i: number) =>
    chainLength > 0
      ? (distanceBefore + along(i) * length) / chainLength
      : along(i);

  return {
    input,
    samples,
    curve: [prevPoint, ...line.controlPoints, line.endPoint],
    maxTurnRate: radiansToDegrees(Math.max(settings.aVelocity, 0.001)),
    along,
    progress: (i) => (isGlobalOverride ? chainT(i) : along(i)),
    stepDuration: (i) =>
      ignoreTurnRate
        ? Infinity
        : (motionProfile[i] ?? motionProfile.at(-1)) -
          (motionProfile[i - 1] ?? 0),
  };
}

/** Chained lines turn from the start heading to the end heading as fast as the robot can. */
function turnedByStep(ctx: ProfileContext, i: number): number {
  const { currentHeading, endHeading, physicalRotationTime, motionProfile } =
    ctx.input;
  const ratio =
    physicalRotationTime > 0
      ? Math.min(1, motionProfile[i] / physicalRotationTime)
      : 1;
  return currentHeading + (endHeading - currentHeading) * ratio;
}

/**
 * The robot turns to face where `aim` says as fast as it can, one step at a
 * time. `aim` gives the heading wanted at t (near the heading so far), or
 * null to keep the heading it has.
 */
function turnTowardAim(
  ctx: ProfileContext,
  aim: (t: number, h: number) => number | null,
): number[] {
  const headings: number[] = [];
  for (let i = 1, h = ctx.input.currentHeading; i <= ctx.samples; i++) {
    const target = aim(i / ctx.samples, h) ?? h;
    h = turnToward(h, target, ctx.maxTurnRate * ctx.stepDuration(i));
    headings.push(h);
  }
  return headings;
}

function tangentialHeadings(ctx: ProfileContext, source: HeadingSource) {
  if (!ctx.input.isChained)
    return ctx.input.analysis.steps.map((s) => s.heading);
  // Follow the direction of travel, limited by the maximum turn rate.
  return turnTowardAim(ctx, (t, h) =>
    tangentHeading(ctx.curve, t, source.reverse, h),
  );
}

function constantHeadings(ctx: ProfileContext, source: HeadingSource) {
  const { currentHeading, isChained } = ctx.input;
  const degrees = (source.degrees || 0) + (source.reverse ? 180 : 0);
  const target = unwrapAngle(degrees, currentHeading);
  const headings: number[] = [];
  for (let i = 1; i <= ctx.samples; i++) {
    headings.push(isChained ? turnedByStep(ctx, i) : target);
  }
  return headings;
}

function linearHeadings(ctx: ProfileContext, source: HeadingSource) {
  const start = unwrapAngle(source.startDeg || 0, ctx.input.currentHeading);
  const sweep = linearHeadingSweep(
    source.startDeg || 0,
    source.endDeg || 0,
    source.reverse,
  );
  const headings: number[] = [];
  for (let i = 1; i <= ctx.samples; i++) {
    // The sweep follows the progress along the path; a robot that isn't
    // facing it yet catches up as fast as it can (see `limitTurnRate`).
    headings.push(start + sweep * ctx.progress(i));
  }
  return headings;
}

/** The robot turns to face the point as fast as it can, which is slower than the direction to the point can change as the robot passes it. */
function facingPointHeadings(ctx: ProfileContext, source: HeadingSource) {
  return turnTowardAim(ctx, (t, h) => facingHeading(ctx.curve, t, source, h));
}

/** The heading wanted at each step after the first, according to the line's heading. */
function wantedHeadings(ctx: ProfileContext, source: HeadingSource): number[] {
  switch (source.heading) {
    case "tangential":
      return tangentialHeadings(ctx, source);
    case "constant":
      return constantHeadings(ctx, source);
    case "linear":
      return linearHeadings(ctx, source);
    case "facingPoint":
      return facingPointHeadings(ctx, source);
    case "piecewise":
      return piecewiseProfile(ctx, source.segments ?? []);
    default:
      return [];
  }
}

/** Unwrap so consecutive headings never differ by more than 180 degrees. */
function unwrapProfile(profile: number[]) {
  for (let k = 1; k < profile.length; k++) {
    let curr = profile[k];
    while (curr - profile[k - 1] > 180) curr -= 360;
    while (curr - profile[k - 1] < -180) curr += 360;
    profile[k] = curr;
  }
}

/**
 * The robot's heading at each step of the motion profile along a line,
 * unwrapped so consecutive values never jump by more than 180 degrees.
 */
export function buildHeadingProfile(input: HeadingProfileInput): number[] {
  const ctx = profileContext(input);
  const { source } = getEffectiveHeadingSource(input.line, input.rootLine);

  const profile = [input.currentHeading, ...wantedHeadings(ctx, source)];
  unwrapProfile(profile);

  return input.ignoreTurnRate
    ? profile
    : limitTurnRate(profile, input.motionProfile, ctx.maxTurnRate);
}

/**
 * How each piecewise segment of the line falls short of its heading: the gap
 * between the heading the segment asks for at its last step and the heading
 * the robot has there (zero for a segment that gets there, or is too short to
 * have a step), with the numbers that say why and what would fix it. Undefined
 * where the line's heading isn't piecewise. `headings` is the finished profile
 * from `buildHeadingProfile`.
 */
export function piecewiseShortfalls(
  input: HeadingProfileInput,
  headings: number[],
): PiecewiseShortfall[] | undefined {
  const { source } = getEffectiveHeadingSource(input.line, input.rootLine);
  if (source.heading !== "piecewise") return undefined;

  const ctx = profileContext(input);
  const times = input.motionProfile;
  const segments = source.segments ?? [];
  const first = new Map<PiecewiseSegment, number>();
  const last = new Map<PiecewiseSegment, number>();
  for (let i = 1; i <= ctx.samples; i++) {
    const t = ctx.progress(i);
    const seg = segments.find((s) => t >= s.tStart && t <= s.tEnd);
    if (!seg) continue;
    if (!first.has(seg)) first.set(seg, i);
    last.set(seg, i);
  }

  return segments.map((seg): PiecewiseShortfall => {
    const none = {
      heading: seg.heading,
      degrees: 0,
      turn: 0,
      seconds: 0,
      turnRate: ctx.maxTurnRate,
    };
    const end = last.get(seg);
    if (end === undefined || headings[end] === undefined) return none;

    const target = segmentTarget(ctx, seg, end, headings[end]);
    const before = Math.max(0, first.get(seg)! - 1);
    return {
      heading: seg.heading,
      degrees: Math.abs(target - headings[end]),
      turn: Math.abs(target - (headings[before] ?? headings[end])),
      seconds: Math.max(0, (times[end] ?? 0) - (times[before] ?? 0)),
      turnRate: ctx.maxTurnRate,
    };
  });
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

/** Fraction of the line's length covered by each step boundary, or null for a line with no length. */
function progressByDistance(analysis: PathAnalysis): number[] | null {
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

/** Where a piecewise segment wants the robot to point at step `i`, given the heading `h` so far. */
function segmentTarget(
  ctx: ProfileContext,
  seg: PiecewiseSegment,
  i: number,
  h: number,
): number {
  const localT = i / ctx.samples;
  switch (seg.heading) {
    case "constant":
      return unwrapAngle((seg.degrees ?? 0) + (seg.reverse ? 180 : 0), h);
    case "tangential":
      return tangentHeading(ctx.curve, localT, seg.reverse, h) ?? h;
    case "linear": {
      const t = ctx.progress(i);
      const span = seg.tEnd - seg.tStart;
      const segT =
        span > 0 ? Math.max(0, Math.min(1, (t - seg.tStart) / span)) : 0;
      const start = seg.startDeg ?? 0;
      return (
        unwrapAngle(start, h) +
        linearHeadingSweep(start, seg.endDeg ?? 0, seg.reverse) * segT
      );
    }
    case "facingPoint":
      return facingHeading(ctx.curve, localT, seg, h);
    default:
      return h;
  }
}

/**
 * Headings for a piecewise heading: each segment covers part of the path
 * (by t), and the robot turns towards each segment's heading as fast as it
 * physically can, as it does for a heading that isn't piecewise.
 */
function piecewiseProfile(
  ctx: ProfileContext,
  segments: PiecewiseSegment[],
): number[] {
  const headings: number[] = [];
  let h = ctx.input.currentHeading;

  for (let i = 1; i <= ctx.samples; i++) {
    const t = ctx.progress(i);
    const seg = segments.find((s) => t >= s.tStart && t <= s.tEnd);
    if (!seg) {
      headings.push(h);
      continue;
    }

    const target = segmentTarget(ctx, seg, i, h);
    h = turnToward(h, target, ctx.maxTurnRate * ctx.stepDuration(i));
    headings.push(h);
  }
  return headings;
}
