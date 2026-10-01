// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// What a robot does where one chained path hands over to the next.
//
// Pedro Pathing has no speed limit for corners. A chained path is handed over
// as soon as the robot's predicted stopping point reaches the end of the
// current path, and the robot keeps full power along the new path's tangent.
// Its momentum doesn't turn with the path, so it swings wide and is pulled
// back by the translational correction. This simulates that, as a point mass,
// from the moment of handover until the robot is back on the new path.
import type { BasePoint, Settings } from "../../types";

/** Turns smaller than this are driven straight through. */
export const RECOVERY_MIN_TURN_DEGREES = 10;

/** Pedro's default translational P gain, in motor power per inch of error. */
const TRANSLATIONAL_P = 0.1;
/** Errors smaller than this aren't corrected (Pedro's `minCorrectionDistance`). */
const MIN_CORRECTION = 1e-3;
const GRAVITY = 386.22; // in/s^2
const TIME_STEP = 0.02;
const MAX_TIME = 8;
/** Back on the path: close enough, and no longer moving sideways. */
const REJOIN_DISTANCE = 1;
const REJOIN_SIDEWAYS_SPEED = 2;
/**
 * How far ahead or behind the last closest point the path is searched. Pedro
 * tracks the closest point from where it was last, so it can't jump to a
 * distant part of a path that curves back near itself.
 */
const SEARCH_AHEAD = 12;
const SEARCH_BEHIND = 5;

interface Vec {
  x: number;
  y: number;
}

/**
 * The path the robot is steered back onto, sampled at evenly spaced steps,
 * with each segment's direction worked out once.
 */
class Track {
  readonly last: number;
  private readonly px: Float64Array;
  private readonly py: Float64Array;
  private readonly dx: Float64Array;
  private readonly dy: Float64Array;
  private readonly span: Float64Array;
  private readonly tx: Float64Array;
  private readonly ty: Float64Array;

  constructor(points: BasePoint[]) {
    const n = points.length;
    this.last = n - 2;
    this.px = new Float64Array(n);
    this.py = new Float64Array(n);
    this.dx = new Float64Array(n);
    this.dy = new Float64Array(n);
    this.span = new Float64Array(n);
    this.tx = new Float64Array(n);
    this.ty = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      this.px[i] = points[i].x;
      this.py[i] = points[i].y;
    }
    for (let i = 0; i < n - 1; i++) {
      const dx = this.px[i + 1] - this.px[i];
      const dy = this.py[i + 1] - this.py[i];
      const span = dx * dx + dy * dy;
      const size = Math.sqrt(span) || 1;
      this.dx[i] = dx;
      this.dy[i] = dy;
      this.span[i] = span;
      this.tx[i] = dx / size;
      this.ty[i] = dy / size;
    }
  }

  /**
   * Finds where the track is closest to (x, y), searching near `around` (in
   * steps), and writes it into `hit`.
   */
  closest(x: number, y: number, around: number, hit: Closest) {
    const from = Math.max(0, Math.floor(around) - SEARCH_BEHIND);
    const to = Math.min(this.last, Math.floor(around) + SEARCH_AHEAD);

    let bestU = from;
    let bestIndex = from;
    let bestDist = Infinity;
    for (let i = from; i <= to; i++) {
      const span = this.span[i];
      const rx = x - this.px[i];
      const ry = y - this.py[i];
      let f = span > 0 ? (rx * this.dx[i] + ry * this.dy[i]) / span : 0;
      f = f < 0 ? 0 : f > 1 ? 1 : f;
      const ex = rx - this.dx[i] * f;
      const ey = ry - this.dy[i] * f;
      const dist = ex * ex + ey * ey;
      if (dist < bestDist - 1e-9) {
        bestDist = dist;
        bestU = i + f;
        bestIndex = i;
      }
    }

    const f = bestU - bestIndex;
    hit.u = bestU;
    hit.x = this.px[bestIndex] + this.dx[bestIndex] * f;
    hit.y = this.py[bestIndex] + this.dy[bestIndex] * f;
    hit.tx = this.tx[bestIndex];
    hit.ty = this.ty[bestIndex];
  }
}

