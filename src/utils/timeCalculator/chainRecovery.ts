// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// What a robot does where one chained path hands over to the next.
//
// Pedro Pathing has no speed limit for corners. A chained path is handed over
// as soon as the robot's predicted stopping point reaches the end of the
// current path, and the robot keeps full power along the new path's tangent.
// Its momentum doesn't turn with the path, so it swings wide and is pulled
// back by the translational correction. This simulates that, as a point mass,
// from the moment of handover until the robot is back on the new path. If it
// runs out of path first it holds the end point, as the follower does. What
// is left between it and the path at the end is crossed, never jumped: at the
// robot's own speed, or at its top speed if it never got back.
import type { BasePoint, Settings } from "../../types";
import { DEFAULT_SETTINGS } from "../../config/defaults";
import { brakingDistance } from "./braking";
import { Track, newClosest } from "./recoveryTrack";

/** Turns smaller than this are driven straight through. */
export const RECOVERY_MIN_TURN_DEGREES = 10;

/** Pedro's default translational P gain, in motor power per inch of error. */
export const DEFAULT_TRANSLATIONAL_P = DEFAULT_SETTINGS.translationalP!;
/**
 * The smallest P the simulation uses. A robot with no correction at all can't
 * follow a path, so a gain of zero is treated as this.
 */
export const MIN_TRANSLATIONAL_P = 0.01;
/**
 * The largest P the simulation uses. Correction power is already full at one
 * inch of error with a gain of 1, so a larger one changes nothing a robot could
 * show, while at very large values the simulation's own time step starts to
 * produce artifacts. Anything above this is treated as this.
 */
export const MAX_TRANSLATIONAL_P = 1;
/**
 * With no power, the robot slows down on its own (friction and its motors
 * braking). At its top speed this is this share of its maximum deceleration.
 * It is what damps the correction, so a stronger one doesn't just ring.
 */
const NATURAL_DECELERATION_SHARE = 0.8;
/** Errors smaller than this aren't corrected (Pedro's `minCorrectionDistance`). */
const MIN_CORRECTION = 1e-3;
const TIME_STEP = 0.02;
const MAX_TIME = 8;
/** Largest gap (inches) closed between where the robot ends and the path. */
const MAX_BLEND = 5;
/** The most of the robot's top speed spent closing that gap unnoticed. */
const MAX_BLEND_SPEED = 0.3;
/** Holding the end of the path: close enough, and (nearly) still. */
const HOLD_DISTANCE = 0.75;
const HOLD_SPEED = 2;
/** The slowest a robot back on the path crosses what's left of the gap. */
const MIN_CROSSING_SPEED = HOLD_SPEED;
/** How much of critical damping the hold uses (1 settles without overshoot). */
const HOLD_DAMPING = 0.8;
/**
 * Back on the path: close enough (Pedro's own tolerance before it puts
 * correcting ahead of driving), and no longer moving quickly sideways. A robot
 * following a curve always lags it a little, so this can't be much tighter.
 */
const REJOIN_DISTANCE = 2.5;
const REJOIN_SIDEWAYS_SPEED = 6;
/** Starting this far (inches) to one side of the path counts as being on that side. */
const SIDE_MIN = 0.5;
/** Going back past the start only counts while within this many steps of it. */
const START_STEPS = 1.5;

interface Vec {
  x: number;
  y: number;
}

export interface RecoveryInput {
  /** Where the robot is when the path it is on is handed over. */
  position: Vec;
  /** Its velocity then, in in/s. */
  velocity: Vec;
  /** The new path, at its step boundaries (the start first). */
  path: BasePoint[];
  settings: Settings;
  /**
   * Whether the robot has to stop at the end of the new path (no path is
   * chained after it), so it brakes for it rather than driving on.
   */
  brakeAtEnd?: boolean;
}

/** The result of one recovery. Results are shared between timelines: read only. */
export interface RecoveryResult {
  /** Seconds taken to get back on the path. */
  readonly duration: number;
  /** Sampled every time step, from the handover. */
  readonly time: readonly number[];
  readonly x: readonly number[];
  readonly y: readonly number[];
  readonly speed: readonly number[];
  /** Where the robot is along the new path at each sample, in steps. */
  readonly along: readonly number[];
  /** Step boundary of the new path the robot rejoins at. */
  readonly rejoinStep: number;
  /** Speed along the new path when it rejoins. */
  readonly rejoinSpeed: number;
  /**
   * How close the robot gets to where the two paths join (the start of the
   * new path), in inches. A robot handed over early cuts the corner and may
   * never reach it.
   */
  readonly junctionMiss: number;
  /** How far the robot is from the new path when it is handed over. */
  readonly startOffset: number;
  /**
   * How far the robot swings past the new path (or back behind its start)
   * before settling, in inches. Zero if it never gets past it.
   */
  readonly overshoot: number;
  /** Whether it got back on the path, rather than running out of time. */
  readonly settled: boolean;
}

