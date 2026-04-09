// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Line, Point } from "../types";

type Point2D = { x: number; y: number };

export function quadraticToCubic(P0: Point2D, P1: Point2D, P2: Point2D) {
  const Q1 = lerp2d(2 / 3, P0, P1);
  const Q2 = lerp2d(2 / 3, P2, P1);
  return { Q1, Q2 };
}

export function easeInOutQuad(x: number): number {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

export function getMousePos(evt: MouseEvent, canvas: SVGSVGElement) {
  const rect = canvas.getBoundingClientRect();
  return {
    x:
      ((evt.clientX - rect.left) / (rect.right - rect.left)) *
      canvas.width.baseVal.value,
    y:
      ((evt.clientY - rect.top) / (rect.bottom - rect.top)) *
      canvas.height.baseVal.value,
  };
}

export function normalizeAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

export function transformAngle(angle: number) {
  return normalizeAngle(angle + 180) - 180;
}

export function getAngularDifference(start: number, end: number): number {
  let diff = normalizeAngle(end) - normalizeAngle(start);

  if (diff > 180) diff -= 360;
  else if (diff < -180) diff += 360;

  return diff;
}

export function shortestRotation(
  startAngle: number,
  endAngle: number,
  percentage: number,
) {
  const diff = getAngularDifference(startAngle, endAngle);
  return startAngle + diff * percentage;
}

export function radiansToDegrees(radians: number) {
  return radians * (180 / Math.PI);
}

export function lerp(ratio: number, start: number, end: number) {
  return start + (end - start) * ratio;
}

export function lerp2d(ratio: number, start: Point2D, end: Point2D) {
  return {
    x: lerp(ratio, start.x, end.x),
    y: lerp(ratio, start.y, end.y),
  };
}

export function getFirstValidControlPoint(
  controlPoints: Point2D[],
  refPoint: Point2D,
  reverse: boolean = false,
): Point2D | null {
  const pts = reverse ? [...controlPoints].reverse() : controlPoints;
  for (const cp of pts) {
    if (getDistance(cp, refPoint) > 1e-6) {
      return cp;
    }
  }
  return null;
}

export function getDistance(p1: Point2D, p2: Point2D) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function getCurvePoint(t: number, points: Point2D[]): Point2D {
  const len = points.length;

  if (len === 0)
    throw new Error("getCurvePoint: points array must not be empty");
  if (len === 1) return points[0];

  if (len === 2) {
    return lerp2d(t, points[0], points[1]);
  } else if (len === 3) {
    const p0 = points[0];
    const p1 = points[1];
    const p2 = points[2];
    const mt = 1 - t;
    const a = mt * mt;
    const b = 2 * mt * t;
    const c = t * t;

    return {
      x: a * p0.x + b * p1.x + c * p2.x,
      y: a * p0.y + b * p1.y + c * p2.y,
    };
  } else if (len === 4) {
    const p0 = points[0];
    const p1 = points[1];
    const p2 = points[2];
    const p3 = points[3];
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;

    const a = mt2 * mt;
    const b = 3 * mt2 * t;
    const c = 3 * mt * t2;
    const d = t2 * t;

    return {
      x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
      y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
    };
  }

  const work = points.slice();
  let n = len;
  while (n > 1) {
    for (let i = 0; i < n - 1; i++) {
      const p = lerp2d(t, work[i], work[i + 1]);
      if (n === len) {
        work[i] = p;
      } else {
        work[i].x = p.x;
        work[i].y = p.y;
      }
    }
    n--;
  }
  return work[0];
}

export function splitBezier(
  t: number,
  points: Point2D[],
): [Point2D[], Point2D[]] {
  const left: Point2D[] = [];
  const right: Point2D[] = [];
  const n = points.length - 1;

  let currentPoints = points.slice();

  left.push(currentPoints[0]);
  right.push(currentPoints[currentPoints.length - 1]);

  for (let i = 0; i < n; i++) {
    const nextPoints: Point2D[] = [];
    for (let j = 0; j < currentPoints.length - 1; j++) {
      nextPoints.push(lerp2d(t, currentPoints[j], currentPoints[j + 1]));
    }
    currentPoints = nextPoints;
    left.push(currentPoints[0]);
    right.push(currentPoints[currentPoints.length - 1]);
  }

  right.reverse();
  return [left, right];
}

export function getTangentAngle(p1: Point2D, p2: Point2D): number {
  return radiansToDegrees(Math.atan2(p2.y - p1.y, p2.x - p1.x));
}

function getHeadingBase(
  endPoint: any,
  refPoint1: Point2D,
  refPoint2: Point2D,
): number {
  const reverseOffset = endPoint.reverse ? 180 : 0;
  if (endPoint.heading === "constant") {
    return transformAngle(endPoint.degrees + reverseOffset);
  }
  if (endPoint.heading === "facingPoint") {
    const angle = getTangentAngle(refPoint1, {
      x: endPoint.targetX || 0,
      y: endPoint.targetY || 0,
    });
    return transformAngle(angle + reverseOffset);
  }
  if (endPoint.heading === "tangential") {
    const angle = getTangentAngle(refPoint1, refPoint2);
    return transformAngle(angle + reverseOffset);
  }
  return 0;
}

export function getLineStartHeading(
  line: Line | undefined,
  previousPoint: Point,
  globalOverride?: Line,
  totalChainDistance?: number,
  distanceBefore?: number,
): number {
  if (!line || !line.endPoint) return 0;

  const isGlobal =
    globalOverride &&
    globalOverride.globalHeading &&
    globalOverride.globalHeading !== "none";

  const effectiveSource = isGlobal
    ? {
        heading: globalOverride!.globalHeading,
        degrees: globalOverride!.globalDegrees,
        startDeg: globalOverride!.globalStartDeg,
        endDeg: globalOverride!.globalEndDeg,
        targetX: globalOverride!.globalTargetX,
        targetY: globalOverride!.globalTargetY,
        reverse: globalOverride!.globalReverse,
        segments: globalOverride!.globalSegments,
      }
    : line.endPoint;

  if (effectiveSource.heading === "linear")
    return (effectiveSource as any).startDeg;

  if (effectiveSource.heading === "piecewise") {
    const segments = (effectiveSource as any).segments || [];
    const t =
      isGlobal && totalChainDistance && totalChainDistance > 0
        ? (distanceBefore || 0) / totalChainDistance
        : 0;

    let activeSeg = null;
    for (const seg of segments) {
      if (t >= seg.tStart && t <= seg.tEnd) {
        activeSeg = seg;
        break;
      }
    }
    if (!activeSeg && segments.length > 0) activeSeg = segments[0];

    if (activeSeg) {
      if (activeSeg.heading === "linear") {
        const sDeg = activeSeg.startDeg ?? 0;
        const eDeg = activeSeg.endDeg ?? 0;
        let localT = 0;
        if (activeSeg.tEnd > activeSeg.tStart) {
          localT = (t - activeSeg.tStart) / (activeSeg.tEnd - activeSeg.tStart);
        }

        const diff = eDeg - sDeg;
        const normalized = ((diff % 360) + 360) % 360;
        const shortest = normalized > 180 ? normalized - 360 : normalized;
        const longest = shortest > 0 ? shortest - 360 : shortest + 360;

        return transformAngle(sDeg + (activeSeg.reverse ? longest : shortest) * localT);
      }
      if (activeSeg.heading === "constant")
        return transformAngle(
          (activeSeg.degrees ?? 0) + (activeSeg.reverse ? 180 : 0),
        );

      let nextP: Point2D = line.endPoint;
      if (activeSeg.heading === "tangential" && line.controlPoints?.length > 0) {
        nextP =
          getFirstValidControlPoint(line.controlPoints, previousPoint) || nextP;
      } else if (activeSeg.heading === "facingPoint") {
        const tx = activeSeg.targetX || 0;
        const ty = activeSeg.targetY || 0;
        // Piecewise start always uses t=0 for geometry lookup
        const pos = previousPoint;
        let angle = Math.atan2(ty - pos.y, tx - pos.x) * (180 / Math.PI);
        if (activeSeg.reverse) angle += 180;
        return transformAngle(angle);
      }
      return getHeadingBase(activeSeg as any, previousPoint, nextP);
    }
    return 0;
  }

  let nextP: Point2D = line.endPoint;
  if (
    effectiveSource.heading === "tangential" &&
    line.controlPoints?.length > 0
  ) {
    nextP =
      getFirstValidControlPoint(line.controlPoints, previousPoint) || nextP;
  }

  return getHeadingBase(effectiveSource as any, previousPoint, nextP);
}

export function getInitialTangentialHeading(
  startPoint: Point,
  nextPoint: Point2D,
): number {
  const angle = getTangentAngle(startPoint, nextPoint);
  return startPoint.reverse ? angle + 180 : angle;
}

export function getLineEndHeading(
  line: Line | undefined,
  previousPoint: Point,
  globalOverride?: Line,
  totalChainDistance?: number,
  distanceAtEnd?: number,
): number {
  if (!line || !line.endPoint) return 0;

  const isGlobal =
    globalOverride &&
    globalOverride.globalHeading &&
    globalOverride.globalHeading !== "none";

  const effectiveSource = isGlobal
    ? {
        heading: globalOverride!.globalHeading,
        degrees: globalOverride!.globalDegrees,
        startDeg: globalOverride!.globalStartDeg,
        endDeg: globalOverride!.globalEndDeg,
        targetX: globalOverride!.globalTargetX,
        targetY: globalOverride!.globalTargetY,
        reverse: globalOverride!.globalReverse,
        segments: globalOverride!.globalSegments,
      }
    : line.endPoint;

  if (effectiveSource.heading === "linear")
    return (effectiveSource as any).endDeg;

  if (effectiveSource.heading === "piecewise") {
    const segments = (effectiveSource as any).segments || [];
    const t =
      isGlobal && totalChainDistance && totalChainDistance > 0
        ? (distanceAtEnd || 0) / totalChainDistance
        : 1.0;

    let lastSeg = null;
    for (const seg of segments) {
      if (t >= seg.tStart && t <= seg.tEnd) {
        lastSeg = seg;
        break;
      }
    }
    if (!lastSeg && segments.length > 0)
      lastSeg = segments[segments.length - 1];

    if (lastSeg) {
      if (lastSeg.heading === "linear") {
        const sDeg = lastSeg.startDeg ?? 0;
        const eDeg = lastSeg.endDeg ?? 0;
        let localT = 0;
        if (lastSeg.tEnd > lastSeg.tStart) {
          localT = (t - lastSeg.tStart) / (lastSeg.tEnd - lastSeg.tStart);
        }

        const diff = eDeg - sDeg;
        const normalized = ((diff % 360) + 360) % 360;
        const shortest = normalized > 180 ? normalized - 360 : normalized;
        const longest = shortest > 0 ? shortest - 360 : shortest + 360;

        return transformAngle(sDeg + (lastSeg.reverse ? longest : shortest) * localT);
      }
      if (lastSeg.heading === "constant")
        return transformAngle(
          (lastSeg.degrees ?? 0) + (lastSeg.reverse ? 180 : 0),
        );

      let prevP: Point2D = previousPoint;
      if (lastSeg.heading === "tangential" && line.controlPoints?.length > 0) {
        prevP =
          getFirstValidControlPoint(line.controlPoints, line.endPoint, true) ||
          prevP;
      } else if (lastSeg.heading === "facingPoint") {
        const tx = lastSeg.targetX || 0;
        const ty = lastSeg.targetY || 0;
        const pos = line.endPoint;
        let angle = Math.atan2(ty - pos.y, tx - pos.x) * (180 / Math.PI);
        if (lastSeg.reverse) angle += 180;
        return transformAngle(angle);
      }
      return getHeadingBase(
        lastSeg as any,
        lastSeg.heading === "facingPoint" ? line.endPoint : prevP,
        line.endPoint,
      );
    }
    return 0;
  }

  let prevP: Point2D = previousPoint;
  if (
    effectiveSource.heading === "tangential" &&
    line.controlPoints?.length > 0
  ) {
    prevP =
      getFirstValidControlPoint(line.controlPoints, line.endPoint, true) ||
      prevP;
  }

  return getHeadingBase(
    effectiveSource as any,
    effectiveSource.heading === "facingPoint" ? line.endPoint : prevP,
    line.endPoint,
  );
}

function getViewportDimension(
  percent: number,
  clientProp: "clientHeight" | "clientWidth",
  innerProp: "innerHeight" | "innerWidth",
) {
  const val = Math.max(
    document.documentElement[clientProp],
    window[innerProp] || 0,
  );
  return (percent * val) / 100;
}

export function vh(percent: number) {
  return getViewportDimension(percent, "clientHeight", "innerHeight");
}

export function vw(percent: number) {
  return getViewportDimension(percent, "clientWidth", "innerWidth");
}
