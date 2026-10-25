// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Chained corners on the real robot, and the translational P that explains
// them. When Pedro hands a chain over to its next path, the robot's momentum
// carries it past the new path and the translational correction pulls it
// back. How far it swings depends on that gain. Each handover is recorded with
// the robot's position and velocity and the path it was steered onto (traced
// from Pedro's closest points); the simulation's own recovery is then run from
// the same start at different gains, and the gain that swings as far as the
// robot did is the robot's.

import type { Settings } from "../../types";
import {
  MAX_TRANSLATIONAL_P,
  MIN_TRANSLATIONAL_P,
  simulateRecovery,
} from "../timeCalculator/chainRecovery";
import type { MotionSample } from "./samples";

interface Vec {
  x: number;
  y: number;
}

/** One handover from a chained path to the next, as the robot drove it. */
export interface CornerEvent {
  kind: "corner";
  t: number;
  /** Where the robot was, and how fast it was going (in/s), at the handover. */
  position: Vec;
  velocity: Vec;
  /** The path it was steered onto, from where the handover put it. */
  path: Vec[];
  /** Degrees between the way it was going and the new path. */
  turn: number;
  /** How far it swung past the new path, in inches. */
  swing: number;
  /** Seconds watched after the handover. */
  duration: number;
}

/** Starting this far (inches) to one side of the path counts as being on that side (as the simulation). */
const SIDE_MIN = 0.5;
/** Seconds watched after a handover. */
const WATCH_TIME = 3;
/** Closest points nearer than this (inches) to the last one kept add nothing. */
const PATH_SPACING = 0.5;
/** How far past the last point seen the path is extended, straight on, and in what steps (inches). */
const EXTEND = 60;
const EXTEND_STEP = 2;
/** Corners gentler than this, or taken slower, show too little of the gain. */
const MIN_TURN = 20;
const MIN_SPEED = 10;
/** A swing smaller than this (inches) says only that the gain is strong. */
export const MIN_SWING = 0.5;

const unit = (x: number, y: number): Vec => {
  const size = Math.hypot(x, y) || 1;
  return { x: x / size, y: y / size };
};

/** The point of `path` nearest `p`, with the path's direction there. */
function nearest(path: Vec[], p: Vec) {
  let best = { x: path[0].x, y: path[0].y, tx: 1, ty: 0, d: Infinity };
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i];
    const b = path[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    const u = Math.max(
      0,
      Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2),
    );
    const x = a.x + u * dx;
    const y = a.y + u * dy;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < best.d) {
      const len = Math.sqrt(len2);
      best = { x, y, tx: dx / len, ty: dy / len, d };
    }
  }
  return best;
}

/** How far to the left of the path `p` is. */
function sideOf(path: Vec[], p: Vec) {
  const on = nearest(path, p);
  return (p.x - on.x) * -on.ty + (p.y - on.y) * on.tx;
}

/**
 * How far a route swings past `path`, to the side opposite the one it
 * starts on. The same measure is used for the robot and the simulation.
 */
export function swingPast(path: Vec[], route: Vec[]): number {
  if (route.length === 0 || path.length < 2) return 0;
  const start = sideOf(path, route[0]);
  if (Math.abs(start) <= SIDE_MIN) return 0;
  const side = Math.sign(start);
  let swing = 0;
  for (const p of route) swing = Math.max(swing, -side * sideOf(path, p));
  return swing;
}

/** The path traced by Pedro's closest points, extended straight on. */
function tracePath(samples: MotionSample[]): Vec[] | null {
  const path: Vec[] = [];
  for (const s of samples) {
    if (s.cx === undefined || s.cy === undefined) continue;
    const last = path.at(-1);
    if (!last || Math.hypot(s.cx - last.x, s.cy - last.y) >= PATH_SPACING) {
      path.push({ x: s.cx, y: s.cy });
    }
  }
  const lastSample = samples.findLast(
    (s) => s.tx !== undefined && s.ty !== undefined,
  );
  if (path.length === 0 || !lastSample) return null;
  const dir = unit(lastSample.tx!, lastSample.ty!);
  const end = path.at(-1)!;
  for (let d = EXTEND_STEP; d <= EXTEND; d += EXTEND_STEP) {
    path.push({ x: end.x + dir.x * d, y: end.y + dir.y * d });
  }
  return path;
}