/** The translational P to use: kept within what the simulation can stand. */
export function effectiveTranslationalP(settings: Settings): number {
  const gain = settings.translationalP ?? DEFAULT_TRANSLATIONAL_P;
  if (Number.isNaN(gain)) return DEFAULT_TRANSLATIONAL_P;
  return Math.min(MAX_TRANSLATIONAL_P, Math.max(MIN_TRANSLATIONAL_P, gain));
}

/**
 * The simulation itself. It runs for every chained corner each time a path is
 * timed, so it works on plain numbers and reused objects, not new ones.
 */
class Recovery {
  private readonly track: Track;
  private readonly settings: Settings;
  private readonly brakeAtEnd: boolean;
  private readonly path: BasePoint[];
  private readonly lastStep: number;
  private readonly end: BasePoint;

  private readonly maxSpeed: number;
  private readonly accelerate: number;
  private readonly decelerate: number;
  private readonly drag: number;
  private readonly kP: number;

  // The robot.
  private px: number;
  private py: number;
  private vx: number;
  private vy: number;

  // Where it is on the path: the closest point to it, and to its projected stop.
  private readonly here = newClosest();
  private readonly ahead = newClosest();
  private trackU = 0;
  private projectedU = 0;

  // What the controller asks for, as power in each direction (at most 1 overall).
  private powerX = 0;
  private powerY = 0;

  private holding = false;
  private settled = false;

  // How the recovery is judged.
  private readonly startOffset: number;
  private readonly startSide: number;
  private readonly firstTx: number;
  private readonly firstTy: number;
  private readonly startBehind: number;
  private overshoot = 0;
  private junctionMiss: number;

  // What it records.
  private readonly time = [0];
  private readonly xs: number[];
  private readonly ys: number[];
  private readonly speeds: number[];
  private readonly alongs: number[] = [];

  constructor(input: RecoveryInput) {
    const { settings } = input;
    this.settings = settings;
    this.path = input.path;
    this.brakeAtEnd = input.brakeAtEnd === true;
    this.track = new Track(input.path);
    this.lastStep = input.path.length - 1;
    this.end = input.path[this.lastStep];

    this.maxSpeed = settings.maxVelocity || 100;
    this.accelerate = settings.maxAcceleration || 30;
    this.decelerate = settings.maxDeceleration || this.accelerate;
    this.drag = (NATURAL_DECELERATION_SHARE * this.decelerate) / this.maxSpeed;
    this.kP = effectiveTranslationalP(settings);

    this.px = input.position.x;
    this.py = input.position.y;
    this.vx = input.velocity.x;
    this.vy = input.velocity.y;
    this.xs = [this.px];
    this.ys = [this.py];
    this.speeds = [Math.hypot(this.vx, this.vy)];

    this.track.closest(this.px, this.py, 0, this.here);
    this.alongs.push(this.here.u);

    // The way the path leaves its start (control points sitting on the start
    // don't say which way that is).
    const first = input.path[0];
    const leaving = input.path.find(
      (p) => Math.hypot(p.x - first.x, p.y - first.y) > 1e-6,
    );
    const size = leaving
      ? Math.hypot(leaving.x - first.x, leaving.y - first.y)
      : 1;
    this.firstTx = leaving ? (leaving.x - first.x) / size : this.here.tx;
    this.firstTy = leaving ? (leaving.y - first.y) / size : this.here.ty;

    // Which side of the path the robot starts on; swinging to the other side
    // is overshoot.
    const startSigned = this.sideOf(this.px, this.py, this.here);
    this.startOffset = Math.abs(startSigned);
    this.startSide = this.startOffset > SIDE_MIN ? Math.sign(startSigned) : 0;
    this.startBehind = this.behindStart(this.px, this.py);
    this.junctionMiss = Math.hypot(this.px - first.x, this.py - first.y);
  }

  run(): RecoveryResult {
    for (let t = TIME_STEP; t <= MAX_TIME; t += TIME_STEP) {
      this.locate();
      if (this.backOnPath() || this.holdingStill()) {
        this.settled = true;
        break;
      }
      if (this.holding) this.holdPower();
      else this.followPower();
      this.move();
      this.record(t);
    }
    return this.finish();
  }

  /** How far to the left of the path (its normal is its tangent turned left). */
  private sideOf(
    x: number,
    y: number,
    on: { x: number; y: number; tx: number; ty: number },
  ) {
    return (x - on.x) * -on.ty + (y - on.y) * on.tx;
  }

