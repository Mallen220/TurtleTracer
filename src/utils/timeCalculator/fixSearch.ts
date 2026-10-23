// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Finding a change that really clears a warning. The advice for a path the
// robot can't follow names a speed or a start to use; those come from trying
// them in the simulation, not from a formula, so what is suggested works.
import type {
  Line,
  PiecewiseSegment,
  Point,
  SequenceItem,
  Settings,
  TimelineEvent,
} from "../../types";
import { calculatePathTime } from "./pathCalculator";
import { fallsShort } from "./advice";
import { lateralLimit } from "./lateralLimit";

/** The slowest speed worth suggesting (in/s): below it the robot crawls. */
export const MIN_SUGGESTED_SPEED = 5;

/** Everything the simulation needs to try a change. */
export interface FixContext {
  startPoint: Point;
  lines: Line[];
  sequence: SequenceItem[] | undefined;
  settings: Settings;
}

/** The travel event of the path at `lineIndex`, after timing `lines`. */
function travelOf(
  ctx: FixContext,
  lines: Line[],
  lineIndex: number,
): TimelineEvent | undefined {
  const { timeline } = calculatePathTime(
    ctx.startPoint,
    lines,
    ctx.settings,
    ctx.sequence,
  );
  return timeline.find((e) => e.type === "travel" && e.lineIndex === lineIndex);
}

const replaceLine = (lines: Line[], index: number, change: Partial<Line>) =>
  lines.map((l, i) => (i === index ? { ...l, ...change } : l));

/**
 * The fastest Max Speed, in whole in/s, for the path at `lineIndex` that
 * clears the problem, or null if it can't be cleared at a speed worth using.
 * `isFixed` says whether a timed path still has the problem.
 */
export function fastestSpeedThatFixes(
  ctx: FixContext,
  lineIndex: number,
  isFixed: (event: TimelineEvent) => boolean,
  /** Where the speed is set: the path's own, or its chain's (on the chain's first path). */
  target: { index: number; field: "maxSpeed" | "chainMaxSpeed" } = {
    index: lineIndex,
    field: "maxSpeed",
  },
): number | null {
  const now = travelOf(ctx, ctx.lines, lineIndex);
  const top = now?.velocityProfile?.length
    ? Math.max(...now.velocityProfile)
    : ctx.settings.maxVelocity || 100;

  const works = (speed: number) => {
    const event = travelOf(
      ctx,
      replaceLine(ctx.lines, target.index, { [target.field]: speed }),
      lineIndex,
    );
    return event !== undefined && isFixed(event);
  };

  // Down in steps until it works, then back up between the last two to find
  // the fastest speed that does.
  // (Whole speeds throughout: the top speed rarely is one, and halving
  // between a whole and a fractional bound can stand still.)
  let tooFast = Math.ceil(top);
  let speed = Math.floor(top * 0.85);
  while (speed >= MIN_SUGGESTED_SPEED) {
    if (works(speed)) {
      let low = speed;
      let high = tooFast;
      for (let tries = 0; high - low > 1 && tries < 16; tries++) {
        const mid = Math.floor((low + high) / 2);
        if (works(mid)) low = mid;
        else high = mid;
      }
      return low;
    }
    tooFast = speed;
    speed = Math.floor(speed * 0.85);
  }
  return tooFast > MIN_SUGGESTED_SPEED && works(MIN_SUGGESTED_SPEED)
    ? MIN_SUGGESTED_SPEED
    : null;
}

/** The segments with the one at `index` starting at `t`: those before it that start later are gone, and the last that is kept ends where it starts. */
function startingAt(segments: PiecewiseSegment[], index: number, t: number) {
  const before = segments.slice(0, index).filter((s) => s.tStart < t);
  if (before.length > 0) {
    before[before.length - 1] = { ...before.at(-1)!, tEnd: t };
  }
  return {
    segments: [
      ...before,
      { ...segments[index], tStart: t },
      ...segments.slice(index + 1),
    ],
    index: before.length,
  };
}

/** Where a piecewise segment can start so that it finishes turning, and how many segments before it that gets rid of. */
export interface SegmentStart {
  t: number;
  /** Segments before it that start no earlier than `t`, so are shortened away. */
  passes: number;
}

