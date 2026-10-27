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
import { MISSED_POINT_WARNING } from "./chainIssues";

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
  /** Where the speed is set: the path's own (by default), or its chain's (on the chain's first path). */
  target?: { index: number; field: "maxSpeed" | "chainMaxSpeed" },
): number | null {
  return fastestSpeed(
    ctx,
    topSpeedOf(travelOf(ctx, ctx.lines, lineIndex), ctx.settings),
    target ?? { index: lineIndex, field: "maxSpeed" },
    (lines) => {
      const event = travelOf(ctx, lines, lineIndex);
      return event !== undefined && isFixed(event);
    },
  );
}

/** The fastest the robot goes on a timed path, or the robot's top speed if that isn't known. */
const topSpeedOf = (travel: TimelineEvent | undefined, settings: Settings) =>
  travel?.velocityProfile?.length
    ? Math.max(...travel.velocityProfile)
    : settings.maxVelocity || 100;

/**
 * The fastest whole speed (in/s) below `top`, set as `target`, at which
 * `works` holds for the changed paths, or null if none worth using does.
 */
function fastestSpeed(
  ctx: FixContext,
  top: number,
  target: { index: number; field: "maxSpeed" | "chainMaxSpeed" },
  works: (lines: Line[]) => boolean,
): number | null {
  const worksAt = (speed: number) =>
    works(replaceLine(ctx.lines, target.index, { [target.field]: speed }));

  // Down in steps until it works, then back up between the last two to find
  // the fastest speed that does.
  // (Whole speeds throughout: the top speed rarely is one, and halving
  // between a whole and a fractional bound can stand still.)
  let tooFast = Math.ceil(top);
  let speed = Math.floor(top * 0.85);
  while (speed >= MIN_SUGGESTED_SPEED) {
    if (worksAt(speed)) {
      let low = speed;
      let high = tooFast;
      for (let tries = 0; high - low > 1 && tries < 16; tries++) {
        const mid = Math.floor((low + high) / 2);
        if (worksAt(mid)) low = mid;
        else high = mid;
      }
      return low;
    }
    tooFast = speed;
    speed = Math.floor(speed * 0.85);
  }
  return tooFast > MIN_SUGGESTED_SPEED && worksAt(MIN_SUGGESTED_SPEED)
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
  /** The path's name, when it isn't the path the fix is shown on. */
  pathName?: string;
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
  if (fix.field === "chainMaxSpeed") {
    return `Limit the whole chain to ${fix.speed} in/s`;
  }
  return `Limit ${fix.pathName ?? "this path"} to ${fix.speed} in/s`;
}

/** A swing past the next path at most this far (inches) counts as holding the corner. */
export const HELD_SWING = 1;

/**
 * Whether the robot holds the chained corner it recovers from in `event`: it
 * gets back onto the next path, swings at most `HELD_SWING` past it, and
 * doesn't cut the corner far from the point the paths join at.
 */
export const holdsCorner = (event: TimelineEvent | undefined): boolean =>
  event?.settled !== false &&
  (event?.overshoot ?? 0) <= HELD_SWING &&
  (event?.missedBy ?? 0) <= MISSED_POINT_WARNING;

/** The recovery at the chained corner onto the path at `lineIndex`, after timing `lines`. */
function recoveryOf(ctx: FixContext, lines: Line[], lineIndex: number) {
  const { timeline } = calculatePathTime(
    ctx.startPoint,
    lines,
    ctx.settings,
    ctx.sequence,
  );
  return timeline.find(
    (e) => e.type === "recovery" && e.lineIndex === lineIndex,
  );
}

/** The path the robot is handed over from at the chained corner onto the path at `lineIndex`. */
function pathIntoCorner(ctx: FixContext, lineIndex: number): number {
  const id = ctx.lines[lineIndex]?.id;
  const paths = (ctx.sequence ?? []).filter((item) => item.kind === "path");
  const at = paths.findIndex((item) => item.lineId === id);
  if (at > 0) {
    const before = ctx.lines.findIndex((l) => l.id === paths[at - 1].lineId);
    if (before !== -1) return before;
  }
  return lineIndex - 1;
}

/**
 * The speeds that get the robot through the chained corner onto the path at
 * `lineIndex` (see `holdsCorner`), each tried in the simulation: a Max Speed
 * for the path into the corner, which sets how fast the robot arrives, and one
 * for the whole chain. (The next path's own speed doesn't change the swing.)
 * A speed is only offered if the run is still faster with it than with the
 * robot stopping at the corner (the paths unchained), which holds it exactly:
 * a sharp corner can need a crawl. Empty if the robot holds the corner
 * already, or no speed is worth it. The robot's tuning (its translational P)
 * is left alone: it is measured on the robot, not a value to change to get one
 * corner right.
 */
export function cornerSpeedFixes(
  ctx: FixContext,
  lineIndex: number,
): SpeedFix[] {
  if (holdsCorner(recoveryOf(ctx, ctx.lines, lineIndex))) return [];
  const into = pathIntoCorner(ctx, lineIndex);
  if (into < 0) return [];

  const top = topSpeedOf(travelOf(ctx, ctx.lines, into), ctx.settings);
  const works = (lines: Line[]) =>
    holdsCorner(recoveryOf(ctx, lines, lineIndex));
  const stopping = unchainedTime(ctx, lineIndex);
  const faster = (fix: SpeedFix) =>
    totalTime(ctx, applySpeedFix(ctx.lines, fix), ctx.sequence) < stopping;
  const fixes: SpeedFix[] = [];
  const own = fastestSpeed(ctx, top, { index: into, field: "maxSpeed" }, works);
  if (own !== null) {
    fixes.push({
      lineIndex: into,
      field: "maxSpeed",
      speed: own,
      pathName: ctx.lines[into].name || "the path into the corner",
    });
  }
  const root = chainRootIndex(ctx.lines, lineIndex);
  const whole = fastestSpeed(
    ctx,
    top,
    { index: root, field: "chainMaxSpeed" },
    works,
  );
  if (whole !== null) {
    fixes.push({ lineIndex: root, field: "chainMaxSpeed", speed: whole });
  }
  return fixes.filter(faster);
}

const totalTime = (
  ctx: FixContext,
  lines: Line[],
  sequence: SequenceItem[] | undefined,
) => calculatePathTime(ctx.startPoint, lines, ctx.settings, sequence).totalTime;

/** How long the run takes with the robot stopping at the corner onto the path at `lineIndex`. */
function unchainedTime(ctx: FixContext, lineIndex: number): number {
  const id = ctx.lines[lineIndex].id;
  return totalTime(
    ctx,
    replaceLine(ctx.lines, lineIndex, { isChain: false }),
    ctx.sequence?.map((item) =>
      item.kind === "path" && item.lineId === id
        ? { ...item, isChain: false }
        : item,
    ),
  );
}