  /** How far back from the start of the path a point is, along its direction. */
  private behindStart(x: number, y: number) {
    const first = this.path[0];
    return Math.max(
      0,
      -((x - first.x) * this.firstTx + (y - first.y) * this.firstTy),
    );
  }

  /** Works out where the robot is on the path, and how its swing is going. */
  private locate() {
    const { here } = this;
    this.track.closest(this.px, this.py, this.trackU, here);
    this.trackU = here.u;
    if (this.startSide !== 0) {
      this.overshoot = Math.max(
        this.overshoot,
        -this.startSide * this.sideOf(this.px, this.py, here),
      );
    }
    // Going back past the start only counts while still at the start of the
    // path; a path that leaves its start in one direction and comes back the
    // other way would otherwise count the whole of it.
    if (here.u < START_STEPS) {
      this.overshoot = Math.max(
        this.overshoot,
        this.behindStart(this.px, this.py) - this.startBehind,
      );
    }
  }

  /** Whether the robot is back on the path and moving along it. */
  private backOnPath() {
    const { here } = this;
    const off = Math.hypot(this.px - here.x, this.py - here.y);
    const along = this.vx * here.tx + this.vy * here.ty;
    const sideways = this.vx * -here.ty + this.vy * here.tx;
    return (
      off < REJOIN_DISTANCE &&
      Math.abs(sideways) < REJOIN_SIDEWAYS_SPEED &&
      along >= 0
    );
  }

  /** Whether the robot, out of path, has come to rest at the end point. */
  private holdingStill() {
    if (this.here.u >= this.lastStep - 1e-6) this.holding = true;
    return (
      this.holding &&
      Math.hypot(this.end.x - this.px, this.end.y - this.py) < HOLD_DISTANCE &&
      Math.hypot(this.vx, this.vy) < HOLD_SPEED
    );
  }

  /** Pull toward the end point, damped so it settles instead of circling it. */
  private holdPower() {
    const damping = HOLD_DAMPING * (2 * Math.sqrt(this.kP / this.accelerate));
    this.powerX = (this.end.x - this.px) * this.kP - this.vx * damping;
    this.powerY = (this.end.y - this.py) * this.kP - this.vy * damping;
    const size = Math.hypot(this.powerX, this.powerY);
    if (size > 1) {
      this.powerX /= size;
      this.powerY /= size;
    }
  }

  /**
   * Pull back onto the path, then drive along it with whatever power is left:
   * forwards, or braking once the robot has to start slowing down to stop at
   * the end.
   */
  private followPower() {
    const { here, ahead, track } = this;
    const nx = -here.ty;
    const ny = here.tx;
    const along = this.vx * here.tx + this.vy * here.ty;
    const side = this.vx * nx + this.vy * ny;

    // Where the robot would come to rest if it braked from here. Pedro works
    // this out for each of the robot's axes separately, so sideways speed only
    // adds sideways displacement however fast the robot is going along the
    // path. The path's own directions stand in for the robot's axes.
    const alongStop =
      Math.sign(along) * brakingDistance(Math.abs(along), this.settings);
    const sideStop =
      Math.sign(side) * brakingDistance(Math.abs(side), this.settings);
    const projX = this.px + here.tx * alongStop + nx * sideStop;
    const projY = this.py + here.ty * alongStop + ny * sideStop;

    track.closest(projX, projY, this.projectedU, ahead);
    this.projectedU = ahead.u;
    const aheadNx = -ahead.ty;
    const aheadNy = ahead.tx;
    const miss = (ahead.x - projX) * aheadNx + (ahead.y - projY) * aheadNy;
    const pull =
      Math.abs(miss) < MIN_CORRECTION
        ? 0
        : Math.max(-1, Math.min(1, miss * this.kP));
    this.powerX = aheadNx * pull;
    this.powerY = aheadNy * pull;

    const braking =
      this.brakeAtEnd &&
      track.total - track.distanceAt(here.u) <=
        brakingDistance(Math.max(0, along), this.settings);
    if (braking || along < this.maxSpeed) {
      const dirX = braking ? -ahead.tx : ahead.tx;
      const dirY = braking ? -ahead.ty : ahead.ty;
      // Largest s in [0, 1] keeping |power + s * d| within 1.
      const b = 2 * (this.powerX * dirX + this.powerY * dirY);
      const c = this.powerX * this.powerX + this.powerY * this.powerY - 1;
      const s = Math.min(1, (-b + Math.sqrt(Math.max(0, b * b - 4 * c))) / 2);
      if (s > 0) {
        this.powerX += dirX * s;
        this.powerY += dirY * s;
      }
    }
  }

