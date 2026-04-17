// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type {
  Point,
  BasePoint,
  Line,
  Settings,
  TimePrediction,
  TimelineEvent,
  SequenceItem,
} from "../../types";
import { getInitialTangentialHeading, getLineStartHeading } from "../math";
import { actionRegistry } from "../../lib/actionRegistry";

import { analyzePathSegment } from "./segmentAnalysis";
import { calculateGlobalChainMeta } from "./chainMeta";
import {
  unwrapAngle,
  calculateEndHeadingAndRotation,
  buildHeadingProfile,
} from "./heading";
import {
  calculateRotationTime,
  calculateMotionProfileDetailed,
  calculateSegmentVelocities,
} from "./motionProfile";

export * from "./types";
export * from "./bezier";
export * from "./segmentAnalysis";
export * from "./heading";
export * from "./motionProfile";
export * from "./chainMeta";

export function calculatePathTime(
  startPoint: Point,
  lines: Line[],
  settings: Settings,
  sequence?: SequenceItem[],
  macros?: Map<string, import("../../types").TurtleData>,
): TimePrediction {
  const msToSeconds = (value?: number | string) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return 0;
    return numeric / 1000;
  };

  const useMotionProfile =
    settings.maxVelocity !== undefined &&
    settings.maxAcceleration !== undefined;

  // Guard aVelocity globally in this scope
  const safeSettings = {
    ...settings,
    aVelocity: Math.max(settings.aVelocity, 0.001),
  };

  const segmentLengths: number[] = [];
  const segmentTimes: number[] = [];
  const timeline: TimelineEvent[] = [];

  const globalChainMeta = sequence
    ? calculateGlobalChainMeta(sequence, lines, startPoint)
    : new Map();

  let currentTime = 0;
  let currentHeading = 0;
  let isFirstPathItem = true;

  // Initialize heading based on start point settings
  // But OVERRIDE if the first path in the sequence has a global chain override
  let startOverrideFound = false;
  if (sequence && sequence.length > 0) {
    const firstPathItem = sequence.find((it) => it.kind === "path");
    if (firstPathItem) {
      const lineId = (firstPathItem as any).lineId;
      const line = lines.find((l) => l.id === lineId);
      if (line && sequence) {
        const meta = globalChainMeta.get(line.id!);
        const rootLine = meta?.rootLine;
        if (rootLine?.globalHeading && rootLine.globalHeading !== "none") {
          const effectiveHeading = rootLine.globalHeading;
          if (effectiveHeading === "tangential") {
            const nextP =
              line.controlPoints.length > 0
                ? line.controlPoints[0]
                : line.endPoint;
            currentHeading = getInitialTangentialHeading(startPoint, nextP);
            startOverrideFound = true;
          } else if (effectiveHeading === "constant") {
            const deg = rootLine.globalDegrees || 0;
            const rev = rootLine.globalReverse;
            currentHeading = rev ? deg + 180 : deg;
            startOverrideFound = true;
          } else if (effectiveHeading === "linear") {
            const deg = rootLine.globalStartDeg || 0;
            const rev = rootLine.globalReverse;
            currentHeading = rev ? deg + 180 : deg;
            startOverrideFound = true;
          } else if (effectiveHeading === "facingPoint") {
            const tx = rootLine.globalTargetX || 0;
            const ty = rootLine.globalTargetY || 0;
            const rev = rootLine.globalReverse;
            let angle =
              Math.atan2(ty - startPoint.y, tx - startPoint.x) *
              (180 / Math.PI);
            if (rev) angle += 180;
            currentHeading = angle;
            startOverrideFound = true;
          }
        }
      }
    }
  }

  if (!startOverrideFound) {
    if (startPoint.heading === "linear") currentHeading = startPoint.startDeg;
    else if (startPoint.heading === "constant")
      currentHeading = startPoint.degrees;
    else if (startPoint.heading === "tangential") {
      if (lines.length > 0) {
        const firstLine = lines[0];
        const nextP =
          firstLine.controlPoints.length > 0
            ? firstLine.controlPoints[0]
            : firstLine.endPoint;
        currentHeading = getInitialTangentialHeading(startPoint, nextP);
      } else {
        currentHeading = 0;
      }
    }
  }

  if (!Number.isFinite(currentHeading)) currentHeading = 0;

  let lastPoint: Point = startPoint;

  const processSequence = (
    seq: SequenceItem[],
    contextLines: Line[],
    recursionDepth: number = 0,
  ) => {
    if (recursionDepth > 10) {
      console.warn("Max recursion depth reached for macro expansion");
      return;
    }

    const lineById = new Map<string, Line>();
    contextLines.forEach((ln) => {
      if (!ln.id) ln.id = `line-${Math.random().toString(36).slice(2)}`;
      lineById.set(ln.id, ln);
    });

    const globalChainMeta = calculateGlobalChainMeta(
      seq,
      contextLines,
      lastPoint,
    );

    seq.forEach((item, idx) => {
      // Registry Check
      const action = actionRegistry.get(item.kind);
      if (action?.calculateTime) {
        const res = action.calculateTime(item, {
          currentTime,
          currentHeading,
          lastPoint,
          settings: safeSettings,
          lines: contextLines,
        });
        res.events.forEach((ev) => timeline.push(ev));
        currentTime += res.duration;
        if (res.endHeading !== undefined) {
          currentHeading = res.endHeading;
          isFirstPathItem = false;
        }
        if (res.endPoint) lastPoint = res.endPoint;
        return;
      }

      if (item.kind === "macro") {
        const startTime = currentTime;

        // Use the pre-expanded sequence in the item, which refreshMacros has populated.
        // The lines for this macro should already be in contextLines (which are all project lines).
        if (item.sequence && item.sequence.length > 0) {
          processSequence(item.sequence, contextLines, recursionDepth + 1);
        }

        const endTime = currentTime;
        const duration = endTime - startTime;

        if (duration > 0) {
          timeline.push({
            type: "macro",
            name: item.name || "Macro",
            duration,
            startTime,
            endTime,
          });
        }

        return;
      }

      const line = lineById.get((item as any).lineId);
      if (!line?.endPoint) {
        return;
      }
      const prevPoint = lastPoint;

      const prevItem = idx > 0 ? seq[idx - 1] : null;
      const isChained = !!(
        prevItem?.kind === "path" &&
        ((item as any).isChain === true || line.isChain === true)
      );

      const chainMeta = globalChainMeta.get(line.id!);
      const rootLine = chainMeta?.rootLine;

      // --- ROTATION CHECK (Initial Turn-to-Face or Wait) ---
      // Unwind requiredStartHeading relative to currentHeading
      let requiredStartHeadingRaw = getLineStartHeading(
        line,
        prevPoint,
        rootLine,
        chainMeta?.chainTotalLength,
        chainMeta?.distanceBefore,
      );
      // Unwind: find value closest to currentHeading
      let requiredStartHeading = unwrapAngle(
        requiredStartHeadingRaw,
        currentHeading,
      );

      if (!Number.isFinite(requiredStartHeading))
        requiredStartHeading = currentHeading;

      if (isFirstPathItem) {
        currentHeading = requiredStartHeading;
        isFirstPathItem = false;
      }

      let diff = Math.abs(currentHeading - requiredStartHeading);

      // Use a small epsilon
      if (diff > 0.1 && !isChained) {
        // Convert diff to rotation time WITH ACCELERATION logic for Wait events
        const rotTime = calculateRotationTime(diff, safeSettings);

        timeline.push({
          type: "wait",
          duration: rotTime,
          startTime: currentTime,
          endTime: currentTime + rotTime,
          startHeading: currentHeading,
          targetHeading: requiredStartHeading,
          atPoint: prevPoint,
        });
        currentTime += rotTime;
        currentHeading = requiredStartHeading;
      } else if (isChained) {
        // If chained, we don't stop.
        // However, we want to rotate to requiredStartHeading smoothly.
        // Since the robot can drive and rotate, we will factor this into the travel time check below.
        // We will NOT insert a wait block. We just leave currentHeading as is for the start of travel.
      }

      // --- TRAVEL ANALYSIS ---
      // Pass currentHeading to start tracking
      const analysis = analyzePathSegment(
        prevPoint,
        line.controlPoints as any,
        line.endPoint as any,
        100,
        currentHeading,
      );
      const length = analysis.length;
      segmentLengths.push(length);

      let translationTime = 0;
      let motionProfile: number[] | undefined = undefined;
      let velocityProfile: number[] | undefined = undefined;
      let headingProfile: number[] | undefined = undefined;

      const nextItem = seq[idx + 1];
      const isChainedToNext =
        nextItem?.kind === "path" &&
        ((nextItem as any).isChain === true ||
          (lineById.get((nextItem as any).lineId) as any)?.isChain === true);

      if (useMotionProfile) {
        let entryVelocity = 0;
        let exitVelocity = 0;

        const maxVelGlobal = safeSettings.maxVelocity || 100;

        const velocities = calculateSegmentVelocities(
          idx,
          seq,
          lineById,
          globalChainMeta,
          currentHeading,
          prevPoint,
          rootLine,
          chainMeta,
          line,
          maxVelGlobal,
          isChained,
          isChainedToNext,
        );
        entryVelocity = velocities.entryVelocity;
        exitVelocity = velocities.exitVelocity;

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
        const avgVelocity =
          (safeSettings.xVelocity + safeSettings.yVelocity) / 2;
        translationTime = length / avgVelocity;
      }

      // Calculate Rotation Time (for non-profile logic)
      const rotationAnalysis = calculateEndHeadingAndRotation(
        line,
        prevPoint,
        rootLine,
        chainMeta,
        currentHeading,
        length,
        isChained,
        analysis,
      );
      let endHeading = rotationAnalysis.endHeading;
      let rotationRequired = rotationAnalysis.rotationRequired;
      let endHeadingRaw = rotationAnalysis.endHeadingRaw;
      const effectiveHeading = rotationAnalysis.effectiveHeading;

      const totalRotationRequiredForSegment = isChained
        ? Math.abs(endHeading - currentHeading)
        : rotationRequired;
      const physicalRotationTime = calculateRotationTime(
        totalRotationRequiredForSegment,
        safeSettings,
      );

      const segmentTime = Math.max(translationTime, physicalRotationTime);

      if (
        useMotionProfile &&
        motionProfile &&
        segmentTime > translationTime &&
        translationTime > 0
      ) {
        const scale = segmentTime / translationTime;
        motionProfile = motionProfile.map((t) => t * scale);
      }

      const isGlobalOverride = !!(
        rootLine?.globalHeading && rootLine.globalHeading !== "none"
      );

      // Build heading profile AFTER motion profile is scaled/finalized so we have accurate times
      if (useMotionProfile && motionProfile) {
        headingProfile = buildHeadingProfile(
          line,
          prevPoint,
          rootLine,
          chainMeta,
          currentHeading,
          endHeading,
          endHeadingRaw,
          physicalRotationTime,
          analysis,
          motionProfile,
          safeSettings,
          length,
          isChained,
          isGlobalOverride,
        );
      }

      // Cleaned up the duplicate declarations that caused tests to fail.

      segmentTimes.push(segmentTime);
      const lineIndex = contextLines.findIndex((l) => l.id === line.id);
      timeline.push({
        type: "travel",
        duration: segmentTime,
        startTime: currentTime,
        endTime: currentTime + segmentTime,
        lineIndex,
        line: line, // Pass direct reference
        prevPoint: prevPoint as Point, // Pass direct reference
        motionProfile: motionProfile,
        velocityProfile: velocityProfile,
        headingProfile: headingProfile,
        isGlobalOverride: isGlobalOverride,
        rootLine: rootLine,
        globalHeading: (isGlobalOverride
          ? rootLine!.globalHeading!
          : line.endPoint.heading) as any,
      });
      currentTime += segmentTime;

      // Update state: seed from actual last heading profile value if available
      // so the next segment always continues from wherever we truly ended up
      // (which can differ from endHeading when using global chain interpolation).
      if (headingProfile && headingProfile.length > 0) {
        currentHeading = headingProfile[headingProfile.length - 1];
      } else {
        currentHeading = endHeading;
      }
      lastPoint = line.endPoint as Point;
    });
  };

  const initialSeq = sequence?.length
    ? sequence
    : lines.map((ln) => ({ kind: "path", lineId: ln.id! }) as SequenceItem);

  processSequence(initialSeq, lines);

  const totalTime = currentTime;
  const totalDistance = segmentLengths.reduce((sum, length) => sum + length, 0);

  return {
    totalTime,
    segmentTimes,
    totalDistance,
    timeline,
  };
}

export function formatTime(totalSeconds: number): string {
  // Handle NaN or Infinity
  if (!Number.isFinite(totalSeconds)) return "Infinite";
  if (totalSeconds <= 0) return "0.000s";

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}:${seconds.toFixed(3).padStart(6, "0")}s`;
  }
  return `${seconds.toFixed(3)}s`;
}

export function getAnimationDuration(
  totalTime: number,
  speedFactor: number = 1,
): number {
  return (totalTime * 1000) / speedFactor;
}
