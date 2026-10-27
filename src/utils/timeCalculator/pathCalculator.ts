// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Times a whole project: walks the sequence and builds the timeline of
// travel, turn-in-place, swing and wait events that playback and export use.
import type {
  Point,
  Line,
  Settings,
  TimePrediction,
  SequenceItem,
  TimelineEvent,
  Excursion,
  PiecewiseShortfall,
} from "../../types";
import {
  getCurvePoint,
  getEffectiveHeadingSource,
  getLineEndHeading,
  getLineStartHeading,
  interpolateTFromProfile,
  radiansToDegrees,
  transformAngle,
} from "../math";
import {
  calculateGlobalChainMeta,
  calculateEndHeadingAndRotation,
  continuesChain,
  hasGlobalHeading,
  travelDirections,
  travelTurn,
  cornerSpeedForTurn,
  type ChainInfo,
} from "./chainMeta";
import {
  CHAIN_STEPS,
  handoverStep,
  headingsAlong,
  idealHeadings,
  recoverFromHandover,
  runWideFromStep,
} from "./chainHandover";
import { RECOVERY_MIN_TURN_DEGREES, TURN_FIRST_DEGREES } from "./chainRecovery";
import { analyzePathSegment, unwrapAngle } from "./segmentAnalyzer";
import { startingHeading, stepsToRun } from "./startingHeading";
import { materializePrevHeadings } from "../prevHeading";
import type { PathAnalysis } from "./types";
import { speedAtAngle, stepSpeedScales } from "./directionalSpeed";
import {
  buildHeadingProfile,
  piecewiseShortfalls,
  turnToward,
} from "./headingProfile";
import { calculateRotationTime, turnFromRestTime } from "./rotation";
import { decelerationOf } from "./braking";
import { lateralLimit } from "./lateralLimit";
import { maxSpeedOf } from "./speedCap";
import { calculateMotionProfileDetailed } from "./motionProfile";
import { actionRegistry } from "../../lib/actionRegistry";
import { MAX_MACRO_DEPTH } from "../../config";

/**
 * Whether the robot's heading follows the direction the path goes, so that a
 * curved path makes it rotate.
 */
function turnsWithPath(line: Line, rootLine: Line | undefined): boolean {
  const { source } = getEffectiveHeadingSource(line, rootLine);
  if (source.heading === "tangential") return true;
  return (
    source.heading === "piecewise" &&
    (source.segments ?? []).some((segment) => segment.heading === "tangential")
  );
}

/**
 * A robot that leaves its path by less than this (inches) is taken to follow
 * it. It is Pedro's own tolerance before it puts getting back on the path
 * ahead of driving along it.
 */
const WIDE_MIN_OFFSET = 2.5;
/** Sideways acceleration demands past this (in/s²) are reported as this. */
const MAX_DEMAND = 1e6;
/** A bend ending within this many steps of the end of the path ends with the path. */
const WIDE_TAIL_STEPS = 4;

/** The motion of a robot along a path: when and how fast it is where, and which way it faces. */
interface Motion {
  total: number;
  /** Time at each step boundary. */
  motion: number[];
  velocities: number[];
  headings: number[];
  shortfalls: PiecewiseShortfall[] | undefined;
  /** The step the robot is back on the path at after leaving it, else where it started. */
  resumeStep: number;
  excursion?: Excursion;
  /** The most sideways acceleration the ideal path asks of the robot, in in/s². */
  peakDemand?: number;
}

/**
 * How much of the curve is left when Pedro counts a path as done and holds
 * its end: its parametricTConstraint.
 */
const PARAMETRIC_END = 0.025;
/** Pedro's headingConstraint (0.007 rad), in degrees: settled at the end. */
const HEADING_SETTLED_DEGREES = 0.4;

/**
 * The time the robot is `step` steps along, which may fall between two
 * boundaries: speeding up or slowing down evenly over the step it's in.
 */
function timeAtStep(
  motion: number[],
  velocities: number[],
  step: number,
): number {
  const i = Math.max(0, Math.min(Math.floor(step), motion.length - 2));
  const f = step - i;
  const dt = motion[i + 1] - motion[i];
  const v0 = velocities[i];
  const v1 = velocities[i + 1];
  // v² changes evenly with distance; time is distance over average speed.
  const vf = Math.sqrt(Math.max(0, v0 * v0 + f * (v1 * v1 - v0 * v0)));
  const share = v0 + vf > 1e-9 ? (f * (v0 + v1)) / (v0 + vf) : f;
  return motion[i] + Math.min(1, share) * dt;
}

/** `values` (one per step boundary) at `time`, by straight line between the boundaries either side. */
function valueAt(motion: number[], values: number[], time: number): number {
  let i = 0;
  while (i < motion.length - 2 && time > motion[i + 1]) i++;
  const span = motion[i + 1] - motion[i];
  const f = span > 0 ? Math.max(0, Math.min(1, (time - motion[i]) / span)) : 1;
  return values[i] + (values[i + 1] - values[i]) * f;
}

