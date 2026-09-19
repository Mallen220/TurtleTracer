// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Times a whole project: walks the sequence and builds the timeline of
// travel, turn-in-place and wait events that playback and export use.
import type {
  Point,
  Line,
  Settings,
  TimePrediction,
  SequenceItem,
  TimelineEvent,
} from "../../types";
import {
  getLineStartHeading,
  getLineEndHeading,
  restingHeading,
} from "../math";
import {
  calculateGlobalChainMeta,
  calculateEndHeadingAndRotation,
  continuesChain,
  cornerSpeed,
  type ChainInfo,
} from "./chainMeta";
import { analyzePathSegment, unwrapAngle } from "./segmentAnalyzer";
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

    const analysis = analyzePathSegment(
      prevPoint,
      line.controlPoints,
      line.endPoint,
      100,
      currentHeading,
    );
    const length = analysis.length;
    segmentLengths.push(length);

    let translationTime: number;
    let motionProfile: number[] | undefined;
    let velocityProfile: number[] | undefined;
    if (useMotionProfile) {
      // Through a chain the robot keeps some speed at the joins, less the
      // sharper the corner.
      const maxVelocity = safeSettings.maxVelocity || 100;
      let entryVelocity = 0;
      const prevItem = seq[idx - 1];
      if (
        isChained &&
        prevItem?.kind === "path" &&
        lineById.has(prevItem.lineId)
      ) {
        entryVelocity = cornerSpeed(
          maxVelocity,
          currentHeading,
          startHeadingRaw,
        );
      }
      let exitVelocity = 0;
      const nextItem = seq[idx + 1];
      const nextLine =
        nextItem?.kind === "path" ? lineById.get(nextItem.lineId) : undefined;
      if (nextLine && continuesChain(seq, idx + 1, lineById)) {
        const nextChain = chains.get(nextLine.id!);
        exitVelocity = cornerSpeed(
          maxVelocity,
          getLineEndHeading(line, prevPoint),
          getLineStartHeading(
            nextLine,
            line.endPoint,
            nextChain?.rootLine,
            nextChain?.chainTotalLength,
            nextChain?.distanceBefore,
          ),
        );
      }

      const result = calculateMotionProfileDetailed(
        analysis.steps,
        safeSettings,
        entryVelocity,
        exitVelocity,
      );
      translationTime = result.totalTime;
      motionProfile = result.profile;
      velocityProfile = result.velocityProfile;
    } else {
      translationTime =
        length / ((safeSettings.xVelocity + safeSettings.yVelocity) / 2);
    }

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

    // If turning takes longer than driving, the drive is slowed to match.
    const segmentTime = Math.max(translationTime, rotationTime);
    if (motionProfile && segmentTime > translationTime && translationTime > 0) {
      const scale = segmentTime / translationTime;
      motionProfile = motionProfile.map((t) => t * scale);
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
            motionProfile,
            settings: safeSettings,
            length,
            isChained,
            isGlobalOverride,
          })
        : undefined;

    segmentTimes.push(segmentTime);
    timeline.push({
      type: "travel",
      duration: segmentTime,
      startTime: currentTime,
      endTime: currentTime + segmentTime,
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
    currentTime += segmentTime;

    // Carry on from the heading the profile actually ended at; with a chain
    // heading it can differ from `endHeading`.
    currentHeading = headingProfile?.at(-1) ?? endHeading;
    lastPoint = line.endPoint;
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
