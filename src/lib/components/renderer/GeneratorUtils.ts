// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import Two from "two.js";
import { Anchor } from "two.js/src/anchor";
import type { Path } from "two.js/src/path";
import type { Line as PathLine } from "two.js/src/shapes/line";
import { getCurvePoint, quadraticToCubic } from "../../../utils/math";
import type { Line, Point } from "../../../types";

export interface RenderContext {
  x: d3.ScaleLinear<number, number>;
  y: d3.ScaleLinear<number, number>;
  uiLength: (inches: number) => number;
  settings: any;
  timePrediction: any;
  percentStore: number;
  dimmedIds: string[];
  multiSelectedPointIds: string[];
  ppI?: number;
  hoveredMarkerId?: string | null;
  selectedLineId?: string | null;
  selectedPointId?: string | null;
  actionRegistry?: any;
  robotXY?: { x: number; y: number } | null;
}

/**
 * Finds the active timeline event based on the current animation progress.
 */
export function findActiveEvent(timePrediction: any, percentStore: number) {
  if (!timePrediction?.timeline?.length) return null;

  const totalDuration = timePrediction.timeline.at(-1)?.endTime || 0;
  const currentSeconds = (percentStore / 100) * totalDuration;

  return (
    timePrediction.timeline.find(
      (e: any) => currentSeconds >= e.startTime && currentSeconds <= e.endTime,
    ) ?? timePrediction.timeline.at(-1)
  );
}

/**
 * Creates an array of Two.Anchor points representing a path segment.
 */
export function createPathAnchors(
  line: Line,
  startPoint: Point,
  ctx: RenderContext,
): Anchor[] {
  const { x, y } = ctx;
  if (line.controlPoints.length > 2) {
    const samples = 100;
    const cps = [startPoint, ...line.controlPoints, line.endPoint];
    let points = [
      new Two.Anchor(
        x(startPoint.x),
        y(startPoint.y),
        0,
        0,
        0,
        0,
        Two.Commands.move,
      ),
    ];
    for (let i = 1; i <= samples; ++i) {
      const point = getCurvePoint(i / samples, cps);
      const anchor = new Two.Anchor(
        x(point.x),
        y(point.y),
        0,
        0,
        0,
        0,
        Two.Commands.line,
      );
      anchor.relative = false;
      points.push(anchor);
    }
    return points;
  } else if (line.controlPoints.length > 0) {
    let cp1 = line.controlPoints[1]
      ? line.controlPoints[0]
      : quadraticToCubic(startPoint, line.controlPoints[0], line.endPoint).Q1;
    let cp2 =
      line.controlPoints[1] ??
      quadraticToCubic(startPoint, line.controlPoints[0], line.endPoint).Q2;
    const a1 = new Two.Anchor(
      x(startPoint.x),
      y(startPoint.y),
      x(startPoint.x),
      y(startPoint.y),
      x(cp1.x),
      y(cp1.y),
      Two.Commands.move,
    );
    const a2 = new Two.Anchor(
      x(line.endPoint.x),
      y(line.endPoint.y),
      x(cp2.x),
      y(cp2.y),
      x(line.endPoint.x),
      y(line.endPoint.y),
      Two.Commands.curve,
    );
    a1.relative = false;
    a2.relative = false;
    return [a1, a2];
  } else {
    return [
      new Two.Anchor(
        x(startPoint.x),
        y(startPoint.y),
        0,
        0,
        0,
        0,
        Two.Commands.move,
      ),
      new Two.Anchor(
        x(line.endPoint.x),
        y(line.endPoint.y),
        0,
        0,
        0,
        0,
        Two.Commands.line,
      ),
    ];
  }
}

/** A Two.js shape for a path line: a straight line, or a curve through its anchors. */
export function createLineElement(
  line: Line,
  startPoint: Point,
  ctx: RenderContext,
): Path | PathLine {
  const anchors = createPathAnchors(line, startPoint, ctx);
  if (line.controlPoints.length === 0) {
    return new Two.Line(anchors[0].x, anchors[0].y, anchors[1].x, anchors[1].y);
  }
  const curve = new Two.Path(anchors);
  curve.automatic = false;
  return curve;
}

/**
 * Configures a Two.Text element with standard styling.
 */
export function setupTextLabel(
  textElem: InstanceType<typeof Two.Text>,
  id: string,
  size: number,
  weight: number | string = "normal",
) {
  textElem.id = id;
  textElem.size = size;
  textElem.leading = 1;
  textElem.family = "ui-sans-serif, system-ui, sans-serif";
  textElem.alignment = "center";
  textElem.baseline = "middle";
  textElem.fill = "white";
  textElem.weight = weight;
  textElem.noStroke();
}
