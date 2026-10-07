// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import Two from "two.js";
import { type RenderContext, setupTextLabel } from "./GeneratorUtils";
import type { ElementCache } from "./ElementCache";
import type {
  Line,
  PiecewiseSegment,
  Point,
  Shape,
  SequenceItem,
} from "../../../types";
import { POINT_RADIUS } from "../../../config";
import { calculateGlobalChainMeta } from "../../../utils/timeCalculator";

export type PointElement =
  | InstanceType<typeof Two.Circle>
  | InstanceType<typeof Two.Group>;

/** A numbered point: a filled circle with its number on top. */
function labelledPoint(
  id: string,
  label: string,
  px: number,
  py: number,
  fill: string,
  ctx: RenderContext,
) {
  const { uiLength } = ctx;
  const pointGroup = new Two.Group();
  pointGroup.id = id;
  const pointElem = new Two.Circle(px, py, uiLength(POINT_RADIUS));
  pointElem.id = `${id}-background`;
  pointElem.fill = fill;
  pointElem.noStroke();
  const pointText = new Two.Text(label, px, py - uiLength(0.15));
  setupTextLabel(pointText, `${id}-text`, uiLength(1.55));
  pointGroup.add(pointElem, pointText);
  return pointGroup;
}

/** The "T" marker for a point a heading faces. */
function targetPoint(
  id: string,
  targetX: number | undefined,
  targetY: number | undefined,
  color: string,
  ctx: RenderContext,
) {
  const { x, y, uiLength } = ctx;
  const pointGroup = new Two.Group();
  pointGroup.id = id;
  const pointElem = new Two.Circle(
    x(targetX || 72),
    y(targetY || 72),
    uiLength(POINT_RADIUS * 0.85),
  );
  pointElem.id = `${id}-background`;
  pointElem.fill = color;
  pointElem.noStroke();
  const pointText = new Two.Text(
    "T",
    x(targetX || 72),
    y(targetY || 72) - uiLength(0.05),
  );
  setupTextLabel(pointText, `${id}-text`, uiLength(1.4), 700);
  pointGroup.add(pointElem, pointText);
  return pointGroup;
}

/**
 * The end point, control points and facing targets of the line at `idx`.
 * `highlighted` holds the ids of its points to draw as selected.
 */
function linePoints(
  line: Line,
  idx: number,
  rootLine: Line | undefined,
  highlighted: Set<string>,
  ctx: RenderContext,
): PointElement[] {
  const { x, y, uiLength } = ctx;
  const points: PointElement[] = [];

  [line.endPoint, ...line.controlPoints].forEach((point, idx1) => {
    const id = `point-${idx + 1}-${idx1}`;
    if (idx1 > 0) {
      points.push(
        labelledPoint(
          id,
          `${idx1}`,
          x(point.x),
          y(point.y),
          highlighted.has(`${id}-background`) ? "#4ade80" : line.color,
          ctx,
        ),
      );
    } else {
      const pointElem = new Two.Circle(
        x(point.x),
        y(point.y),
        uiLength(POINT_RADIUS),
      );
      pointElem.id = id;
      pointElem.fill = highlighted.has(id) ? "#4ade80" : line.color;
      pointElem.noStroke();
      points.push(pointElem);
    }
  });

  const isGlobalOverride = !!(
    rootLine?.globalHeading && rootLine.globalHeading !== "none"
  );

  // Determine which heading info to use for dot rendering
  let targetX: number | undefined;
  let targetY: number | undefined;
  let headingType: string | undefined;
  let segments: PiecewiseSegment[] | undefined;

  if (isGlobalOverride) {
    headingType = rootLine!.globalHeading;
    targetX = rootLine!.globalTargetX;
    targetY = rootLine!.globalTargetY;
    segments = rootLine!.globalSegments;
  } else {
    // Standard local heading
    headingType = line.endPoint!.heading;
    targetX = line.endPoint.targetX;
    targetY = line.endPoint.targetY;
    segments = line.endPoint!.segments;
  }

  const pathColor = line.color || "#60a5fa";
  if (headingType === "facingPoint") {
    points.push(
      targetPoint(`targetpoint-${idx + 1}`, targetX, targetY, pathColor, ctx),
    );
  } else if (headingType === "piecewise") {
    (segments || []).forEach((seg, segIdx) => {
      if (seg.heading === "facingPoint") {
        points.push(
          targetPoint(
            `targetpoint-${idx + 1}-piecewise-${segIdx}`,
            seg.targetX,
            seg.targetY,
            pathColor,
            ctx,
          ),
        );
      }
    });
  }
  return points;
}

export function generatePointElements(
  startPoint: Point,
  lines: Line[],
  shapes: Shape[],
  sequence: SequenceItem[],
  ctx: RenderContext,
  /** Reuses the shapes of points that haven't changed since the last call. */
  cache?: ElementCache<PointElement[]>,
) {
  const { x, y, uiLength, multiSelectedPointIds } = ctx;
  const multiSelectedSet = new Set(multiSelectedPointIds);
  const cached = (key: string, deps: unknown[], build: () => PointElement[]) =>
    cache ? cache.get(key, [...deps, x, y, uiLength], build) : build();

  const chainMeta = calculateGlobalChainMeta(sequence, lines, startPoint);

  // The start point is green when selected, else the first path's colour.
  const startColor = multiSelectedSet.has("point-0-0")
    ? "#4ade80"
    : lines[0]?.color || "#000000"; // Fallback color if lines empty
  const _points: PointElement[] = cached(
    "start",
    [startPoint, startColor],
    () => {
      const startPointElem = new Two.Circle(
        x(startPoint.x),
        y(startPoint.y),
        uiLength(POINT_RADIUS),
      );
      startPointElem.id = `point-0-0`;
      startPointElem.fill = startColor;
      startPointElem.noStroke();
      return [startPointElem];
    },
  ).slice();

  lines.forEach((line, idx) => {
    if (!line?.endPoint || line.hidden) return;
    const rootLine = chainMeta.get(line.id!)?.rootLine;
    // Path points are only drawn as selected when several are selected.
    const highlighted = new Set(
      multiSelectedSet.size > 1
        ? multiSelectedPointIds.filter((id) =>
            id.startsWith(`point-${idx + 1}-`),
          )
        : [],
    );
    _points.push(
      ...cached(
        `line-${idx}`,
        [line, rootLine, [...highlighted].join(",")],
        () => linePoints(line, idx, rootLine, highlighted, ctx),
      ),
    );
  });

  shapes.forEach((shape, shapeIdx) => {
    _points.push(
      ...cached(`obstacle-${shapeIdx}`, [shape], () =>
        shape.vertices.map((vertex, vertexIdx) =>
          labelledPoint(
            `obstacle-${shapeIdx}-${vertexIdx}`,
            `${vertexIdx + 1}`,
            x(vertex.x),
            y(vertex.y),
            shape.color,
            ctx,
          ),
        ),
      ),
    );
  });

  cache?.sweep();
  return _points;
}