/** Poses before the handover used for the robot's velocity at it. */
const APPROACH_SAMPLES = 8;

/**
 * The velocity at the last of `approach`, from a quadratic through the poses
 * leading up to it. The smoothed velocity there would already take in some
 * of the swing after it, and at a weak gain the swing depends a lot on the
 * speed.
 */
function velocityAtEnd(approach: MotionSample[]): Vec {
  const end = approach.at(-1)!;
  if (approach.length < 3) return { x: end.vx, y: end.vy };
  const fit = (value: (s: MotionSample) => number) => {
    // value = a + b*dt + c*dt², dt from the end; the velocity there is b.
    let s1 = 0;
    let s2 = 0;
    let s3 = 0;
    let s4 = 0;
    let v0 = 0;
    let v1 = 0;
    let v2 = 0;
    for (const s of approach) {
      const dt = s.t - end.t;
      const v = value(s);
      s1 += dt;
      s2 += dt * dt;
      s3 += dt ** 3;
      s4 += dt ** 4;
      v0 += v;
      v1 += v * dt;
      v2 += v * dt * dt;
    }
    const n = approach.length;
    // Normal equations, solved by Cramer's rule.
    const det =
      n * (s2 * s4 - s3 * s3) -
      s1 * (s1 * s4 - s3 * s2) +
      s2 * (s1 * s3 - s2 * s2);
    if (Math.abs(det) < 1e-12) return null;
    return (
      (n * (v1 * s4 - s3 * v2) -
        v0 * (s1 * s4 - s3 * s2) +
        s2 * (s1 * v2 - v1 * s2)) /
      det
    );
  };
  const vx = fit((s) => s.x);
  const vy = fit((s) => s.y);
  return vx === null || vy === null
    ? { x: end.vx, y: end.vy }
    : { x: vx, y: vy };
}

/** The corner a handover and what followed it show, if it says anything about the gain. */
export function analyzeCorner(
  samples: MotionSample[],
  approach: MotionSample[] = [],
): CornerEvent | null {
  const start = samples[0];
  if (start?.tx === undefined || start.ty === undefined) return null;
  const velocity = velocityAtEnd([...approach, start]);
  const speed = Math.hypot(velocity.x, velocity.y);
  const path = tracePath(samples);
  if (!path || speed < MIN_SPEED) return null;

  const along = unit(start.tx, start.ty);
  const cos = (velocity.x * along.x + velocity.y * along.y) / speed;
  const turn = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  if (turn < MIN_TURN) return null;

  return {
    kind: "corner",
    t: start.t,
    position: { x: start.x, y: start.y },
    velocity,
    path,
    turn,
    swing: swingPast(path, samples),
    duration: samples.at(-1)!.t - start.t,
  };
}

/**
 * Watches for Pedro moving on to the next path of a chain while the robot
 * is moving, and reports each corner once it has been watched.
 */
export class CornerDetector {
  private watching: MotionSample[] = [];
  /** The samples leading up to the one being watched from. */
  private approach: MotionSample[] = [];
  private recent: MotionSample[] = [];
  private lastIndex: number | undefined;

  constructor(private readonly onCorner: (corner: CornerEvent) => void) {}

  push(sample: MotionSample) {
    const index = sample.busy === false ? undefined : sample.pathIndex;
    const handover =
      index !== undefined &&
      this.lastIndex !== undefined &&
      index === this.lastIndex + 1;
    if (this.watching.length > 0) {
      const ends =
        index !== this.lastIndex || sample.t - this.watching[0].t > WATCH_TIME;
      if (ends) this.finish();
      else this.watching.push(sample);
    }
    if (handover) {
      this.watching = [sample];
      this.approach = [...this.recent];
    }
    this.recent.push(sample);
    if (this.recent.length > APPROACH_SAMPLES - 1) this.recent.shift();
    this.lastIndex = index;
  }