/** A closest point on the track; its normal is the tangent turned left. */
interface Closest {
  /** Position along the track, in steps (fractional). */
  u: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
}

const newClosest = (): Closest => ({ u: 0, x: 0, y: 0, tx: 0, ty: 0 });

export interface RecoveryInput {
  /** Where the robot is when the path it is on is handed over. */
  position: Vec;
  /** Its velocity then, in in/s. */
  velocity: Vec;
  /** The new path, at its step boundaries (the start first). */
  path: BasePoint[];
  settings: Settings;
}

export interface RecoveryResult {
  /** Seconds taken to get back on the path. */
  duration: number;
  /** Sampled every `TIME_STEP` seconds, from the handover. */
  time: number[];
  x: number[];
  y: number[];
  speed: number[];
  /** Step boundary of the new path the robot rejoins at. */
  rejoinStep: number;
  /** Speed along the new path when it rejoins. */
  rejoinSpeed: number;
  /** How far the robot is from the new path when it is handed over. */
  startOffset: number;
  /**
   * How far the robot swings past the new path (or back behind its start)
   * before settling, in inches. Zero if it never gets past it.
   */
  overshoot: number;
  /** Whether it got back on the path, rather than running out of time. */
  settled: boolean;
}

/**
 * Follows Pedro's control from the handover until the robot is back on the
 * new path and no longer moving sideways.
 *
 * - The translational correction acts on the *projected* pose, where the robot
 *   would stop if it braked now, pushing it back toward the path.
 * - Drive is full power along the new path's tangent until max speed, but only
 *   gets what the translational correction leaves free.
 * - Acceleration is the robot's acceleration (or deceleration when opposing
 *   its motion), and sideways acceleration is limited by grip.
 *
 * This runs for every chained corner each time a path is timed, so the loop
 * avoids allocating.
 */