/**
 * The latest start for the piecewise segment `segmentIndex` of the path at
 * `lineIndex` (to two decimals) at which it finishes turning, or null if no
 * start does, or it is the first segment, which starts at the beginning.
 */
export function latestStartThatFixes(
  ctx: FixContext,
  lineIndex: number,
  segmentIndex: number,
): SegmentStart | null {
  const line = ctx.lines[lineIndex];
  const segments = line?.endPoint.segments;
  if (line?.endPoint.heading !== "piecewise" || !segments) return null;
  if (segmentIndex <= 0 || segmentIndex >= segments.length) return null;

  const works = (t: number) => {
    const changed = startingAt(segments, segmentIndex, t);
    const event = travelOf(
      ctx,
      replaceLine(ctx.lines, lineIndex, {
        endPoint: { ...line.endPoint, segments: changed.segments } as Point,
      }),
      lineIndex,
    );
    return !fallsShort(event?.piecewiseShortfalls?.[changed.index]);
  };

  // As early as it can start; if even that is too late, nothing does.
  if (!works(0)) return null;
  let low = 0;
  let high = segments[segmentIndex].tStart;
  for (let i = 0; i < 7; i++) {
    const mid = (low + high) / 2;
    if (works(mid)) low = mid;
    else high = mid;
  }
  const t = Math.floor(low * 100) / 100;
  return {
    t,
    passes: segments.slice(0, segmentIndex).filter((s) => s.tStart >= t).length,
  };
}

/**
 * Whether a timed path follows its bends: the robot doesn't run wide of the
 * path, and the path doesn't ask more of its wheels than they hold, which
 * Path Statistics flags as a risk of wheel slip even where it doesn't show
 * the robot running wide.
 */
export const followsBends =
  (settings: Settings) =>
  (event: TimelineEvent): boolean =>
    event.excursion === undefined &&
    (event.peakDemand ?? 0) <= lateralLimit(settings).limit;

/** A Max Speed to set that clears a problem, ready to apply. */
export interface SpeedFix {
  /** The path the speed is set on: the one with the problem, or the first of its chain. */
  lineIndex: number;
  /** Its own speed, or the speed of its whole chain. */
  field: "maxSpeed" | "chainMaxSpeed";
  /** In in/s. */
  speed: number;
}

/** The first path of the chain the path at `lineIndex` is in (itself if it isn't chained). */
export function chainRootIndex(lines: Line[], lineIndex: number): number {
  let root = lineIndex;
  while (root > 0 && lines[root]?.isChain === true) root--;
  return root;
}

/** Whether the path at `lineIndex` is one of several chained together. */
function isChained(lines: Line[], lineIndex: number): boolean {
  return (
    lines[lineIndex]?.isChain === true || lines[lineIndex + 1]?.isChain === true
  );
}

/**
 * The speeds that clear a problem of the path at `lineIndex`, each tried in
 * the simulation: a Max Speed for the path, and, if it is chained, one for
 * the whole chain. A speed that can't clear it is left out (a chain's speed
 * can't, for instance, if the path has a faster one of its own).
 */
export function speedFixes(
  ctx: FixContext,
  lineIndex: number,
  isFixed: (event: TimelineEvent) => boolean,
): SpeedFix[] {
  const fixes: SpeedFix[] = [];
  const own = fastestSpeedThatFixes(ctx, lineIndex, isFixed);
  if (own !== null) fixes.push({ lineIndex, field: "maxSpeed", speed: own });

  if (isChained(ctx.lines, lineIndex)) {
    const root = chainRootIndex(ctx.lines, lineIndex);
    const whole = fastestSpeedThatFixes(ctx, lineIndex, isFixed, {
      index: root,
      field: "chainMaxSpeed",
    });
    if (whole !== null) {
      fixes.push({ lineIndex: root, field: "chainMaxSpeed", speed: whole });
    }
  }
  return fixes;
}

/** `lines` with the speed of a fix set. */
export function applySpeedFix(lines: Line[], fix: SpeedFix): Line[] {
  return replaceLine(lines, fix.lineIndex, { [fix.field]: fix.speed });
}

/** What a button that applies a fix says. */
export function speedFixLabel(fix: SpeedFix): string {
  return fix.field === "chainMaxSpeed"
    ? `Limit the whole chain to ${fix.speed} in/s`
    : `Limit this path to ${fix.speed} in/s`;
}
