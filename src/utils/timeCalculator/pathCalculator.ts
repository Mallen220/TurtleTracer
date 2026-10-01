// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Times a whole project: walks the sequence and builds the timeline of
// travel, turn-in-place and wait events that playback and export use.
import { getCurvePoint } from "../math";
import type {
  Point,
  Line,
  Settings,
  TimePrediction,
  SequenceItem,
  TimelineEvent,
} from "../../types";
import { getLineStartHeading, restingHeading } from "../math";
import {
  calculateGlobalChainMeta,
  calculateEndHeadingAndRotation,
  continuesChain,
  travelDirections,
  travelTurn,
  type ChainInfo,
} from "./chainMeta";
import { RECOVERY_MIN_TURN_DEGREES, simulateRecovery } from "./chainRecovery";
import { analyzePathSegment, unwrapAngle } from "./segmentAnalyzer";
import type { PathStep } from "./types";
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

/** How many steps a chained path is split into (see `analyzePathSegment`). */
const CHAIN_STEPS = 100;

type RecoveryResult = ReturnType<typeof simulateRecovery>;
const RECOVERY_CACHE_SIZE = 256;
const recoveryCache = new Map<string, RecoveryResult>();

const round = (n: number) => Math.round(n * 1000) / 1000;

/** What a recovery depends on, as a string. */
function recoveryKey(
  position: { x: number; y: number },
  velocity: { x: number; y: number },
  path: { x: number; y: number }[],
  settings: Settings,
): string {
  return [
    round(position.x),
    round(position.y),
    round(velocity.x),
    round(velocity.y),
    settings.maxVelocity,
    settings.maxAcceleration,
    settings.maxDeceleration,
    settings.kFriction,
    ...path.flatMap((p) => [round(p.x), round(p.y)]),
  ].join(",");
}

/**
 * The step at which a chained path is handed to the next: once the robot
 * couldn't stop before the end of the path if it braked from here. A turn too
 * small to matter is driven straight through to the end.
 */
function handoverStep(
  steps: PathStep[],
  velocities: number[],
  startStep: number,
  settings: Settings,
  turnDegrees: number,
): number {
  const end = steps.length;
  if (turnDegrees < RECOVERY_MIN_TURN_DEGREES) return end;
  const brake = settings.maxDeceleration || settings.maxAcceleration || 30;
  let remaining = steps
    .slice(startStep)
    .reduce((sum, step) => sum + step.deltaLength, 0);
  for (let i = startStep; i < end; i++) {
    const v = velocities[i];
    if (remaining <= (v * v) / (2 * brake)) return i;
    remaining -= steps[i].deltaLength;
  }
  return end;
}

/**
 * What the robot does after `line` is handed over to `nextLine` at step
 * `endStep`: still moving along `line`, it is steered onto `nextLine`.
 */
function recoverFromHandover(input: {
  line: Line;
  prevPoint: Point;
  nextLine: Line;
  stepCount: number;
  endStep: number;
  speed: number;
  settings: Settings;
}) {
  const { line, prevPoint, nextLine, stepCount, endStep, speed, settings } =
    input;
  const curve = [prevPoint, ...line.controlPoints, line.endPoint];
  const t = endStep / stepCount;
  const around = 0.5 / stepCount;
  const before = getCurvePoint(Math.max(0, t - around), curve);
  const after = getCurvePoint(Math.min(1, t + around), curve);
  const heading = Math.hypot(after.x - before.x, after.y - before.y);
  if (heading < 1e-9) return null;

  const position = getCurvePoint(t, curve);
  const velocity = {
    x: ((after.x - before.x) / heading) * speed,
    y: ((after.y - before.y) / heading) * speed,
  };
  const nextCurve = [
    line.endPoint,
    ...nextLine.controlPoints,
    nextLine.endPoint,
  ];

  // Moving one path leaves most chained corners as they were, so keep the
  // answer for each corner's inputs.
  const key = recoveryKey(position, velocity, nextCurve, settings);
  const cached = recoveryCache.get(key);
  if (cached) return cached;

  const result = simulateRecovery({
    position,
    velocity,
    path: Array.from({ length: CHAIN_STEPS + 1 }, (_, i) =>
      getCurvePoint(i / CHAIN_STEPS, nextCurve),
    ),
    settings,
  });
  if (recoveryCache.size >= RECOVERY_CACHE_SIZE) {
    recoveryCache.delete(recoveryCache.keys().next().value!);
  }
  recoveryCache.set(key, result);
  return result;
}

