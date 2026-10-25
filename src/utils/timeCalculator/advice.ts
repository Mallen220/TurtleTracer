// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// What to tell a user whose path the robot can't follow as drawn. The advice
// is limited to what they can do in the app: reshape the path, split it, set
// a Max Speed, move where a heading segment starts, add a turn, or correct a
// robot setting. The speeds and starts it names come from trying them in the
// simulation (see `fixSearch`), so each one clears the warning it is for.
import type { Excursion, PiecewiseShortfall, Settings } from "../../types";
import { lateralLimit } from "./lateralLimit";

/** A piecewise segment that ends this many degrees short of its heading is worth a warning. */
export const PIECEWISE_TOLERANCE_DEGREES = 2;

const degrees = (n: number) => `${Math.round(n)}°`;
const seconds = (n: number) => `${n.toFixed(1)} s`;

/** Whether a piecewise segment falls short enough to say so. */
export const fallsShort = (shortfall: PiecewiseShortfall | undefined) =>
  (shortfall?.degrees ?? 0) > PIECEWISE_TOLERANCE_DEGREES;

/** The changes that clear a piecewise segment's shortfall, if there are any. */
export interface SegmentFixes {
  /** Where the segment can start so that it finishes, and how many segments before it that shortens away. */
  start: { t: number; passes: number } | null;
  /** A Max Speed for the path, in in/s, at which it finishes. */
  speed: number | null;
}

const NO_FIXES: SegmentFixes = { start: null, speed: null };

/** Why a piecewise segment doesn't finish turning, and what to do about it. */
export function shortfallAdvice(
  s: PiecewiseShortfall,
  fixes: SegmentFixes = NO_FIXES,
): string {
  const rate = `${Math.round(s.turnRate)}°/s`;
  const speed =
    fixes.speed === null
      ? ""
      : ` Or set this path's Max Speed to ${fixes.speed} in/s or less (under Chain Motion on the path).`;

  if (s.heading === "tangential") {
    return (
      `Won't keep up: the path turns faster than the robot can (${rate}), so it ends this segment ${degrees(s.degrees)} off the direction of travel. ` +
      `Make the bend gentler, or end this segment earlier.${speed}`
    );
  }

  const turned = degrees(Math.max(0, s.turn - s.degrees));
  const problem =
    `Won't finish turning: from the way the robot is facing when this segment starts, it has to turn ${degrees(s.turn)}, ` +
    `but in the ${seconds(s.seconds)} it has the robot manages ${turned} (it turns at most ${rate}), so it ends ${degrees(s.degrees)} short.`;
  const earlier =
    fixes.start === null
      ? ""
      : ` Start the segment earlier: set the t = value above it to ${fixes.start.t.toFixed(2)} or less${
          fixes.start.passes > 0
            ? `, and shorten the ${fixes.start.passes === 1 ? "segment" : `${fixes.start.passes} segments`} above it that start${fixes.start.passes === 1 ? "s" : ""} later than that`
            : ""
        }.`;
  const rotate =
    fixes.start === null && fixes.speed === null
      ? " Or add a Rotate step to turn in place."
      : "";
  return (
    `${problem}${earlier}${speed} Or turn less: about ${turned} fits.${rotate} ` +
    `If your robot really turns faster than ${rate}, raise Angular Velocity in Settings.`
  );
}

/**
 * Why the robot can't follow a bend at its speed, what it does instead, and
 * what to do about it. `speed` is a Max Speed for the path at which the bend
 * is followed, if there is one.
 */
export function bendAdvice(
  name: string,
  excursion: Excursion,
  settings: Settings,
  speed: number | null = null,
): string {
  const { limit, byFriction } = lateralLimit(settings);
  const { radius, x, y, speed: atBend } = excursion.tightest;
  const needed = (atBend * atBend) / limit;
  const grip = byFriction
    ? `its wheels slip beyond about ${Math.round(limit)} in/s²`
    : `it can manage about ${Math.round(limit)} in/s² sideways`;
  const back = excursion.settled
    ? `taking ${seconds(excursion.duration)} to get back on it`
    : "and never gets back on it";
  const slowDown =
    speed === null
      ? ""
      : ` or set this path's Max Speed to ${speed} in/s or less (under Chain Motion on the path),`;

  return (
    `${name} has a bend with a radius of ${radius.toFixed(1)} in near (${x.toFixed(1)}, ${y.toFixed(1)}) that is too tight to follow at ${atBend.toFixed(0)} in/s: ` +
    `${grip}, which takes a radius of ${Math.ceil(needed)} in or more at that speed. ` +
    `Pedro doesn't slow down for bends, so the simulation has the robot run ${excursion.maxOffset.toFixed(1)} in wide of the path, ${back}. ` +
    `To fix it, open the bend out to a radius of ${Math.ceil(needed)} in or more by moving its control points,${slowDown} ` +
    "or split the path at the bend (click this warning to jump to it, then press K) and leave the two paths un-chained, so the robot stops there and turns the corner."
  );
}
