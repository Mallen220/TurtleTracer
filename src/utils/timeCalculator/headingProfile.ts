// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type {
  SequenceItem,
  Line,
  Point,
  Settings,
  BasePoint,
} from "../../types";
import type { PathAnalysis } from "./types";
import {
  getDistance,
  getAngularDifference,
  getLineStartHeading,
  getLineEndHeading,
  getCurvePoint,
} from "../math";
import { calculateRotationTime } from "./rotation";
import { unwrapAngle } from "./segmentAnalyzer";

export function buildHeadingProfile(
  line: Line,
  prevPoint: BasePoint,
  rootLine: Line | undefined,
  chainMeta: any,
  currentHeading: number,
  endHeading: number,
  endHeadingRaw: number,
  physicalRotationTime: number,
  analysis: PathAnalysis,
  motionProfile: number[],
  safeSettings: Settings,
  length: number,
  isChained: boolean,
  isGlobalOverride: boolean,
): number[] {
  const headingProfile: number[] = [currentHeading];
  const samples = analysis.steps.length;

  const globalHeadingMode = isGlobalOverride
    ? rootLine!.globalHeading!
    : line.endPoint.heading;
  const cTotalLen = chainMeta ? chainMeta.chainTotalLength : length;
  const cDistBefore = chainMeta ? chainMeta.distanceBefore : 0;

  const maxAngVelDegPerSec =
    Math.max(safeSettings.aVelocity, 0.001) * (180 / Math.PI);
  const eps = 0.005;

  if (globalHeadingMode === "tangential") {
    if (isChained) {
      const cps = [prevPoint, ...line.controlPoints, line.endPoint];
      const isReverse = (line.endPoint as any).reverse;
      let simH = currentHeading;
      for (let i = 1; i <= samples; i++) {
        const t = i / samples;
        const tA = Math.max(0, t - eps);
        const tB = Math.min(1, t + eps);
        const posA = getCurvePoint(tA, cps);
        const posB = getCurvePoint(tB, cps);
        const dx = posB.x - posA.x;
        const dy = posB.y - posA.y;
        let idealTarget: number;
        if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) {
          idealTarget = simH; // degenerate — hold current
        } else {
          const absTangentDeg = Math.atan2(dy, dx) * (180 / Math.PI);
          idealTarget = unwrapAngle(
            isReverse ? absTangentDeg + 180 : absTangentDeg,
            simH,
          );
        }
        const dt =
          (motionProfile[i] ?? motionProfile[motionProfile.length - 1]) -
          (motionProfile[i - 1] ?? 0);
        const maxRot = maxAngVelDegPerSec * dt;
        simH += Math.max(-maxRot, Math.min(maxRot, idealTarget - simH));
        headingProfile.push(simH);
      }
    } else {
      for (const step of analysis.steps) {
        headingProfile.push(step.heading);
      }
    }
  } else if (globalHeadingMode === "constant") {
    const targetConstDeg = isGlobalOverride
      ? rootLine!.globalDegrees || 0
      : (line.endPoint as any).degrees || 0;
    const isReverse = isGlobalOverride
      ? rootLine!.globalReverse
      : (line.endPoint as any).reverse;
    const finalTargetDeg = isReverse ? targetConstDeg + 180 : targetConstDeg;
    const targetConstHeading = unwrapAngle(finalTargetDeg, currentHeading);

    if (isChained) {
      for (let i = 1; i <= samples; i++) {
        const stepTime = motionProfile[i];
        const ratio =
          physicalRotationTime > 0
            ? Math.min(1, stepTime / physicalRotationTime)
            : 1;
        headingProfile.push(
          currentHeading + (endHeading - currentHeading) * ratio,
        );
      }
    } else {
      for (let i = 1; i <= samples; i++) {
        headingProfile.push(targetConstHeading);
      }
    }
  } else if (globalHeadingMode === "linear") {
    const startDeg = isGlobalOverride
      ? rootLine!.globalStartDeg || 0
      : (line.endPoint as any).startDeg || 0;
    const endDeg = isGlobalOverride
      ? rootLine!.globalEndDeg || 0
      : (line.endPoint as any).endDeg || 0;
    const isReverse = isGlobalOverride
      ? rootLine!.globalReverse
      : (line.endPoint as any).reverse;

    if (isReverse) {
      const shortDiff = endDeg - startDeg;
      const normalizedShort = ((shortDiff % 360) + 360) % 360;
      const longDiff =
        normalizedShort <= 180 ? normalizedShort - 360 : normalizedShort;
      const targetStartHeading = unwrapAngle(startDeg, currentHeading);

      for (let i = 1; i <= samples; i++) {
        if (isGlobalOverride) {
          const t =
            cTotalLen > 0
              ? (cDistBefore + (i / samples) * length) / cTotalLen
              : i / samples;
          headingProfile.push(targetStartHeading + longDiff * t);
        } else if (isChained) {
          const stepTime = motionProfile[i];
          const ratio =
            physicalRotationTime > 0
              ? Math.min(1, stepTime / physicalRotationTime)
              : 1;
          headingProfile.push(
            currentHeading + (endHeading - currentHeading) * ratio,
          );
        } else {
          const ratio = i / samples;
          const interpolatedHeading = targetStartHeading + longDiff * ratio;
          headingProfile.push(interpolatedHeading);
        }
      }
    } else {
      const startUnwound = unwrapAngle(startDeg, currentHeading);
      const unwrappedEnd = unwrapAngle(endDeg, startUnwound);
      for (let i = 1; i <= samples; i++) {
        if (isGlobalOverride) {
          const t =
            cTotalLen > 0
              ? (cDistBefore + (i / samples) * length) / cTotalLen
              : i / samples;
          headingProfile.push(startUnwound + (unwrappedEnd - startUnwound) * t);
        } else if (isChained) {
          const stepTime = motionProfile[i];
          const ratio =
            physicalRotationTime > 0
              ? Math.min(1, stepTime / physicalRotationTime)
              : 1;
          headingProfile.push(
            currentHeading + (endHeading - currentHeading) * ratio,
          );
        } else {
          const ratio = i / samples;
          const interpolatedHeading =
            startUnwound + (unwrappedEnd - startUnwound) * ratio;
          headingProfile.push(interpolatedHeading);
        }
      }
    }
  } else if (globalHeadingMode === "facingPoint") {
    const cps = [prevPoint, ...line.controlPoints, line.endPoint];
    const targetX = isGlobalOverride
      ? rootLine!.globalTargetX || 0
      : (line.endPoint as any).targetX || 0;
    const targetY = isGlobalOverride
      ? rootLine!.globalTargetY || 0
      : (line.endPoint as any).targetY || 0;
    const isReverse = isGlobalOverride
      ? rootLine!.globalReverse
      : (line.endPoint as any).reverse;

    let simH = currentHeading;
    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      const pos = getCurvePoint(t, cps);
      let angle =
        Math.atan2(targetY - pos.y, targetX - pos.x) * (180 / Math.PI);
      if (isReverse) angle += 180;
      const targetHeading = unwrapAngle(angle, simH);
      simH = targetHeading;
      headingProfile.push(simH);
    }
  } else if (globalHeadingMode === "piecewise") {
    const cps = [prevPoint, ...line.controlPoints, line.endPoint];
    const segments = isGlobalOverride
      ? rootLine!.globalSegments || []
      : line.endPoint.segments || [];
    let simHeading = currentHeading;

    for (let i = 1; i <= samples; i++) {
      const localRatio = i / samples;
      const t =
        isGlobalOverride && cTotalLen > 0
          ? (cDistBefore + localRatio * length) / cTotalLen
          : localRatio;

      let activeSeg = null;
      for (const seg of segments) {
        if (t >= seg.tStart && t <= seg.tEnd) {
          activeSeg = seg;
          break;
        }
      }
      if (!activeSeg) {
        headingProfile.push(simHeading);
        continue;
      }

      let targetHeading = simHeading;
      if (activeSeg.heading === "constant") {
        let deg = activeSeg.degrees ?? 0;
        if (activeSeg.reverse) deg += 180;
        targetHeading = unwrapAngle(deg, simHeading);
      } else if (activeSeg.heading === "tangential") {
        const tA = Math.max(0, localRatio - eps);
        const tB = Math.min(1, localRatio + eps);
        const posA = getCurvePoint(tA, cps);
        const posB = getCurvePoint(tB, cps);
        const dx = posB.x - posA.x;
        const dy = posB.y - posA.y;
        if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) {
          targetHeading = simHeading;
        } else {
          const absTangentDeg = Math.atan2(dy, dx) * (180 / Math.PI);
          targetHeading = unwrapAngle(
            activeSeg.reverse ? absTangentDeg + 180 : absTangentDeg,
            simHeading,
          );
        }
      } else if (activeSeg.heading === "linear") {
        let sDeg = activeSeg.startDeg ?? 0;
        let eDeg = activeSeg.endDeg ?? 0;
        let localT = 0;
        if (activeSeg.tEnd > activeSeg.tStart) {
          localT = (t - activeSeg.tStart) / (activeSeg.tEnd - activeSeg.tStart);
        }
        if (localT < 0) localT = 0;
        if (localT > 1) localT = 1;

        const startUnwound = unwrapAngle(sDeg, simHeading);
        if (activeSeg.reverse) {
          const shortDiff = eDeg - sDeg;
          const normalizedShort = ((shortDiff % 360) + 360) % 360;
          const longDiff =
            normalizedShort <= 180 ? normalizedShort - 360 : normalizedShort;
          targetHeading = startUnwound + longDiff * localT;
        } else {
          const totalDiff = eDeg - sDeg;
          targetHeading = startUnwound + totalDiff * localT;
        }
      } else if (activeSeg.heading === "facingPoint") {
        const targetX = activeSeg.targetX || 0;
        const targetY = activeSeg.targetY || 0;
        const pos = getCurvePoint(localRatio, cps);
        let angle =
          Math.atan2(targetY - pos.y, targetX - pos.x) * (180 / Math.PI);
        if (activeSeg.reverse) angle += 180;
        targetHeading = unwrapAngle(angle, simHeading);
      }

      const dt = motionProfile[i] - motionProfile[i - 1];
      let nextHeading;

      if (activeSeg.heading === "tangential") {
        const maxRot = maxAngVelDegPerSec * dt;
        nextHeading =
          simHeading +
          Math.max(-maxRot, Math.min(maxRot, targetHeading - simHeading));
      } else {
        const catchUpRequired = Math.abs(targetHeading - simHeading);
        const stepPhysicalTime = calculateRotationTime(
          catchUpRequired,
          safeSettings,
        );
        if (stepPhysicalTime > 0 && dt < stepPhysicalTime) {
          const ratio = dt / stepPhysicalTime;
          nextHeading =
            simHeading + (targetHeading - simHeading) * Math.min(1, ratio);
        } else {
          nextHeading = targetHeading;
        }
      }
      simHeading = nextHeading;
      headingProfile.push(simHeading);
    }
  }

  if (headingProfile?.length > 1) {
    for (let k = 1; k < headingProfile.length; k++) {
      const prev = headingProfile[k - 1];
      let curr = headingProfile[k];
      while (curr - prev > 180) curr -= 360;
      while (curr - prev < -180) curr += 360;
      headingProfile[k] = curr;
    }
  }

  return headingProfile;
}
