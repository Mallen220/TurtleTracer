// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Finds the moments in the robot's motion that reveal one of its settings:
// holding a steady speed (top speed), speeding up from rest (acceleration),
// coming to a stop (deceleration and braking) and turning in place at a
// steady rate (angular velocity). Each drive from rest to rest is looked at
// once it ends.

import type { MotionSample } from "./samples";
import type { CornerEvent } from "./corners";
import { fitBraking } from "./brakingFit";

/** Holding a steady speed. */
export interface CruiseEvent {
  kind: "cruise";
  t: number;
  /** in/s */
  speed: number;
  duration: number;
  /** Which way the robot drove relative to the way it faced. */
  direction: "forward" | "strafe" | "diagonal";
  busy?: boolean;
}

/** Speeding up from rest to a steady speed. */
export interface LaunchEvent {
  kind: "launch";
  t: number;
  /** The steady speed reached, in/s. */
  topSpeed: number;
  /**
   * The constant acceleration (in/s²) that would lose the same time getting
   * up to speed, which is how the simulation models it.
   */
  acceleration: number;
}

/** Coming to a stop. */
export interface StopEvent {
  kind: "stop";
  t: number;
  /** The speed braking started from, in/s. */
  fromSpeed: number;
  /** The constant deceleration (in/s²) that best fits the stop. */
  deceleration: number;
  /** Speed (in/s) and distance still to go (in) through the stop. */
  points: { speed: number; distance: number }[];
  busy?: boolean;
}

/** Turning in place at a steady rate. */
export interface TurnEvent {
  kind: "turn";
  t: number;
  /** rad/s, always positive. */
  rate: number;
  duration: number;
}

export type MotionEvent =
  | CruiseEvent
  | LaunchEvent
  | StopEvent
  | TurnEvent
  | CornerEvent;

/** Below this (in/s) the robot is at rest. */
const REST_SPEED = 1;
/** Above this (in/s) a drive has started. */
const START_SPEED = 3;
/** Rest this long (s) before a drive makes it a launch from a standstill. */
const MIN_REST = 0.1;
/** A steady speed stays within this share of its mean. */
const STEADY_BAND = 0.03;
const MIN_CRUISE_TIME = 0.2;
const MIN_CRUISE_SPEED = 10;
/** The share of the steady speed the ramp is fitted between to find where a launch started. */
const RAMP_FIT = [0.1, 0.5] as const;
/** How well a stop's distances must fit a braking curve to count as one braking. */
const MIN_STOP_FIT = 0.95;
/** Braking starts where the speed falls below this share of the peak before the stop. */
const BRAKING_START = 0.97;
/** Slowing faster than this (in/s²) is braking; measured over `RATE_SPAN` seconds. */
const MIN_BRAKING_RATE = 5;
const RATE_SPAN = 0.1;
/** Speeds dropping by less than this (in/s) between samples still count as slowing. */
const SLOWING_NOISE = 0.3;
/** Braking points slower than this (in/s) are creep at the end of the stop. */
const MIN_BRAKING_POINT_SPEED = 2;
/** cos/sin of the travel angle past which a drive is forward or sideways (about 25°). */
const DIRECTION_SHARE = 0.9;
/** Turning in place means slower than this (in/s). */
const IN_PLACE_SPEED = 3;
/** Above this (rad/s) the robot is turning. */
const TURN_START = 0.3;
const MIN_TURN_TIME = 0.15;
/** Long drives are cut here so memory stays bounded. */
const MAX_DRIVE_SAMPLES = 3000;

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

function directionOf(angles: number[]): CruiseEvent["direction"] {
  if (angles.length === 0) return "diagonal";
  const cos = median(angles.map((a) => Math.abs(Math.cos(a))));
  const sin = median(angles.map((a) => Math.abs(Math.sin(a))));
  if (cos >= DIRECTION_SHARE) return "forward";
  if (sin >= DIRECTION_SHARE) return "strafe";
  return "diagonal";
}

/** Stretches of `values` that hold steady for at least `minTime` seconds. */
function steadyRuns(
  samples: MotionSample[],
  value: (s: MotionSample) => number,
  minValue: number,
  minTime: number,
): { from: number; to: number; mean: number }[] {
  const runs: { from: number; to: number; mean: number }[] = [];
  let from = 0;
  while (from < samples.length) {
    if (value(samples[from]) < minValue) {
      from++;
      continue;
    }
    let lo = value(samples[from]);
    let hi = lo;
    let to = from;
    while (to + 1 < samples.length) {
      const v = value(samples[to + 1]);
      const nextLo = Math.min(lo, v);
      const nextHi = Math.max(hi, v);
      if (nextHi - nextLo > STEADY_BAND * (nextHi + nextLo)) break;
      lo = nextLo;
      hi = nextHi;
      to++;
    }
    if (samples[to].t - samples[from].t >= minTime) {
      // The median, so the ends of the ramps either side don't pull it down.
      const values = samples.slice(from, to + 1).map(value);
      runs.push({ from, to, mean: median(values) });
      from = to + 1;
    } else {
      from++;
    }
  }
  return runs;
}