/** Where a trace has the robot `time` seconds in, by straight line between samples. */
function pointOnTrace(
  trace: Excursion["trace"],
  time: number,
): { x: number; y: number } {
  const { x, y } = trace;
  const after = trace.time.findIndex((t) => t > time);
  const i = Math.max(
    0,
    Math.min(after < 0 ? x.length - 2 : after - 1, x.length - 2),
  );
  const span = trace.time[i + 1] - trace.time[i];
  const f =
    span > 0 ? Math.max(0, Math.min(1, (time - trace.time[i]) / span)) : 0;
  return { x: x[i] + (x[i + 1] - x[i]) * f, y: y[i] + (y[i + 1] - y[i]) * f };
}

/** Options for one timing that aren't part of the robot's settings. */
export interface TimeOptions {
  /**
   * Whether chained paths are timed with the robot handed over early and
   * swinging wide at the corners. Turn off to time it following each path
   * exactly, slowing to turn the corners. On by default.
   */
  chainCorrection?: boolean;
}

/** Where along a chained path the robot picks it up, and how fast. */
interface Entry {
  step: number;
  speed: number;
}

/** Everything about one path that the steps of timing it share. */
interface PathContext {
  seq: SequenceItem[];
  idx: number;
  line: Line;
  prevPoint: Point;
  chains: Map<string, ChainInfo>;
  chainMeta: ChainInfo | undefined;
  rootLine: Line | undefined;
  /** Whether the path continues the one before it without a stop. */
  isChained: boolean;
  /** Whether the robot turns as it drives (rather than stopping to turn first). */
  turnsWhileDriving: boolean;
  /** The path chained straight after this one, if there is one. */
  nextLine: Line | undefined;
  /** How far the direction of travel turns where this path hands over. */
  junctionTurn: number;
  /** The fastest the robot may leave the end of this path. */
  exitLimit: number;
  /** The fastest the robot is driven on this path, in in/s. */
  maxSpeed: number;
  analysis: PathAnalysis;
  stepCount: number;
  endHeading: number;
  rotationTime: number;
  /** The step the robot picks the path up at, and its speed there. */
  startStep: number;
  entrySpeed: number;
  /**
   * How long the robot spends at the start shedding speed it still had the
   * other way when the path before it finished.
   */
  startDelay: number;
  isGlobalOverride: boolean;
  /** Whether the heading follows the path, so a curve makes the robot rotate. */
  followsTangent: boolean;
}

class TimelineBuilder {
  private readonly settings: Settings;
  private readonly lineById: Map<string, Line>;
  private readonly lineIndexById = new Map<string, number>();
  private readonly corrects: boolean;

  private readonly timeline: TimelineEvent[] = [];
  private readonly segmentLengths: number[] = [];
  private readonly segmentTimes: number[] = [];
  private currentTime = 0;
  private lastPoint: Point;
  private currentHeading: number;
  /**
   * How fast, and which way (degrees), the robot is still moving when the path
   * it finished let it go: Pedro starts the next step before it has stopped.
   */
  private carry: { speed: number; direction: number } | null = null;
  /** Where the robot was still finishing a path when Pedro let go of it. */
  private readonly lags: NonNullable<TimelineEvent["lag"]>[] = [];
  /** Turns at the end of a path that Pedro's timeout cut short, and where they were going. */
  private readonly holdTurns = new Map<TimelineEvent, number>();