export function calculatePathTime(
  startPoint: Point,
  lines: Line[],
  settings: Settings,
  sequence?: SequenceItem[],
): TimePrediction {
  const useMotionProfile =
    settings.maxVelocity !== undefined &&
    settings.maxAcceleration !== undefined;
  // A turn rate of zero would make every turn take forever.
  const safeSettings = {
    ...settings,
    aVelocity: Math.max(settings.aVelocity, 0.001),
  };

  const lineById = new Map(lines.map((l) => [l.id!, l]));
  const lineIndexById = new Map<string, number>();
  lines.forEach((l, i) => {
    if (!lineIndexById.has(l.id!)) lineIndexById.set(l.id!, i);
  });

  const timeline: TimelineEvent[] = [];
  const segmentLengths: number[] = [];
  const segmentTimes: number[] = [];
  let currentTime = 0;
  let lastPoint: Point = startPoint;

  let currentHeading = startingHeading(startPoint, lines, sequence);

  /**
   * Where the robot picks up a chained path: how far along (in steps) and how
   * fast. Each is used once, in case the same path appears again.
   */
  const chainEntries = new Map<string, { step: number; speed: number }>();

  /** Adds the turn (if needed) and the travel for the path at `idx`. */
  function drivePath(
    seq: SequenceItem[],
    idx: number,
    line: Line,
    chains: Map<string, ChainInfo>,
  ) {
    const prevPoint = lastPoint;
    const isChained = continuesChain(seq, idx, lineById);
    const chainMeta = chains.get(line.id!);
    const rootLine = chainMeta?.rootLine;

    // Turn in place first if the path needs to start facing elsewhere.
    // Chained paths don't stop; they turn while driving instead.
    const startHeadingRaw = getLineStartHeading(
      line,
      prevPoint,
      rootLine,
      chainMeta?.chainTotalLength,
      chainMeta?.distanceBefore,
    );
    let startHeading = unwrapAngle(startHeadingRaw, currentHeading);
    if (!Number.isFinite(startHeading)) startHeading = currentHeading;
    if (Math.abs(currentHeading - startHeading) > 0.1 && !isChained) {
      const turnTime = calculateRotationTime(
        Math.abs(currentHeading - startHeading),
        safeSettings,
      );
      timeline.push({
        type: "wait",
        duration: turnTime,
        startTime: currentTime,
        endTime: currentTime + turnTime,
        startHeading: currentHeading,
        targetHeading: startHeading,
        atPoint: prevPoint,
      });
      currentTime += turnTime;
      currentHeading = startHeading;
    }

    const next = seq[idx + 1];
    const nextLine =
      next?.kind === "path" && continuesChain(seq, idx + 1, lineById)
        ? lineById.get(next.lineId)
        : undefined;
    const hasNext = !!nextLine?.endPoint;

    // Chained paths are sampled finely, so the robot can be handed over or
    // pick one up part way along.
    const analysis = analyzePathSegment(
      prevPoint,
      line.controlPoints,
      line.endPoint,
      100,
      currentHeading,
      isChained || hasNext ? 100 : 0,
    );
    const length = analysis.length;
    const stepCount = analysis.steps.length;
    segmentLengths.push(length);

    const { endHeading, rotationRequired } = calculateEndHeadingAndRotation(
      line,
      prevPoint,
      rootLine,
      chainMeta,
      currentHeading,
      length,
      isChained,
      analysis,
    );
    const rotationTime = calculateRotationTime(
      isChained ? Math.abs(endHeading - currentHeading) : rotationRequired,
      safeSettings,
    );

    // Where along the path the robot starts, if the one before handed it over.
    const entry = isChained ? chainEntries.get(line.id!) : undefined;
    chainEntries.delete(line.id!);
    const startStep = entry && entry.step < stepCount ? entry.step : 0;
    const entrySpeed = startStep === entry?.step ? entry.speed : 0;

    let segmentTime: number;
    let travelTime: number;
    let motionProfile: number[] | undefined;
    let velocityProfile: number[] | undefined;
    // The step the robot stops driving this path at: its end, unless the
    // next chained path takes over early.
    let endStep = stepCount;
    if (useMotionProfile) {
      // A path that needs time to turn can't be driven faster than that
      // allows: even at this speed throughout, it takes as long as the turn.
      const caps = new Map<number, number>();
      if (rotationTime > 0 && length > 0) {
        for (let b = 0; b <= stepCount - startStep; b++) {
          caps.set(b, length / rotationTime);
        }
      }
      // A chained path doesn't brake at its end; the next path carries on.
      const solved = calculateMotionProfileDetailed(
        analysis.steps.slice(startStep),
        safeSettings,
        entrySpeed,
        hasNext ? Infinity : 0,
        caps,
      );

      // If turning takes longer than driving, the drive is slowed to match.
      segmentTime = Math.max(solved.totalTime, rotationTime);
      const scale =
        segmentTime > solved.totalTime && solved.totalTime > 0
          ? segmentTime / solved.totalTime
          : 1;
      // Steps before `startStep` aren't driven: they take (almost) no time,
      // and sit just before zero so the robot starts at `startStep`.
      const skipped = Array.from(
        { length: startStep },
        (_, i) => -(startStep - i) * 1e-9,
      );
      motionProfile = [...skipped, ...solved.profile.map((t) => t * scale)];
      // Driving the same distance in longer means going slower throughout.
      velocityProfile = [
        ...skipped.map(() => entrySpeed),
        ...solved.velocityProfile.map((v) => v / scale),
      ];

      if (hasNext && nextLine) {
        endStep = handoverStep(
          analysis.steps,
          velocityProfile,
          startStep,
          safeSettings,
          travelTurn(
            travelDirections(prevPoint, line),
            travelDirections(line.endPoint, nextLine),
          ),
        );
      }
      travelTime = Math.max(0, motionProfile[endStep]);
    } else {
      segmentTime = travelTime =
        length / ((safeSettings.xVelocity + safeSettings.yVelocity) / 2);
    }

    const isGlobalOverride = !!(
      rootLine?.globalHeading && rootLine.globalHeading !== "none"
    );
    // Built from the final (possibly slowed) profile so headings line up
    // with the robot's position.
    const headingProfile =
      useMotionProfile && motionProfile
        ? buildHeadingProfile({
            line,
            prevPoint,
            rootLine,
            chainMeta,
            currentHeading,
            endHeading,
            physicalRotationTime: rotationTime,
            analysis,
            motionProfile: motionProfile.map((t) => Math.max(0, t)),
            settings: safeSettings,
            length,
            isChained,
            isGlobalOverride,
          })
        : undefined;

    segmentTimes.push(travelTime);
    timeline.push({
      type: "travel",
      duration: travelTime,
      startTime: currentTime,
      endTime: currentTime + travelTime,
      lineIndex: lineIndexById.get(line.id!) ?? -1,
      line,
      prevPoint,
      motionProfile,
      velocityProfile,
      headingProfile,
      isGlobalOverride,
      rootLine,
      globalHeading: (isGlobalOverride
        ? rootLine!.globalHeading!
        : line.endPoint.heading) as any,
    });
    currentTime += travelTime;

    // Carry on from the heading the profile actually got to; with a chain
    // heading it can differ from `endHeading`.
    currentHeading = headingProfile?.[endStep] ?? endHeading;
    lastPoint = line.endPoint;

    if (!hasNext || !nextLine || !velocityProfile) return;

    const handoverSpeed = velocityProfile[endStep];
    const recovery =
      endStep < stepCount ||
      travelTurn(
        travelDirections(prevPoint, line),
        travelDirections(line.endPoint, nextLine),
      ) >= RECOVERY_MIN_TURN_DEGREES
        ? recoverFromHandover({
            line,
            prevPoint,
            nextLine,
            stepCount,
            endStep,
            speed: handoverSpeed,
            settings: safeSettings,
          })
        : null;
    if (!recovery) {
      chainEntries.set(nextLine.id!, { step: 0, speed: handoverSpeed });
      return;
    }

    // The robot keeps turning toward the next path's heading while it gets
    // back on the path, as far as the turn rate and the time allow.
    const nextMeta = chains.get(nextLine.id!);
    const goal = unwrapAngle(
      getLineStartHeading(
        nextLine,
        line.endPoint,
        nextMeta?.rootLine,
        nextMeta?.chainTotalLength,
        nextMeta?.distanceBefore,
      ),
      currentHeading,
    );
    const turnNeeded = Math.abs(goal - currentHeading);
    const turnTime = calculateRotationTime(turnNeeded, safeSettings);
    const reached =
      Number.isFinite(goal) && turnNeeded > 0
        ? currentHeading +
          (goal - currentHeading) *
            (turnTime > 0 ? Math.min(1, recovery.duration / turnTime) : 1)
        : currentHeading;
    const recoveredHeading = Number.isFinite(reached)
      ? reached
      : currentHeading;

    timeline.push({
      type: "recovery",
      duration: recovery.duration,
      startTime: currentTime,
      endTime: currentTime + recovery.duration,
      lineIndex: lineIndexById.get(nextLine.id!) ?? -1,
      line: nextLine,
      prevPoint: line.endPoint,
      startHeading: currentHeading,
      targetHeading: recoveredHeading,
      trace: {
        time: recovery.time,
        x: recovery.x,
        y: recovery.y,
        speed: recovery.speed,
      },
      startOffset: recovery.startOffset,
      overshoot: recovery.overshoot,
    });
    currentTime += recovery.duration;
    currentHeading = recoveredHeading;
    chainEntries.set(nextLine.id!, {
      step: recovery.rejoinStep,
      speed: recovery.rejoinSpeed,
    });
  }

  function processSequence(seq: SequenceItem[], depth: number) {
    if (depth > MAX_MACRO_DEPTH) {
      console.warn("Max recursion depth reached for macro expansion");
      return;
    }
    const chains = calculateGlobalChainMeta(seq, lines, lastPoint);

    seq.forEach((item, idx) => {
      // Waits, turns and plugin actions time themselves.
      const action = actionRegistry.get(item.kind);
      if (action?.calculateTime) {
        const res = action.calculateTime(item, {
          currentTime,
          currentHeading,
          lastPoint,
          settings: safeSettings,
          lines,
        });
        timeline.push(...res.events);
        currentTime += res.duration;
        if (res.endHeading !== undefined) currentHeading = res.endHeading;
        if (res.endPoint) lastPoint = res.endPoint;
        return;
      }

      if (item.kind === "macro") {
        // The macro's steps were expanded into item.sequence (and its lines
        // into the project's lines) when the macro was loaded.
        const startTime = currentTime;
        if (item.sequence?.length) processSequence(item.sequence, depth + 1);
        if (currentTime > startTime) {
          timeline.push({
            type: "macro",
            name: item.name || "Macro",
            duration: currentTime - startTime,
            startTime,
            endTime: currentTime,
          });
        }
        return;
      }

      const line = item.kind === "path" ? lineById.get(item.lineId) : undefined;
      if (line?.endPoint) drivePath(seq, idx, line, chains);
    });
  }

  processSequence(stepsToRun(lines, sequence), 0);

  return {
    totalTime: currentTime,
    segmentTimes,
    totalDistance: segmentLengths.reduce((sum, length) => sum + length, 0),
    timeline,
  };
}