export function simulateRecovery(input: RecoveryInput): RecoveryResult {
  const { settings } = input;
  const track = new Track(input.path);
  const maxSpeed = settings.maxVelocity || 100;
  const accelerate = settings.maxAcceleration || 30;
  const decelerate = settings.maxDeceleration || accelerate;
  const grip = settings.kFriction > 0 ? settings.kFriction * GRAVITY : Infinity;
  const lastStep = input.path.length - 1;

  let px = input.position.x;
  let py = input.position.y;
  let vx = input.velocity.x;
  let vy = input.velocity.y;
  let trackU = 0;
  let projectedU = 0;

  const time = [0];
  const xs = [px];
  const ys = [py];
  const speeds = [Math.hypot(vx, vy)];
  let settled = false;
  const here = newClosest();
  const ahead = newClosest();
  track.closest(px, py, 0, here);

  const first = input.path[0];
  const firstTx = here.tx;
  const firstTy = here.ty;
  // Which side of the path the robot starts on (the normal is the tangent
  // turned left); swinging to the other side is overshoot.
  const offsetFrom = (x: number, y: number, on: Closest) =>
    (x - on.x) * -on.ty + (y - on.y) * on.tx;
  const startSigned = offsetFrom(px, py, here);
  const startOffset = Math.abs(startSigned);
  const startSide = startOffset > 0.5 ? Math.sign(startSigned) : 0;
  // How far back from the start of the new path a point is (along its
  // direction); the robot may begin behind it, only going further is overshoot.
  const behindStart = (x: number, y: number) =>
    Math.max(0, -((x - first.x) * firstTx + (y - first.y) * firstTy));
  const startBehind = behindStart(px, py);
  let overshoot = 0;

  for (let t = TIME_STEP; t <= MAX_TIME; t += TIME_STEP) {
    track.closest(px, py, trackU, here);
    trackU = here.u;
    const nx = -here.ty;
    const ny = here.tx;
    const offTrack = Math.hypot(px - here.x, py - here.y);
    if (startSide !== 0) {
      overshoot = Math.max(
        overshoot,
        -startSide * ((px - here.x) * nx + (py - here.y) * ny),
      );
    }
    overshoot = Math.max(overshoot, behindStart(px, py) - startBehind);

    const speed = Math.hypot(vx, vy);
    const along = vx * here.tx + vy * here.ty;
    const sideways = vx * nx + vy * ny;
    if (
      offTrack < REJOIN_DISTANCE &&
      Math.abs(sideways) < REJOIN_SIDEWAYS_SPEED &&
      along >= 0
    ) {
      settled = true;
      break;
    }
    if (here.u >= lastStep - 1e-6) break;

    // Where the robot would come to rest if it braked from here.
    let projX = px;
    let projY = py;
    if (speed > 0) {
      const stop = (speed * speed) / (2 * decelerate);
      projX += (vx / speed) * stop;
      projY += (vy / speed) * stop;
    }
    track.closest(projX, projY, projectedU, ahead);
    projectedU = ahead.u;

    // Pull back onto the path, measured from the projected stopping point.
    const aheadNx = -ahead.ty;
    const aheadNy = ahead.tx;
    const miss = (ahead.x - projX) * aheadNx + (ahead.y - projY) * aheadNy;
    const pull =
      Math.abs(miss) < MIN_CORRECTION
        ? 0
        : Math.max(-1, Math.min(1, miss * TRANSLATIONAL_P));
    let powerX = aheadNx * pull;
    let powerY = aheadNy * pull;

    // Drive along the path with whatever power is left.
    if (along < maxSpeed) {
      // Largest s in [0, 1] keeping |power + s * d| within 1.
      const b = 2 * (powerX * ahead.tx + powerY * ahead.ty);
      const c = powerX * powerX + powerY * powerY - 1;
      const s = Math.min(1, (-b + Math.sqrt(Math.max(0, b * b - 4 * c))) / 2);
      if (s > 0) {
        powerX += ahead.tx * s;
        powerY += ahead.ty * s;
      }
    }

    // Power to acceleration: speeding up and slowing down differ, and grip
    // limits sideways acceleration.
    let ax: number;
    let ay: number;
    if (speed > 1e-6) {
      const dirX = vx / speed;
      const dirY = vy / speed;
      const inLine = powerX * dirX + powerY * dirY;
      const sideX = powerX - inLine * dirX;
      const sideY = powerY - inLine * dirY;
      const lineAccel = inLine * (inLine >= 0 ? accelerate : decelerate);
      const sideMagnitude = Math.hypot(sideX, sideY) * accelerate;
      const sideScale =
        sideMagnitude > grip && sideMagnitude > 0 ? grip / sideMagnitude : 1;
      ax = dirX * lineAccel + sideX * accelerate * sideScale;
      ay = dirY * lineAccel + sideY * accelerate * sideScale;
    } else {
      ax = powerX * accelerate;
      ay = powerY * accelerate;
    }

    vx += ax * TIME_STEP;
    vy += ay * TIME_STEP;
    const newSpeed = Math.hypot(vx, vy);
    if (newSpeed > maxSpeed) {
      vx = (vx / newSpeed) * maxSpeed;
      vy = (vy / newSpeed) * maxSpeed;
    }
    px += vx * TIME_STEP;
    py += vy * TIME_STEP;

    time.push(t);
    xs.push(px);
    ys.push(py);
    speeds.push(Math.hypot(vx, vy));
  }

  const duration = time.at(-1)!;
  const rejoinStep = Math.min(Math.max(0, Math.round(here.u)), lastStep - 1);
  // End exactly where the path is picked up: the gap (under a step) is spread
  // over the whole recovery, so the next path starts from the robot's position
  // without a jump in speed.
  const endX = input.path[rejoinStep].x - xs.at(-1)!;
  const endY = input.path[rejoinStep].y - ys.at(-1)!;
  for (let i = 0; i < time.length; i++) {
    const share = duration > 0 ? time[i] / duration : 1;
    xs[i] += endX * share;
    ys[i] += endY * share;
  }
  return {
    duration,
    time,
    x: xs,
    y: ys,
    speed: speeds,
    rejoinStep,
    rejoinSpeed: Math.max(0, vx * here.tx + vy * here.ty),
    startOffset,
    overshoot,
    settled,
  };
}