  /** Where the robot picks up a chained path. Each is used once. */
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly startPoint: Point,
    private readonly lines: Line[],
    settings: Settings,
    private readonly sequence: SequenceItem[] | undefined,
    options: TimeOptions,
  ) {
    // A turn rate of zero would make every turn take forever.
    this.settings = {
      ...settings,
      aVelocity: Math.max(settings.aVelocity, 0.001),
    };
    this.corrects = options.chainCorrection !== false;
    this.lineById = new Map(lines.map((l) => [l.id!, l]));
    lines.forEach((l, i) => {
      if (!this.lineIndexById.has(l.id!)) this.lineIndexById.set(l.id!, i);
    });
    this.lastPoint = startPoint;
    this.currentHeading = startingHeading(startPoint, lines, sequence);
  }

  build(): TimePrediction {
    this.processSequence(stepsToRun(this.lines, this.sequence), 0);
    this.finishLastPath();
    // Each step takes the latest lag; a newer one carries what's left of it.
    this.lags.forEach((lag, i) => {
      const stop = Math.min(lag.until, this.lags[i + 1]?.from ?? Infinity);
      for (const event of this.timeline) {
        if (event.type === "macro") continue;
        if (event.startTime >= lag.from - 1e-9 && event.startTime < stop) {
          event.lag = lag;
        }
      }
    });
    return {
      totalTime: this.currentTime,
      segmentTimes: this.segmentTimes,
      totalDistance: this.segmentLengths.reduce(
        (sum, length) => sum + length,
        0,
      ),
      timeline: this.timeline,
    };
  }

  /**
   * Nothing follows the last path, so the robot holds its end until it is
   * there: the project takes until the robot has arrived, not until Pedro
   * would have moved on.
   */
  private finishLastPath() {
    const last = this.timeline.findLast((e) => e.type !== "macro");
    if (!last) return;
    let extra = 0;
    const target = this.holdTurns.get(last);
    if (target !== undefined) {
      // Turning in place to the end heading: it finishes the turn.
      const rate = radiansToDegrees(this.settings.aVelocity);
      const needs = Math.abs(target - (last.startHeading ?? target)) / rate;
      extra = needs - last.duration;
      if (extra > 1e-9) {
        last.targetHeading = target;
        this.currentHeading = target;
      }
    } else if (last.type === "travel" && last.motionProfile) {
      const arrives = last.startTime + Math.max(0, last.motionProfile.at(-1)!);
      extra = arrives - last.endTime;
    }
    if (extra <= 1e-9) return;
    const end = last.endTime;
    for (const event of this.timeline) {
      if (
        event === last ||
        (event.type === "macro" && event.endTime >= end - 1e-9)
      ) {
        event.endTime += extra;
        event.duration += extra;
      }
    }
    this.segmentTimes[this.segmentTimes.length - 1] += extra;
    this.currentTime += extra;
    this.lags.splice(
      0,
      this.lags.length,
      ...this.lags.filter((lag) => lag.from < end - 1e-9),
    );
  }

  private processSequence(seq: SequenceItem[], depth: number) {
    if (depth > MAX_MACRO_DEPTH) {
      console.warn("Max recursion depth reached for macro expansion");
      return;
    }
    const chains = calculateGlobalChainMeta(seq, this.lines, this.lastPoint);

    seq.forEach((item, idx) => {
      // Waits, turns and plugin actions time themselves.
      const action = actionRegistry.get(item.kind);
      if (action?.calculateTime) {
        const res = action.calculateTime(item, {
          currentTime: this.currentTime,
          currentHeading: this.currentHeading,
          lastPoint: this.lastPoint,
          settings: this.settings,
          lines: this.lines,
        });
        this.timeline.push(...res.events);
        this.currentTime += res.duration;
        // It comes to a stop during whatever the step is.
        this.carry = null;
        if (res.endHeading !== undefined) this.currentHeading = res.endHeading;
        if (res.endPoint) this.lastPoint = res.endPoint;
        return;
      }

      if (item.kind === "macro") {
        // The macro's steps were expanded into item.sequence (and its lines
        // into the project's lines) when the macro was loaded.
        const startTime = this.currentTime;
        if (item.sequence?.length)
          this.processSequence(item.sequence, depth + 1);
        if (this.currentTime > startTime) {
          this.timeline.push({
            type: "macro",
            name: item.name || "Macro",
            duration: this.currentTime - startTime,
            startTime,
            endTime: this.currentTime,
          });
        }
        return;
      }

      const line =
        item.kind === "path" ? this.lineById.get(item.lineId) : undefined;
      if (line?.endPoint) this.drivePath(seq, idx, line, chains);
    });
  }

  /** Adds the turn (if needed), the travel and the swing for the path at `idx`. */
  private drivePath(
    seq: SequenceItem[],
    idx: number,
    line: Line,
    chains: Map<string, ChainInfo>,
  ) {
    const ctx = this.prepare(seq, idx, line, chains);
    let built = this.solveMotion(ctx);
    // A robot is slower sideways than forwards, which depends on the heading
    // it has along the path, so the speeds are worked out again with that.
    // Without a difference between the two, there's nothing to redo.
    const scales = speedAtAngle(this.settings)
      ? stepSpeedScales(ctx.analysis.steps, built.headings, this.settings)
      : null;
    if (scales) built = this.solveMotion(ctx, scales);
    built = this.runWide(ctx, built, scales ?? undefined);

    const endStep = this.addTravel(ctx, built);
    if (ctx.nextLine) this.handOver(ctx, built, endStep);
  }

  /** Works out what is needed to time a path, turning in place first if asked. */
  private prepare(
    seq: SequenceItem[],
    idx: number,
    line: Line,
    chains: Map<string, ChainInfo>,
  ): PathContext {
    const { settings, lineById } = this;
    const prevPoint = this.lastPoint;
    const isChained = continuesChain(seq, idx, lineById);
    const chainMeta = chains.get(line.id!);
    const rootLine = chainMeta?.rootLine;
    // Chained paths turn as they drive instead of stopping first, and so do
    // all paths when the robot is set not to stop and turn first.
    const turnsWhileDriving = isChained || settings.stopToTurn === false;

    this.turnInPlace(line, prevPoint, chainMeta, isChained);

    const next = seq[idx + 1];
    const nextLine =
      next?.kind === "path" && continuesChain(seq, idx + 1, lineById)
        ? lineById.get(next.lineId)
        : undefined;
    const handsOver = nextLine?.endPoint ? nextLine : undefined;
    const junctionTurn = handsOver
      ? travelTurn(
          travelDirections(prevPoint, line),
          travelDirections(line.endPoint, handsOver),
        )
      : 0;
    // A chained path doesn't brake at its end; the next path carries on. Timed
    // without the swing, the robot instead slows to turn the corner.
    const maxSpeed = maxSpeedOf(line, rootLine, settings);
    const exitLimit = handsOver
      ? this.corrects
        ? Infinity
        : cornerSpeedForTurn(maxSpeed, junctionTurn)
      : 0;

    // Chained paths are sampled finely, so the robot can be handed over or
    // pick one up part way along.
    const analysis = analyzePathSegment(
      prevPoint,
      line.controlPoints,
      line.endPoint,
      CHAIN_STEPS,
      this.currentHeading,
      isChained || handsOver ? CHAIN_STEPS : 0,
    );
    this.segmentLengths.push(analysis.length);

    const { endHeading, rotationRequired } = calculateEndHeadingAndRotation(
      line,
      prevPoint,
      rootLine,
      chainMeta,
      this.currentHeading,
      analysis.length,
      turnsWhileDriving,
      analysis,
    );
    const rotationTime = calculateRotationTime(
      turnsWhileDriving
        ? Math.abs(endHeading - this.currentHeading)
        : rotationRequired,
      settings,
    );

    // Where along the path the robot starts, if the one before handed it over.
    const stepCount = analysis.steps.length;
    const entry = isChained ? this.entries.get(line.id!) : undefined;
    this.entries.delete(line.id!);
    const startStep = entry && entry.step < stepCount ? entry.step : 0;
    const { entrySpeed, startDelay } =
      startStep === entry?.step
        ? { entrySpeed: entry.speed, startDelay: 0 }
        : this.carriedSpeed(prevPoint, line);

    return {
      seq,
      idx,
      line,
      prevPoint,
      chains,
      chainMeta,
      rootLine,
      isChained,
      turnsWhileDriving,
      nextLine: handsOver,
      junctionTurn,
      exitLimit,
      maxSpeed,
      analysis,
      stepCount,
      endHeading,
      rotationTime,
      startStep,
      entrySpeed,
      startDelay,
      isGlobalOverride: hasGlobalHeading(rootLine),
      followsTangent: turnsWithPath(line, rootLine),
    };
  }

  /**
   * Turns in place if the path starts facing elsewhere. Pedro puts turning
   * before driving while the robot faces more than its
   * headingDeviationTolerance from the heading the path wants, so it turns
   * on the spot until it is that close and sets off still turning. Set to
   * stop and turn first, the robot turns all the way before it drives. A
   * chained path is picked up on the move instead (see `handOver`).
   */
  private turnInPlace(
    line: Line,
    prevPoint: Point,
    chainMeta: ChainInfo | undefined,
    isChained: boolean,
  ) {
    if (isChained) return;
    const wanted = getLineStartHeading(
      line,
      prevPoint,
      chainMeta?.rootLine,
      chainMeta?.chainTotalLength,
      chainMeta?.distanceBefore,
    );
    if (!Number.isFinite(wanted)) return;
    // Pedro's heading error: the short way, clockwise when exactly opposite.
    const error = transformAngle(wanted - this.currentHeading);
    const stopsToTurn = this.settings.stopToTurn !== false;
    const turn = Math.abs(error) - (stopsToTurn ? 0 : TURN_FIRST_DEGREES);
    if (turn <= 0.1) return;
    const turnTime = stopsToTurn
      ? calculateRotationTime(turn, this.settings)
      : turnFromRestTime(turn, this.settings);
    const targetHeading = this.currentHeading + Math.sign(error) * turn;
    this.timeline.push({
      type: "wait",
      duration: turnTime,
      startTime: this.currentTime,
      endTime: this.currentTime + turnTime,
      startHeading: this.currentHeading,
      targetHeading,
      atPoint: prevPoint,
    });
    this.currentTime += turnTime;
    this.currentHeading = targetHeading;
    // It sheds what speed it had while it turns.
    this.carry = null;
  }

  /**
   * The speed a path that isn't chained starts at, given what the robot still
   * had when the path before it let go, and how long it first spends getting
   * rid of the part that doesn't go the new path's way.
   */
  private carriedSpeed(
    prevPoint: Point,
    line: Line,
  ): { entrySpeed: number; startDelay: number } {
    const carry = this.carry;
    this.carry = null;
    const direction = travelDirections(prevPoint, line)?.start;
    if (!carry || direction === undefined) {
      return { entrySpeed: 0, startDelay: 0 };
    }
    const angle = ((direction - carry.direction) * Math.PI) / 180;
    // It keeps what goes the path's way. The rest (sideways, or back the
    // way it came) has to go first, at no more than it can brake by.
    const along = carry.speed * Math.cos(angle);
    const entrySpeed = along > 1e-6 ? along : 0;
    const left =
      entrySpeed > 0 ? Math.abs(carry.speed * Math.sin(angle)) : carry.speed;
    return {
      entrySpeed,
      startDelay: left > 1e-6 ? left / decelerationOf(this.settings) : 0,
    };
  }

  /**
   * The motion and heading profiles for a path, with the top speed on each
   * step scaled by `stepSpeedScale`. The heading profile is built from the final
   * (possibly slowed) motion profile so headings line up with the robot's
   * position.
   */
  private solveMotion(ctx: PathContext, stepSpeedScale?: number[]): Motion {
    const { analysis, startStep, stepCount, rotationTime } = ctx;
    const length = analysis.length;

    // A path that needs time to turn can't be driven faster than that allows:
    // even at this speed throughout, it takes as long as the turn.
    const caps = new Map<number, number>();
    if (rotationTime > 0 && length > 0) {
      for (let b = 0; b <= stepCount - startStep; b++) {
        caps.set(b, length / rotationTime);
      }
    }
    const solved = calculateMotionProfileDetailed(
      analysis.steps.slice(startStep),
      this.settings,
      ctx.entrySpeed,
      ctx.exitLimit,
      caps,
      {
        turnsWithPath: ctx.followsTangent,
        stepSpeedScale: stepSpeedScale?.slice(startStep),
        speedCap: ctx.maxSpeed,
      },
    );

    // If turning takes longer than driving, the drive is slowed to match.
    const total = Math.max(solved.totalTime, rotationTime);
    const scale =
      total > solved.totalTime && solved.totalTime > 0
        ? total / solved.totalTime
        : 1;
    // Steps before `startStep` aren't driven: they take (almost) no time, and
    // sit just before zero so the robot starts at `startStep`.
    const skipped = Array.from(
      { length: startStep },
      (_, i) => -(startStep - i) * 1e-9,
    );
    // A robot still going the other way stays put until it has stopped.
    const motion = [
      ...skipped,
      ...solved.profile.map((t) => t * scale + ctx.startDelay),
    ];
    // Driving the same distance in longer means going slower throughout.
    const velocities = [
      ...skipped.map(() => ctx.entrySpeed),
      ...solved.velocityProfile.map((v) => v / scale),
    ];
    const headingInput = this.headingInputFor(ctx, motion);
    const headings = buildHeadingProfile(headingInput);
    return {
      total: total + ctx.startDelay,
      motion,
      velocities,
      headings,
      shortfalls: piecewiseShortfalls(headingInput, headings),
      resumeStep: ctx.startStep,
    };
  }

  /** What the heading profile of a path is built from, given when the robot is at each step. */
  private headingInputFor(ctx: PathContext, motion: number[]) {
    return {
      line: ctx.line,
      prevPoint: ctx.prevPoint,
      rootLine: ctx.rootLine,
      chainMeta: ctx.chainMeta,
      currentHeading: this.currentHeading,
      endHeading: ctx.endHeading,
      physicalRotationTime: ctx.rotationTime,
      analysis: ctx.analysis,
      motionProfile: motion.map((t) => Math.max(0, t)),
      settings: this.settings,
      length: ctx.analysis.length,
      isChained: ctx.turnsWhileDriving,
      isGlobalOverride: ctx.isGlobalOverride,
    };
  }

  /**
   * Where the robot goes when the path bends harder than it can follow at
   * the speed it is going. Pedro doesn't slow for a bend: it drives along the
   * tangent at full power, and a robot that can't turn that sharply carries
   * on wide and is pulled back. So from the first step that asks for more
   * sideways acceleration than the wheels can grip (the same limit that
   * flags a risk of wheel slip), the robot is simulated as the follower would
   * steer it, until it is back on the path past the last such step. A robot
   * that stays within a few inches of the path follows it as timed.
   */
  private runWide(
    ctx: PathContext,
    built: Motion,
    scales: number[] | undefined,
  ): Motion {
    if (!this.corrects) return built;
    const { analysis, stepCount, startStep } = ctx;
    const { limit } = lateralLimit(this.settings);

    let first = -1;
    let last = -1;
    let demand = 0;
    let peak = 0;
    for (let k = startStep; k < stepCount; k++) {
      const speed = built.velocities[k];
      if (!(speed > 1e-6)) continue;
      const radius = analysis.steps[k].radius;
      const need = radius > 1e-6 ? (speed * speed) / radius : MAX_DEMAND;
      peak = Math.max(peak, Math.min(need, MAX_DEMAND));
      if (need <= limit) continue;
      if (first < 0) first = k;
      last = k;
      demand = Math.max(demand, Math.min(need, MAX_DEMAND));
    }
    if (first < 0) return { ...built, peakDemand: peak };

    // A bend ending close to the end of the path: the robot is simulated all
    // the way to the end, where it brakes, rather than timed over a few steps
    // it has hardly any speed for.
    const leftAt = built.motion[first];
    const nearEnd = last + 1 >= stepCount - WIDE_TAIL_STEPS;
    const result = runWideFromStep({
      line: ctx.line,
      prevPoint: ctx.prevPoint,
      stepCount,
      fromStep: first,
      releaseStep: nearEnd ? stepCount : last + 1,
      speed: built.velocities[first],
      settings: this.settings,
      brakeAtEnd: !ctx.nextLine,
      maxTime: Math.max(8, 3 * (built.motion[stepCount] - leftAt)),
      maxSpeed: ctx.maxSpeed,
    });
    if (!result || result.maxOffset < WIDE_MIN_OFFSET) {
      return { ...built, peakDemand: peak };
    }

    // The robot turns to face where the path wants it along the way, as fast
    // as it can.
    const wanted = idealHeadings({
      line: ctx.line,
      prevPoint: ctx.prevPoint,
      chainMeta: ctx.chainMeta,
      currentHeading: this.currentHeading,
      settings: this.settings,
    });
    // (A path with no heading to speak of keeps the heading it has.)
    const leftHeading = Number.isFinite(built.headings[first])
      ? built.headings[first]
      : this.currentHeading;
    const headings =
      wanted.length > 0
        ? headingsAlong(
            result.time,
            result.along.map((u) => u + first),
            wanted,
            leftHeading,
            this.settings,
          )
        : result.time.map(() => leftHeading);

    // Then it carries on from where it is back on the path, unless that is
    // the end of it.
    const finished = first + result.rejoinStep >= stepCount;
    const resume = finished
      ? stepCount
      : Math.max(first + 1, first + result.rejoinStep);
    const elapsed = leftAt + result.duration;
    let rest: Motion | null = null;
    if (!finished) {
      const heldHeading = this.currentHeading;
      this.currentHeading = headings.at(-1)!;
      rest = this.solveMotion(
        {
          ...ctx,
          startStep: resume,
          entrySpeed: result.rejoinSpeed,
          startDelay: 0,
          rotationTime: Math.max(0, ctx.rotationTime - elapsed),
        },
        scales,
      );
      this.currentHeading = heldHeading;
    }

    const motion = [...built.motion];
    const velocities = [...built.velocities];
    // (Without a heading profile there is nothing to splice into.)
    const headed = built.headings.length === motion.length;
    const headingProfile = [...built.headings];
    // The steps in between are the robot's when it is closest to them.
    let reached = 0;
    let furthest = result.along[0];
    for (let k = first + 1; k < resume; k++) {
      while (furthest < k - first && reached < result.time.length - 1) {
        reached++;
        furthest = Math.max(furthest, result.along[reached]);
      }
      motion[k] = leftAt + result.time[reached];
      velocities[k] = result.speed[reached];
      if (headed) headingProfile[k] = headings[reached];
    }
    if (rest) {
      for (let k = resume; k <= stepCount; k++) {
        motion[k] = elapsed + rest.motion[k];
        velocities[k] = rest.velocities[k];
        if (headed) headingProfile[k] = rest.headings[k];
      }
    } else {
      // At the end: stopped, or going on to the next path at the speed it
      // had when it was back on this one.
      velocities[stepCount] = ctx.nextLine ? result.rejoinSpeed : 0;
      motion[stepCount] = Math.max(
        elapsed,
        motion[stepCount - 1] +
          (velocities[stepCount - 1] - velocities[stepCount]) /
            (this.settings.maxDeceleration ||
              this.settings.maxAcceleration ||
              30),
      );
      if (headed) headingProfile[stepCount] = headings.at(-1)!;
    }

    // The tightest part of the bend, for saying where it is.
    let tight = first;
    for (let k = first; k <= last; k++) {
      if (analysis.steps[k].radius < analysis.steps[tight].radius) tight = k;
    }
    const where = getCurvePoint((tight + 0.5) / stepCount, [
      ctx.prevPoint,
      ...ctx.line.controlPoints,
      ctx.line.endPoint,
    ]);

    return {
      total: elapsed + (rest?.total ?? 0),
      motion,
      velocities,
      headings: headingProfile,
      shortfalls: piecewiseShortfalls(
        this.headingInputFor(ctx, motion),
        headingProfile,
      ),
      resumeStep: resume,
      peakDemand: peak,
      excursion: {
        startTime: leftAt,
        duration: result.duration,
        trace: {
          time: result.time,
          x: result.x,
          y: result.y,
          speed: result.speed,
          heading: headings,
        },
        fromT: first / stepCount,
        toT: resume / stepCount,
        maxOffset: result.maxOffset,
        demand,
        settled: result.settled,
        tightest: {
          radius: analysis.steps[tight].radius,
          x: where.x,
          y: where.y,
          speed: built.velocities[tight],
          time: motion[tight],
        },
      },
    };
  }

  /** Adds the travel event for a path, and gives the step it ends at. */
  private addTravel(ctx: PathContext, built: Motion): number {
    const { line, nextLine, stepCount } = ctx;
    // The step the robot stops driving this path at: its end, unless the next
    // chained path takes over early.
    const endStep =
      nextLine && this.corrects
        ? handoverStep(
            ctx.analysis.steps,
            built.velocities,
            built.resumeStep,
            this.settings,
            ctx.junctionTurn,
            built.headings,
          )
        : stepCount;
    // A path that hands over to the next one has no hold at its end.
    const finish = nextLine ? null : this.holdEnd(ctx, built);
    const travelTime = finish?.travelTime ?? Math.max(0, built.motion[endStep]);

    this.segmentTimes.push(travelTime);
    this.timeline.push({
      type: "travel",
      duration: travelTime,
      startTime: this.currentTime,
      endTime: this.currentTime + travelTime,
      lineIndex: this.lineIndexById.get(line.id!) ?? -1,
      line,
      prevPoint: ctx.prevPoint,
      drivenFrom: ctx.startStep / stepCount,
      drivenTo: endStep / stepCount,
      motionProfile: built.motion,
      velocityProfile: built.velocities,
      headingProfile: built.headings,
      piecewiseShortfalls: built.shortfalls,
      excursion: built.excursion,
      peakDemand: built.peakDemand,
      isGlobalOverride: ctx.isGlobalOverride,
      rootLine: ctx.rootLine,
      globalHeading: (ctx.isGlobalOverride
        ? ctx.rootLine!.globalHeading!
        : line.endPoint.heading) as TimelineEvent["globalHeading"],
    });
    this.currentTime += travelTime;

    // Carry on from the heading the profile actually got to; with a chain
    // heading it can differ from `endHeading`.
    this.currentHeading =
      finish?.heading ?? built.headings[endStep] ?? ctx.endHeading;
    this.carry = finish?.carry ?? null;
    if (finish?.holdTurn) {
      // Stopped at the end, turning to the heading the path ends on.
      const { duration, start, end, target } = finish.holdTurn;
      const turn: TimelineEvent = {
        type: "wait",
        duration,
        startTime: this.currentTime,
        endTime: this.currentTime + duration,
        startHeading: start,
        targetHeading: end,
        atPoint: line.endPoint,
      };
      this.timeline.push(turn);
      this.holdTurns.set(turn, target);
      this.currentTime += duration;
    }
    if (finish?.lag) {
      // Still finishing an earlier path too, if Pedro let go of that one
      // before the robot got there.
      const earlier = this.lags.at(-1);
      const share =
        earlier && earlier.until > earlier.from
          ? Math.max(
              0,
              Math.min(
                1,
                1 -
                  (this.currentTime - earlier.from) /
                    (earlier.until - earlier.from),
              ),
            )
          : 0;
      this.lags.push({
        x: finish.lag.x + (earlier?.x ?? 0) * share,
        y: finish.lag.y + (earlier?.y ?? 0) * share,
        from: this.currentTime,
        until: this.currentTime + finish.lag.left,
      });
    }
    this.lastPoint = line.endPoint;
    return endStep;
  }

  /**
   * When Pedro lets go of a path that ends in a hold, and how the robot is
   * moving then. Pedro counts a path as done once the closest point on it is
   * past its parametricTConstraint (0.975 of the way along the curve), then
   * holds the end pose until the robot has settled there (heading within
   * headingConstraint) or its timeoutConstraint (the path settle time) runs
   * out, whichever is first. The profile still runs to the end of the path,
   * which the robot reaches on its way into the next step.
   */
  private holdEnd(
    ctx: PathContext,
    built: Motion,
  ): {
    /** How long the robot drives the path for. */
    travelTime: number;
    /** A turn in place at the end, while Pedro holds the end pose. */
    holdTurn: {
      duration: number;
      start: number;
      end: number;
      target: number;
    } | null;
    heading: number | undefined;
    carry: { speed: number; direction: number } | null;
    /** How far from the end the robot still is, and how long it takes to get there. */
    lag: { x: number; y: number; left: number } | null;
  } {
    const { stepCount, chainMeta } = ctx;
    const { motion, velocities, headings } = built;
    const headed = headings.length === motion.length;
    const stopped = Math.max(0, motion[stepCount]);
    const done = Math.max(
      0,
      timeAtStep(motion, velocities, (1 - PARAMETRIC_END) * stepCount),
    );
    const timeout = Math.max(0, this.settings.pathSettleTime ?? 0);
    const endHeading = headed ? headings[stepCount] : ctx.endHeading;
    // The heading Pedro holds: the one the path asks for at its end.
    const wantedRaw = getLineEndHeading(
      ctx.line,
      ctx.prevPoint,
      ctx.rootLine,
      chainMeta?.chainTotalLength,
      (chainMeta?.distanceBefore ?? 0) + ctx.analysis.length,
    );
    const target = Number.isFinite(wantedRaw)
      ? unwrapAngle(wantedRaw, endHeading)
      : endHeading;
    const settled = Math.abs(endHeading - target) <= HEADING_SETTLED_DEGREES;
    // A robot running wide passes close to the end of the path while it is
    // still well off it. Pedro would let go then, but the robot would have to
    // come back before the next step could start where it is timed from, so
    // the hold is timed from when it is back at the end instead.
    const wide = built.excursion;
    const offPath =
      !!wide &&
      done >= wide.startTime &&
      done <= wide.startTime + wide.duration;
    const from = offPath ? stopped : done;
    const time = settled ? Math.min(stopped, from + timeout) : from + timeout;

    let heading = headed ? valueAt(motion, headings, time) : undefined;
    let holdTurn = null;
    if (time > stopped && heading !== undefined) {
      // Stopped at the end, still turning to the end heading as it holds:
      // done once it gets there, or when the timeout runs out.
      const start = heading;
      const rate = radiansToDegrees(this.settings.aVelocity);
      const duration = Math.min(
        time - stopped,
        Math.abs(target - start) / rate,
      );
      heading = turnToward(start, target, rate * duration);
      holdTurn = { duration, start, end: heading, target };
    }
    const speed = time < stopped ? valueAt(motion, velocities, time) : 0;
    const direction = travelDirections(ctx.prevPoint, ctx.line)?.end;
    const end = ctx.line.endPoint;
    // Where the robot is: off the path if it is still running wide there.
    const into = wide ? time - wide.startTime : -1;
    const at =
      time >= stopped
        ? end
        : wide && into >= 0 && into <= wide.duration
          ? pointOnTrace(wide.trace, into)
          : getCurvePoint(interpolateTFromProfile(time, motion), [
              ctx.prevPoint,
              ...ctx.line.controlPoints,
              end,
            ]);
    return {
      travelTime: holdTurn || time > stopped ? stopped : time,
      holdTurn,
      heading,
      lag:
        time < stopped
          ? { x: at.x - end.x, y: at.y - end.y, left: stopped - time }
          : null,
      carry:
        speed > 1e-6 && direction !== undefined ? { speed, direction } : null,
    };
  }

  /**
   * Hands the robot over to the chained path after this one: adds the swing
   * back onto it, if there is one, and notes where the next path is picked up.
   */
  private handOver(ctx: PathContext, built: Motion, endStep: number) {
    const { line, nextLine, stepCount } = ctx;
    if (!nextLine) return;
    const speed = built.velocities[endStep];
    const swings =
      this.corrects &&
      (endStep < stepCount || ctx.junctionTurn >= RECOVERY_MIN_TURN_DEGREES);
    // The robot turns to the heading the next path wants where it is along
    // that path, as fast as it can turn, and Pedro turns first when far off.
    const wanted = swings
      ? idealHeadings({
          line: nextLine,
          prevPoint: line.endPoint as Point,
          chainMeta: ctx.chains.get(nextLine.id!),
          currentHeading: this.currentHeading,
          settings: this.settings,
        })
      : [];
    const recovery = swings
      ? recoverFromHandover({
          line,
          prevPoint: ctx.prevPoint,
          nextLine,
          stepCount,
          endStep,
          speed,
          settings: this.settings,
          nextIsLast: !continuesChain(ctx.seq, ctx.idx + 2, this.lineById),
          nextMaxSpeed: maxSpeedOf(
            nextLine,
            ctx.chains.get(nextLine.id!)?.rootLine,
            this.settings,
          ),
          heading: { start: this.currentHeading, wanted },
        })
      : null;
    if (!recovery) {
      this.entries.set(nextLine.id!, { step: 0, speed });
      return;
    }

    const headings = recovery.heading
      ? [...recovery.heading]
      : headingsAlong(
          recovery.time,
          recovery.along,
          wanted,
          this.currentHeading,
          this.settings,
        );

    this.timeline.push({
      type: "recovery",
      duration: recovery.duration,
      startTime: this.currentTime,
      endTime: this.currentTime + recovery.duration,
      lineIndex: this.lineIndexById.get(nextLine.id!) ?? -1,
      line: nextLine,
      prevPoint: line.endPoint,
      trace: {
        time: recovery.time,
        x: recovery.x,
        y: recovery.y,
        speed: recovery.speed,
        heading: headings,
      },
      startOffset: recovery.startOffset,
      overshoot: recovery.overshoot,
      settled: recovery.settled,
      missedBy: recovery.junctionMiss,
    });
    this.currentTime += recovery.duration;
    this.currentHeading = headings.at(-1) ?? this.currentHeading;
    this.entries.set(nextLine.id!, {
      step: recovery.rejoinStep,
      speed: recovery.rejoinSpeed,
    });
  }
}

/**
 * Times a project: the robot's travel along each path, its turns, waits and the
 * swings back onto chained paths, as a timeline.
 */
export function calculatePathTime(
  startPoint: Point,
  lines: Line[],
  settings: Settings,
  sequence?: SequenceItem[],
  options: TimeOptions = {},
): TimePrediction {
  return new TimelineBuilder(
    startPoint,
    materializePrevHeadings(startPoint, lines, sequence),
    settings,
    sequence,
    options,
  ).build();
}

export { startingHeading } from "./startingHeading";