  /** Turns the power asked for into movement over one time step. */
  private move() {
    const { accelerate, decelerate } = this;
    const speed = Math.hypot(this.vx, this.vy);

    // Speeding up and slowing down differ.
    let ax: number;
    let ay: number;
    if (speed > 1e-6) {
      const dirX = this.vx / speed;
      const dirY = this.vy / speed;
      const inLine = this.powerX * dirX + this.powerY * dirY;
      const sideX = this.powerX - inLine * dirX;
      const sideY = this.powerY - inLine * dirY;
      const lineAccel = inLine * (inLine >= 0 ? accelerate : decelerate);
      ax = dirX * lineAccel + sideX * accelerate;
      ay = dirY * lineAccel + sideY * accelerate;
    } else {
      ax = this.powerX * accelerate;
      ay = this.powerY * accelerate;
    }

    let netX = ax - this.drag * this.vx;
    let netY = ay - this.drag * this.vy;
    // Friction helps the brakes, but the robot still can't slow down faster
    // than its maximum deceleration.
    if (speed > 1e-6) {
      const slowing = -(netX * this.vx + netY * this.vy) / speed;
      if (slowing > decelerate) {
        const excess = slowing - decelerate;
        netX += (excess * this.vx) / speed;
        netY += (excess * this.vy) / speed;
      }
    }
    this.vx += netX * TIME_STEP;
    this.vy += netY * TIME_STEP;
    const newSpeed = Math.hypot(this.vx, this.vy);
    if (newSpeed > this.maxSpeed) {
      this.vx = (this.vx / newSpeed) * this.maxSpeed;
      this.vy = (this.vy / newSpeed) * this.maxSpeed;
    }
    this.px += this.vx * TIME_STEP;
    this.py += this.vy * TIME_STEP;
  }

  private record(t: number) {
    const first = this.path[0];
    this.junctionMiss = Math.min(
      this.junctionMiss,
      Math.hypot(this.px - first.x, this.py - first.y),
    );
    this.alongs.push(this.here.u);
    this.time.push(t);
    this.xs.push(this.px);
    this.ys.push(this.py);
    this.speeds.push(Math.hypot(this.vx, this.vy));
  }

  /** Ends the recovery on the path, without a jump, and gives the result. */
  private finish(): RecoveryResult {
    const { time, xs, ys, here } = this;
    const rejoinStep = Math.min(
      Math.max(0, Math.round(here.u)),
      this.lastStep - 1,
    );
    const rejoin = this.path[rejoinStep];

    // A gap that can't be closed quietly over the time the recovery took (a
    // robot that never got back onto the path, or a recovery over in an
    // instant, ending to one side of it) is crossed, not jumped. A robot back
    // on the path crosses it at the speed it's going and carries that speed
    // on, so its speed doesn't jump either; one that never got back is
    // brought across at its top speed.
    const gap = Math.hypot(rejoin.x - this.px, rejoin.y - this.py);
    if (
      gap > MAX_BLEND ||
      gap > MAX_BLEND_SPEED * this.maxSpeed * time.at(-1)!
    ) {
      const speed = this.settled
        ? Math.max(Math.hypot(this.vx, this.vy), MIN_CROSSING_SPEED)
        : this.maxSpeed;
      const glideSteps = Math.ceil(gap / (speed * TIME_STEP));
      for (let k = 1; k <= glideSteps; k++) {
        const share = k / glideSteps;
        time.push(time.at(-1)! + TIME_STEP);
        xs.push(this.px + (rejoin.x - this.px) * share);
        ys.push(this.py + (rejoin.y - this.py) * share);
        this.speeds.push(speed);
        this.alongs.push(here.u);
      }
      if (!this.settled) {
        this.vx = ((rejoin.x - this.px) / gap) * this.maxSpeed;
        this.vy = ((rejoin.y - this.py) / gap) * this.maxSpeed;
      }
    }

    // End exactly where the path is picked up: what is left of the gap (under
    // a step) is spread over the whole recovery, so the next path starts from
    // the robot's position without a jump in speed.
    const duration = time.at(-1)!;
    const endX = rejoin.x - xs.at(-1)!;
    const endY = rejoin.y - ys.at(-1)!;
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
      speed: this.speeds,
      along: this.alongs,
      rejoinStep,
      rejoinSpeed: Math.max(0, this.vx * here.tx + this.vy * here.ty),
      junctionMiss: this.junctionMiss,
      startOffset: this.startOffset,
      overshoot: this.overshoot,
      settled: this.settled,
    };
  }
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
 *   its motion), less a little friction.
 */
export function simulateRecovery(input: RecoveryInput): RecoveryResult {
  return new Recovery(input).run();
}
