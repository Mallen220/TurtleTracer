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
} from "../../types";
import {
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
} from "./chainHandover";
import { RECOVERY_MIN_TURN_DEGREES } from "./chainRecovery";
import { analyzePathSegment, unwrapAngle } from "./segmentAnalyzer";
import type { PathAnalysis } from "./types";
import { speedAtAngle, stepSpeedScales } from "./directionalSpeed";
import { buildHeadingProfile } from "./headingProfile";
import { calculateRotationTime } from "./rotation";
import { calculateMotionProfileDetailed } from "./motionProfile";
import { actionRegistry } from "../../lib/actionRegistry";
import { MAX_MACRO_DEPTH } from "../../lib/macroUtils";

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
    const exitLimit = handsOver
      ? this.corrects
        ? Infinity
        : cornerSpeedForTurn(settings.maxVelocity || 100, junctionTurn)
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
  private solveMotion(ctx: PathContext, stepSpeedScale?: number[]) {
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
    const headings = buildHeadingProfile({
      line: ctx.line,
      prevPoint: ctx.prevPoint,
      rootLine: ctx.rootLine,
      chainMeta: ctx.chainMeta,
      currentHeading: this.currentHeading,
      endHeading: ctx.endHeading,
      physicalRotationTime: rotationTime,
      analysis,
      motionProfile: motion.map((t) => Math.max(0, t)),
      settings: this.settings,
      length,
      isChained: ctx.turnsWhileDriving,
      isGlobalOverride: ctx.isGlobalOverride,
    });
    return { total, motion, velocities, headings };
  }

  /** Adds the travel event for a path, and gives the step it ends at. */
  private addTravel(
    ctx: PathContext,
    built: ReturnType<TimelineBuilder["solveMotion"]>,
  ): number {
    const { line, nextLine, stepCount } = ctx;
    // The step the robot stops driving this path at: its end, unless the next
    // chained path takes over early.
    const endStep =
      nextLine && this.corrects
        ? handoverStep(
            ctx.analysis.steps,
            built.velocities,
            ctx.startStep,
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
  private handOver(
    ctx: PathContext,
    built: ReturnType<TimelineBuilder["solveMotion"]>,
    endStep: number,
  ) {
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
