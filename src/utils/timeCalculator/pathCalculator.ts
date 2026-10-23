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
  getLineStartHeading,
  restingHeading,
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
import { RECOVERY_MIN_TURN_DEGREES } from "./chainRecovery";
import { analyzePathSegment, unwrapAngle } from "./segmentAnalyzer";
import type { PathAnalysis } from "./types";
import { speedAtAngle, stepSpeedScales } from "./directionalSpeed";
import { buildHeadingProfile, piecewiseShortfalls } from "./headingProfile";
import { calculateRotationTime } from "./rotation";
import { lateralLimit } from "./lateralLimit";
import { maxSpeedOf } from "./speedCap";
import { calculateMotionProfileDetailed } from "./motionProfile";
import { actionRegistry } from "../../lib/actionRegistry";
import { MAX_MACRO_DEPTH } from "../../config";

/** The steps that get run: the sequence, or every line in order without one. */
function stepsToRun(lines: Line[], sequence?: SequenceItem[]): SequenceItem[] {
  return sequence?.length
    ? sequence
    : lines.map((l): SequenceItem => ({ kind: "path", lineId: l.id! }));
}

/**
 * The first path the robot drives, looking inside macros, and the list of
 * steps it's in (which decides its chain).
 */
function firstDrivenPath(
  steps: SequenceItem[],
  lineById: Map<string, Line>,
  depth = 0,
): { line: Line; steps: SequenceItem[] } | null {
  if (depth > MAX_MACRO_DEPTH) return null;
  for (const item of steps) {
    if (item.kind === "path") {
      const line = lineById.get(item.lineId);
      if (line?.endPoint) return { line, steps };
    } else if (item.kind === "macro" && item.sequence?.length) {
      const found = firstDrivenPath(item.sequence, lineById, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/**
 * The heading the robot has before it does anything. Once there are paths,
 * it starts facing the way the first one it drives begins; anything before
 * that path (waits, turns) happens from there. With no path, the start
 * point's own heading applies.
 */
export function startingHeading(
  startPoint: Point,
  lines: Line[],
  sequence?: SequenceItem[],
): number {
  const lineById = new Map(lines.map((l) => [l.id!, l]));
  const first = firstDrivenPath(stepsToRun(lines, sequence), lineById);
  if (!first) return restingHeading(startPoint);

  const chain = calculateGlobalChainMeta(first.steps, lines, startPoint).get(
    first.line.id!,
  );
  const heading = getLineStartHeading(
    first.line,
    startPoint,
    chain?.rootLine,
    chain?.chainTotalLength,
    chain?.distanceBefore,
  );
  return Number.isFinite(heading) ? heading : 0;
}

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

    this.turnInPlace(line, prevPoint, chainMeta, turnsWhileDriving);

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
      entrySpeed: startStep === entry?.step ? entry.speed : 0,
      isGlobalOverride: hasGlobalHeading(rootLine),
      followsTangent: turnsWithPath(line, rootLine),
    };
  }

  /** Turns in place if the path needs to start facing elsewhere. */
  private turnInPlace(
    line: Line,
    prevPoint: Point,
    chainMeta: ChainInfo | undefined,
    turnsWhileDriving: boolean,
  ) {
    const startHeadingRaw = getLineStartHeading(
      line,
      prevPoint,
      chainMeta?.rootLine,
      chainMeta?.chainTotalLength,
      chainMeta?.distanceBefore,
    );
    let startHeading = unwrapAngle(startHeadingRaw, this.currentHeading);
    if (!Number.isFinite(startHeading)) startHeading = this.currentHeading;
    if (
      Math.abs(this.currentHeading - startHeading) <= 0.1 ||
      turnsWhileDriving
    ) {
      return;
    }
    const turnTime = calculateRotationTime(
      Math.abs(this.currentHeading - startHeading),
      this.settings,
    );
    this.timeline.push({
      type: "wait",
      duration: turnTime,
      startTime: this.currentTime,
      endTime: this.currentTime + turnTime,
      startHeading: this.currentHeading,
      targetHeading: startHeading,
      atPoint: prevPoint,
    });
    this.currentTime += turnTime;
    this.currentHeading = startHeading;
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
    const motion = [...skipped, ...solved.profile.map((t) => t * scale)];
    // Driving the same distance in longer means going slower throughout.
    const velocities = [
      ...skipped.map(() => ctx.entrySpeed),
      ...solved.velocityProfile.map((v) => v / scale),
    ];
    const headingInput = this.headingInputFor(ctx, motion);
    const headings = buildHeadingProfile(headingInput);
    return {
      total,
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
          )
        : stepCount;
    let travelTime = Math.max(0, built.motion[endStep]);
    // Pedro holds the end pose until the robot has settled. A path that hands
    // over to the next one has no hold.
    if (!nextLine) travelTime += Math.max(0, this.settings.pathSettleTime ?? 0);

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
    this.currentHeading = built.headings[endStep] ?? ctx.endHeading;
    this.lastPoint = line.endPoint;
    return endStep;
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
        })
      : null;
    if (!recovery) {
      this.entries.set(nextLine.id!, { step: 0, speed });
      return;
    }

    // The robot keeps turning to the heading the next path wants where it is
    // along that path, as fast as it can turn.
    const wanted = idealHeadings({
      line: nextLine,
      prevPoint: line.endPoint as Point,
      chainMeta: ctx.chains.get(nextLine.id!),
      currentHeading: this.currentHeading,
      settings: this.settings,
    });
    const headings = headingsAlong(
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
    lines,
    settings,
    sequence,
    options,
  ).build();
}
