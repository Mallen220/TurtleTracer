// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { unwrapAngle, analyzePathSegment } from "./segmentAnalyzer";
import {
  getAngularDifference,
  getLineStartHeading,
  getLineEndHeading,
} from "../math";
import type { SequenceItem, Line, Point, BasePoint } from "../../types";
import type { PathAnalysis } from "./types";

export function calculateGlobalChainMeta(
  seq: SequenceItem[],
  lines: Line[],
  startPoint: Point,
) {
  const lineById = new Map<string, Line>();
  lines.forEach((ln) => {
    if (!ln.id) ln.id = `line-${Math.random().toString(36).slice(2)}`;
    lineById.set(ln.id, ln);
  });

  const meta = new Map<
    string,
    {
      rootLine: Line;
      chainTotalLength: number;
      distanceBefore: number;
    }
  >();

  let tempLastPoint = startPoint;
  let currentChainLength = 0;
  let currentRootLine: Line | null = null;

  seq.forEach((item, idx) => {
    if (item.kind !== "path") return;
    const line = lineById.get((item as any).lineId);
    if (!line?.endPoint) return;

    const prevItem = idx > 0 ? seq[idx - 1] : null;
    const isChained = !!(
      prevItem?.kind === "path" &&
      ((item as any).isChain === true || line.isChain === true)
    );

    const analysis = analyzePathSegment(
      tempLastPoint,
      line.controlPoints as any,
      line.endPoint as any,
      50,
      0,
    );

    if (!isChained) {
      currentRootLine = line;
      currentChainLength = 0;
    }

    if (currentRootLine) {
      meta.set(line.id!, {
        rootLine: currentRootLine,
        chainTotalLength: 0,
        distanceBefore: currentChainLength,
      });
      currentChainLength += analysis.length;
      for (const m of meta.values()) {
        if (m.rootLine === currentRootLine) {
          m.chainTotalLength = currentChainLength;
        }
      }
    }
    tempLastPoint = line.endPoint;
  });

  return meta;
}

export function calculateSegmentVelocities(
  idx: number,
  seq: SequenceItem[],
  lineById: Map<string, Line>,
  globalChainMeta: Map<string, any>,
  currentHeading: number,
  prevPoint: BasePoint,
  rootLine: Line | undefined,
  chainMeta: any,
  line: Line,
  maxVelGlobal: number,
  isChained: boolean,
  isChainedToNext: boolean,
): { entryVelocity: number; exitVelocity: number } {
  let entryVelocity = 0;
  let exitVelocity = 0;

  if (isChained) {
    if (idx > 0 && seq[idx - 1].kind === "path") {
      const prevLineId = (seq[idx - 1] as any).lineId;
      const prevLine = lineById.get(prevLineId);
      if (prevLine) {
        let thisStartHeading = getLineStartHeading(
          line,
          prevPoint as Point,
          rootLine,
          chainMeta?.chainTotalLength,
          chainMeta?.distanceBefore,
        );
        let diff = Math.abs(
          getAngularDifference(currentHeading, thisStartHeading),
        );
        let speedFactor = Math.max(0, Math.cos((diff * Math.PI) / 180));
        entryVelocity = maxVelGlobal * speedFactor;
      }
    } else {
      entryVelocity = maxVelGlobal;
    }
  }

  if (isChainedToNext) {
    const nextItem = seq[idx + 1];
    let nextLine = lineById.get((nextItem as any).lineId);
    if (nextLine) {
      let thisEndHeading = getLineEndHeading(line, prevPoint as Point);
      const nextChainMeta = globalChainMeta.get(nextLine.id!);
      let nextStartHeading = getLineStartHeading(
        nextLine,
        line.endPoint as Point,
        nextChainMeta?.rootLine,
        nextChainMeta?.chainTotalLength,
        nextChainMeta?.distanceBefore,
      );
      let diff = Math.abs(
        getAngularDifference(thisEndHeading, nextStartHeading),
      );
      let speedFactor = Math.max(0, Math.cos((diff * Math.PI) / 180));
      exitVelocity = maxVelGlobal * speedFactor;
    }
  }

  return { entryVelocity, exitVelocity };
}

