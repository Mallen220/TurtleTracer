// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Turns the robot's live poses into smoothed motion: speed, turn rate and the
// direction it travels relative to the way it faces. Poses arrive 20 to 50
// times a second and jitter by fractions of an inch, so speeds come from a
// straight-line fit over a short window around each pose rather than from
// neighbouring pairs. Pedro's own velocity is averaged instead when the robot
// sends it.

/** One pose from the robot, as it arrives. */
export interface RawSample {
  /** Seconds, on the robot's clock or the time it arrived. */
  t: number;
  x: number;
  y: number;
  /** Radians, counter-clockwise. */
  heading: number;
  /** Pedro's velocity: in/s and rad/s. */
  vx?: number;
  vy?: number;
  omega?: number;
  /** Whether Pedro is following a path. */
  busy?: boolean;
  /** Pedro's closest point on the path it follows, the path's direction there, and which path of the chain it is. */
  cx?: number;
  cy?: number;
  tx?: number;
  ty?: number;
  pathIndex?: number;
}

/** A pose with the motion around it. */
export interface MotionSample {
  t: number;
  x: number;
  y: number;
  /** Radians, unwrapped so it doesn't jump at ±π. */
  heading: number;
  /** in/s */
  speed: number;
  /** Velocity (in/s), from the poses. */
  vx: number;
  vy: number;
  /** rad/s, counter-clockwise positive. */
  turnRate: number;
  /** Radians between the direction of travel and the heading, or null when barely moving. */
  travelAngle: number | null;
  busy?: boolean;
  cx?: number;
  cy?: number;
  tx?: number;
  ty?: number;
  pathIndex?: number;
}

/** A longer pause than this (s) starts a new stretch of motion. */
const MAX_GAP = 0.25;
/** A jump further than this (in) in one pose is a relocalization, not motion. */
const MAX_JUMP = 12;
/** The robot clock going back further than this (s) means the robot restarted. */
const CLOCK_RESTART = 1;
/**
 * Poses within this many seconds either side are fitted together. Arrival
 * times jitter, so they need a wider window.
 */
export const HALF_WINDOW = { robot: 0.075, arrival: 0.15 } as const;
/** Below this speed (in/s) the direction of travel is too noisy to use. */
const MIN_SPEED_FOR_DIRECTION = 2;

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Least-squares slope of `value` against time. */
function slope(window: RawSample[], value: (s: RawSample) => number): number {
  const n = window.length;
  if (n < 2) return 0;
  let meanT = 0;
  let meanV = 0;
  for (const s of window) {
    meanT += s.t;
    meanV += value(s);
  }
  meanT /= n;
  meanV /= n;
  let num = 0;
  let den = 0;
  for (const s of window) {
    const dt = s.t - meanT;
    num += dt * (value(s) - meanV);
    den += dt * dt;
  }
  return den > 0 ? num / den : 0;
}

const mean = (values: number[]) =>
  values.reduce((sum, v) => sum + v, 0) / values.length;

/**
 * Feeds poses in one at a time and gets smoothed samples out, a few poses
 * behind (it needs the poses after each one to fit it).
 */
export class SampleSmoother {
  constructor(private readonly halfWindow: number = HALF_WINDOW.robot) {}

  /** Recent poses of the current stretch, headings unwrapped. */
  private raw: RawSample[] = [];
  /** Index in `raw` of the next pose to smooth. */
  private next = 0;

  /**
   * Adds a pose. Returns the samples now ready, and whether this pose
   * started a new stretch (after a gap, a jump or a robot restart), in which
   * case the samples are the end of the old stretch.
   */
  push(sample: RawSample): { samples: MotionSample[]; broke: boolean } {
    const last = this.raw.at(-1);
    if (last) {
      if (sample.t === last.t) {
        // Two poses with one time (a duplicate, or several arriving at
        // once): keep the newer pose.
        this.raw[this.raw.length - 1] = {
          ...sample,
          heading: last.heading + wrapAngle(sample.heading - last.heading),
        };
        return { samples: [], broke: false };
      }
      const back = last.t - sample.t;
      if (back > 0 && back <= CLOCK_RESTART) {
        return { samples: [], broke: false };
      }
      const jump = Math.hypot(sample.x - last.x, sample.y - last.y);
      if (back > 0 || sample.t - last.t > MAX_GAP || jump > MAX_JUMP) {
        const samples = this.flush();
        this.raw = [sample];
        return { samples, broke: true };
      }
      this.raw.push({
        ...sample,
        heading: last.heading + wrapAngle(sample.heading - last.heading),
      });
    } else {
      this.raw.push(sample);
    }

    const samples: MotionSample[] = [];
    const newest = this.raw.at(-1)!.t;
    while (
      this.next < this.raw.length &&
      newest - this.raw[this.next].t >= this.halfWindow
    ) {
      samples.push(this.smoothAt(this.next));
      this.next++;
    }
    this.trim();
    return { samples, broke: false };
  }

  /** Smooths the poses still waiting and starts over. */
  flush(): MotionSample[] {
    const samples: MotionSample[] = [];
    for (let i = this.next; i < this.raw.length; i++) {
      samples.push(this.smoothAt(i));
    }
    this.raw = [];
    this.next = 0;
    return samples;
  }

  private smoothAt(index: number): MotionSample {
    const centre = this.raw[index];
    let from = index;
    while (from > 0 && centre.t - this.raw[from - 1].t <= this.halfWindow)
      from--;
    let to = index;
    while (
      to < this.raw.length - 1 &&
      this.raw[to + 1].t - centre.t <= this.halfWindow
    ) {
      to++;
    }
    // At least one neighbour each side when there is one.
    if (from === index && index > 0) from--;
    if (to === index && index < this.raw.length - 1) to++;
    const window = this.raw.slice(from, to + 1);

    const sx = slope(window, (s) => s.x);
    const sy = slope(window, (s) => s.y);
    const poseSpeed = Math.hypot(sx, sy);

    const reported = window.filter(
      (s) => s.vx !== undefined && s.vy !== undefined,
    );
    const speed =
      reported.length > 0
        ? mean(reported.map((s) => Math.hypot(s.vx!, s.vy!)))
        : poseSpeed;

    const omegas = window.filter((s) => s.omega !== undefined);
    const turnRate =
      omegas.length > 0
        ? mean(omegas.map((s) => s.omega!))
        : slope(window, (s) => s.heading);

    return {
      t: centre.t,
      x: centre.x,
      y: centre.y,
      heading: centre.heading,
      speed,
      vx: sx,
      vy: sy,
      turnRate,
      travelAngle:
        poseSpeed >= MIN_SPEED_FOR_DIRECTION
          ? wrapAngle(Math.atan2(sy, sx) - centre.heading)
          : null,
      busy: centre.busy,
      cx: centre.cx,
      cy: centre.cy,
      tx: centre.tx,
      ty: centre.ty,
      pathIndex: centre.pathIndex,
    };
  }

  /** Drops poses too old to be in any window still to come. */
  private trim() {
    if (this.next === 0) return;
    const keepFrom = this.raw[this.next].t - 2 * this.halfWindow;
    let drop = 0;
    while (drop < this.next - 1 && this.raw[drop].t < keepFrom) drop++;
    if (drop > 0) {
      this.raw.splice(0, drop);
      this.next -= drop;
    }
  }
}