/** Distance travelled up to each sample, from integrating the smoothed speed. */
function distancesOf(samples: MotionSample[]): number[] {
  const distances = [0];
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].t - samples[i - 1].t;
    distances.push(
      distances[i - 1] + ((samples[i].speed + samples[i - 1].speed) / 2) * dt,
    );
  }
  return distances;
}

/**
 * Speeding up from rest to the first steady speed v. A constant acceleration
 * `a` loses v / (2a) seconds against already being at speed, so the time lost
 * gives the acceleration that makes the simulation take as long as the robot.
 * The start is where the early part of the speed ramp extends back to zero,
 * since smoothing blurs the moment the robot leaves rest.
 */
function launchOf(
  samples: MotionSample[],
  cruise: { from: number; to: number; mean: number },
): LaunchEvent | null {
  const v = cruise.mean;
  const rise = samples.slice(0, cruise.from + 1);
  const speedingUp = rise.every(
    (s, i) => i === 0 || s.speed >= rise[i - 1].speed - SLOWING_NOISE,
  );
  if (!speedingUp) return null;

  const ramp = rise.filter(
    (s) => s.speed >= RAMP_FIT[0] * v && s.speed <= RAMP_FIT[1] * v,
  );
  if (ramp.length < 2) return null;
  const n = ramp.length;
  const meanT = ramp.reduce((sum, s) => sum + s.t, 0) / n;
  const meanV = ramp.reduce((sum, s) => sum + s.speed, 0) / n;
  let num = 0;
  let den = 0;
  for (const s of ramp) {
    num += (s.t - meanT) * (s.speed - meanV);
    den += (s.t - meanT) ** 2;
  }
  if (!(num > 0 && den > 0)) return null;
  const start = meanT - meanV / (num / den);

  // Time lost against cruising at v, from the start to the middle of the cruise.
  const mid = (cruise.from + cruise.to) >> 1;
  let lost = 0;
  for (let i = 1; i <= mid; i++) {
    const t0 = Math.max(samples[i - 1].t, start);
    const t1 = samples[i].t;
    if (t1 <= t0) continue;
    const average = (samples[i - 1].speed + samples[i].speed) / 2;
    lost += (t1 - t0) * (1 - average / v);
  }
  if (!(lost > 0)) return null;
  return {
    kind: "launch",
    t: start,
    topSpeed: v,
    acceleration: v / (2 * lost),
  };
}

/** Everything a drive from rest to rest (or part of one) reveals. */
function analyzeDrive(
  samples: MotionSample[],
  fromRest: boolean,
  endsAtRest: boolean,
): MotionEvent[] {
  if (samples.length < 3) return [];
  const events: MotionEvent[] = [];
  const distances = distancesOf(samples);
  const cruises = steadyRuns(
    samples,
    (s) => s.speed,
    MIN_CRUISE_SPEED,
    MIN_CRUISE_TIME,
  );

  for (const run of cruises) {
    const part = samples.slice(run.from, run.to + 1);
    events.push({
      kind: "cruise",
      t: samples[run.from].t,
      speed: run.mean,
      duration: samples[run.to].t - samples[run.from].t,
      direction: directionOf(
        part.flatMap((s) => (s.travelAngle === null ? [] : [s.travelAngle])),
      ),
      busy: samples[run.from].busy,
    });
  }

  const launch = fromRest && cruises[0] && launchOf(samples, cruises[0]);
  if (launch) events.push(launch);

  // Stop: from the last peak down to rest. Each point gives the distance
  // still to go at that speed, which is what a braking model predicts.
  if (endsAtRest) {
    // Back from the end while the robot is braking (or creeping at the end):
    // not through a cruise, or a gentler slow-down such as a chained corner.
    const end = samples.length - 1;
    let peak = end;
    while (peak > 0) {
      let before = peak - 1;
      while (before > 0 && samples[peak].t - samples[before].t < RATE_SPAN) {
        before--;
      }
      const rate =
        (samples[before].speed - samples[peak].speed) /
        Math.max(1e-6, samples[peak].t - samples[before].t);
      const creeping = samples[peak].speed < MIN_BRAKING_POINT_SPEED;
      if (!creeping && rate < MIN_BRAKING_RATE) break;
      peak--;
    }
    // The braking rate is measured over a span, so the start can be a little
    // past the top: start where it falls below the top.
    let top = 0;
    for (let i = peak; i <= end; i++) top = Math.max(top, samples[i].speed);
    while (peak < end && samples[peak + 1].speed >= BRAKING_START * top) peak++;
    const points: StopEvent["points"] = [];
    for (let i = peak; i <= end; i++) {
      if (samples[i].speed < MIN_BRAKING_POINT_SPEED) continue;
      points.push({
        speed: samples[i].speed,
        distance: distances[end] - distances[i],
      });
    }
    // Constant deceleration b: distance = v² / (2b), fitted through the origin.
    let num = 0;
    let den = 0;
    for (const p of points) {
      num += p.speed * p.speed * p.distance;
      den += p.speed ** 4;
    }
    const fromSpeed = top;
    // A stop is one braking, on one path: not a slow-down through a chained
    // corner followed by a stop, which reads as a very gentle brake.
    const paths = new Set(
      samples
        .slice(peak)
        .flatMap((x) => (x.pathIndex === undefined ? [] : [x.pathIndex])),
    );
    const braking =
      paths.size <= 1 &&
      points.length >= 3 &&
      fitBraking(points).fit >= MIN_STOP_FIT;
    if (braking && num > 0 && fromSpeed >= MIN_CRUISE_SPEED) {
      events.push({
        kind: "stop",
        t: samples[peak].t,
        fromSpeed,
        deceleration: den / (2 * num),
        points,
        busy: samples[peak].busy,
      });
    }
  }

  return events;
}