  /** The stream broke: finish the corner being watched, if any. */
  breakStream() {
    this.finish();
    this.recent = [];
    this.lastIndex = undefined;
  }

  private finish() {
    if (this.watching.length > 2) {
      const corner = analyzeCorner(this.watching, this.approach);
      if (corner) this.onCorner(corner);
    }
    this.watching = [];
  }
}

/**
 * How far the simulation's robot swings at `corner` with `gain`, over the
 * time the robot was watched. The simulation runs to its usual limit: cut
 * short, it would blend the end of an unfinished swing back onto the path.
 */
export function simulatedSwing(
  corner: CornerEvent,
  settings: Settings,
  gain: number,
): number {
  const run = simulateRecovery({
    position: corner.position,
    velocity: corner.velocity,
    path: corner.path,
    settings: { ...settings, translationalP: gain },
  });
  const route: Vec[] = [corner.position];
  for (let i = 0; i < run.x.length && run.time[i] <= corner.duration; i++) {
    route.push({ x: run.x[i], y: run.y[i] });
  }
  return swingPast(corner.path, route);
}

/** Gains tried, spread evenly on a log scale over what the simulation uses. */
const GAINS = (() => {
  const gains: number[] = [];
  const steps = 30;
  const ratio = MAX_TRANSLATIONAL_P / MIN_TRANSLATIONAL_P;
  for (let i = 0; i <= steps; i++) {
    gains.push(MIN_TRANSLATIONAL_P * ratio ** (i / steps));
  }
  return gains;
})();

/** How close (inches) the simulation's swing must come to the robot's. */
const SWING_MATCH = 0.5;
/**
 * A corner says something about the gain only if the swing changes with it:
 * by at least this share between 30% weaker and 30% stronger. At some very
 * sharp corners the robot swings about as far whatever the gain.
 */
const MIN_SENSITIVITY = 0.15;
const SENSITIVITY_STEP = 1.3;

/**
 * The translational P at which the simulation swings as far as the robot
 * did at `corner`: the weakest, where a stronger gain swings further again
 * at a very sharp corner. Null if no gain comes close.
 */
export function gainForCorner(
  corner: CornerEvent,
  settings: Settings,
): number | null {
  const gain = matchingGain(corner, settings);
  if (gain === null) return null;
  const weaker = simulatedSwing(corner, settings, gain / SENSITIVITY_STEP);
  const stronger = simulatedSwing(corner, settings, gain * SENSITIVITY_STEP);
  return Math.abs(weaker - stronger) >= MIN_SENSITIVITY * corner.swing
    ? gain
    : null;
}

function matchingGain(corner: CornerEvent, settings: Settings): number | null {
  const diff = (gain: number) =>
    simulatedSwing(corner, settings, gain) - corner.swing;
  let previous = { gain: GAINS[0], diff: diff(GAINS[0]) };
  // Too weak swings further than the robot did; the first gain that swings
  // less brackets it.
  let best = previous;
  for (const gain of GAINS.slice(1)) {
    const now = { gain, diff: diff(gain) };
    if (previous.diff > 0 && now.diff <= 0) {
      let low = previous;
      let high = now;
      for (let i = 0; i < 8; i++) {
        const gainMid = Math.sqrt(low.gain * high.gain);
        const mid = { gain: gainMid, diff: diff(gainMid) };
        if (mid.diff > 0) low = mid;
        else high = mid;
      }
      return Math.abs(low.diff) < Math.abs(high.diff) ? low.gain : high.gain;
    }
    if (Math.abs(now.diff) < Math.abs(best.diff)) best = now;
    previous = now;
  }
  return Math.abs(best.diff) <= SWING_MATCH ? best.gain : null;
}