export function calculateEndHeadingAndRotation(
  line: Line,
  prevPoint: BasePoint,
  rootLine: Line | undefined,
  chainMeta: any,
  currentHeading: number,
  length: number,
  isChained: boolean,
  analysis: PathAnalysis,
): {
  endHeading: number;
  rotationRequired: number;
  effectiveHeading: string;
  endHeadingRaw: number;
} {
  let rotationRequired = 0;
  let endHeadingRaw = getLineEndHeading(
    line,
    prevPoint as Point,
    rootLine,
    chainMeta?.chainTotalLength,
    (chainMeta?.distanceBefore || 0) + length,
  );
  let endHeading = endHeadingRaw;

  const isGlobalOverride = !!(
    rootLine?.globalHeading && rootLine.globalHeading !== "none"
  );
  const effectiveHeading = isGlobalOverride
    ? rootLine!.globalHeading!
    : line.endPoint.heading;

  if (effectiveHeading === "tangential") {
    if (isChained) {
      endHeading = unwrapAngle(endHeadingRaw, currentHeading);
      rotationRequired = Math.abs(endHeading - currentHeading);
    } else {
      endHeading = currentHeading + analysis.netRotation;
      rotationRequired = analysis.tangentRotation;
    }
  } else if (effectiveHeading === "constant") {
    const constDeg = isGlobalOverride
      ? rootLine!.globalDegrees || 0
      : (line.endPoint as any).degrees || 0;
    const rev = isGlobalOverride
      ? rootLine!.globalReverse
      : (line.endPoint as any).reverse;
    const finalDeg = rev ? constDeg + 180 : constDeg;
    endHeading = unwrapAngle(finalDeg, currentHeading);
    rotationRequired = Math.abs(endHeading - currentHeading);
  } else if (effectiveHeading === "linear") {
    const startDeg = isGlobalOverride
      ? rootLine!.globalStartDeg || 0
      : (line.endPoint as any).startDeg || 0;
    const endDeg = isGlobalOverride
      ? rootLine!.globalEndDeg || 0
      : (line.endPoint as any).endDeg || 0;
    const rev = isGlobalOverride
      ? rootLine!.globalReverse
      : (line.endPoint as any).reverse;

    if (rev) {
      const shortDiff = endDeg - startDeg;
      const normalizedShort = ((shortDiff % 360) + 360) % 360;
      const longDiff =
        normalizedShort <= 180 ? normalizedShort - 360 : normalizedShort;
      const startUnwound = unwrapAngle(startDeg, currentHeading);
      endHeading = startUnwound + longDiff;
      rotationRequired = Math.abs(longDiff);
    } else {
      const startUnwound = unwrapAngle(startDeg, currentHeading);
      const totalDiff = endDeg - startDeg;
      endHeading = startUnwound + totalDiff;
      rotationRequired = Math.abs(totalDiff);
    }
  } else if (effectiveHeading === "facingPoint") {
    const targetX = isGlobalOverride
      ? rootLine!.globalTargetX || 0
      : (line.endPoint as any).targetX || 0;
    const targetY = isGlobalOverride
      ? rootLine!.globalTargetY || 0
      : (line.endPoint as any).targetY || 0;
    const rev = isGlobalOverride
      ? rootLine!.globalReverse
      : (line.endPoint as any).reverse;
    const facingAngle =
      Math.atan2(targetY - line.endPoint.y, targetX - line.endPoint.x) *
      (180 / Math.PI);
    const finalFacing = rev ? facingAngle + 180 : facingAngle;
    endHeading = unwrapAngle(finalFacing, currentHeading);
    rotationRequired = Math.abs(endHeading - currentHeading);
  } else if (effectiveHeading === "piecewise") {
    let targetHeading = currentHeading;
    const cTotalLen = chainMeta ? chainMeta.chainTotalLength : length;
    const cDistBefore = chainMeta ? chainMeta.distanceBefore : 0;
    const segments = isGlobalOverride
      ? rootLine!.globalSegments || []
      : line.endPoint.segments || [];
    const globalT =
      isGlobalOverride && cTotalLen > 0
        ? (cDistBefore + length) / cTotalLen
        : 1;
    let activeSeg = null;
    for (const seg of segments) {
      if (globalT >= seg.tStart && globalT <= seg.tEnd) {
        activeSeg = seg;
        break;
      }
    }
    if (!activeSeg && segments.length > 0)
      activeSeg = segments[segments.length - 1];

    if (activeSeg) {
      if (activeSeg.heading === "constant") {
        let deg = activeSeg.degrees ?? 0;
        if (activeSeg.reverse) deg += 180;
        targetHeading = unwrapAngle(deg, currentHeading);
      } else if (activeSeg.heading === "tangential") {
        targetHeading = unwrapAngle(endHeadingRaw, currentHeading);
      } else if (activeSeg.heading === "linear") {
        let deg = activeSeg.endDeg ?? 0;
        if (activeSeg.reverse) {
          const sDeg = activeSeg.startDeg ?? 0;
          const eDeg = activeSeg.endDeg ?? 0;
          const shortDiff = eDeg - sDeg;
          const normalizedShort = ((shortDiff % 360) + 360) % 360;
          const longDiff =
            normalizedShort <= 180 ? normalizedShort - 360 : normalizedShort;
          const startUnwound = unwrapAngle(sDeg, currentHeading);
          targetHeading = startUnwound + longDiff;
        } else {
          targetHeading = unwrapAngle(deg, currentHeading);
        }
      } else if (activeSeg.heading === "facingPoint") {
        const targetX = activeSeg.targetX || 0;
        const targetY = activeSeg.targetY || 0;
        let angle =
          Math.atan2(targetY - line.endPoint.y, targetX - line.endPoint.x) *
          (180 / Math.PI);
        if (activeSeg.reverse) angle += 180;
        targetHeading = unwrapAngle(angle, currentHeading);
      }
    }
    endHeading = targetHeading;
    rotationRequired = 0;
  }

  if (!Number.isFinite(endHeading)) endHeading = currentHeading;

  return { endHeading, rotationRequired, effectiveHeading, endHeadingRaw };
}