/** The steady rate of a turn in place, if it held one. */
function analyzeTurn(samples: MotionSample[]): TurnEvent | null {
  const runs = steadyRuns(
    samples,
    (s) => Math.abs(s.turnRate),
    TURN_START,
    MIN_TURN_TIME,
  );
  const [first, ...rest] = runs;
  if (!first) return null;
  const best = rest.reduce((a, b) => (b.mean > a.mean ? b : a), first);
  return {
    kind: "turn",
    t: samples[best.from].t,
    rate: best.mean,
    duration: samples[best.to].t - samples[best.from].t,
  };
}

/**
 * Watches smoothed samples as they come and reports events when each drive
 * or turn ends.
 */
export class EventDetector {
  private drive: MotionSample[] = [];
  private driveFromRest = false;
  private lastRest: MotionSample | null = null;
  private restSince: number | null = null;
  private turn: MotionSample[] = [];

  constructor(private readonly onEvent: (event: MotionEvent) => void) {}

  push(sample: MotionSample) {
    this.trackDrive(sample);
    this.trackTurn(sample);
  }

  /** The stream broke (gap or relocalization): finish what can be finished. */
  breakStream() {
    if (this.drive.length > 0) {
      this.emit(analyzeDrive(this.drive, this.driveFromRest, false));
    }
    this.drive = [];
    this.turn = [];
    this.lastRest = null;
    this.restSince = null;
  }

  private emit(events: MotionEvent[]) {
    for (const e of events) this.onEvent(e);
  }

  private trackDrive(sample: MotionSample) {
    if (this.drive.length === 0) {
      if (sample.speed < START_SPEED) {
        if (sample.speed < REST_SPEED) {
          this.restSince ??= sample.t;
          this.lastRest = sample;
        } else if (this.lastRest === null) {
          this.restSince = null;
        }
        return;
      }
      this.driveFromRest =
        this.lastRest !== null &&
        this.restSince !== null &&
        this.lastRest.t - this.restSince >= MIN_REST;
      this.drive = this.lastRest ? [this.lastRest, sample] : [sample];
      this.lastRest = null;
      this.restSince = null;
      return;
    }

    this.drive.push(sample);
    if (sample.speed < REST_SPEED) {
      this.emit(analyzeDrive(this.drive, this.driveFromRest, true));
      this.drive = [];
      this.restSince = sample.t;
      this.lastRest = sample;
    } else if (this.drive.length >= MAX_DRIVE_SAMPLES) {
      this.emit(analyzeDrive(this.drive, this.driveFromRest, false));
      this.drive = [sample];
      this.driveFromRest = false;
    }
  }

  private trackTurn(sample: MotionSample) {
    const turning =
      Math.abs(sample.turnRate) >= TURN_START && sample.speed < IN_PLACE_SPEED;
    if (turning) {
      // A turn the other way is a new turn.
      const last = this.turn.at(-1);
      if (last && Math.sign(last.turnRate) !== Math.sign(sample.turnRate)) {
        this.finishTurn();
      }
      this.turn.push(sample);
      if (this.turn.length >= MAX_DRIVE_SAMPLES) this.finishTurn();
    } else if (this.turn.length > 0) {
      this.finishTurn();
    }
  }

  private finishTurn() {
    const event = analyzeTurn(this.turn);
    if (event) this.onEvent(event);
    this.turn = [];
  }
}
