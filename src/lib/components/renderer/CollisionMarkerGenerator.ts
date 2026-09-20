// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import Two from "two.js";
import type { Anchor } from "two.js/src/anchor";
import type {
  CollisionMarker,
  Line,
  Point,
  TimelineEvent,
  TimePrediction,
} from "../../../types";
import { robotPoseDuring } from "../../../utils/animation";

interface RenderContext {
  x: d3.ScaleLinear<number, number>;
  y: d3.ScaleLinear<number, number>;
  uiLength: (inches: number) => number;
}

type Colors = {
  fill: string;
  stroke: string;
  glowFill: string;
  glowStroke: string;
};

function colorsFor(rgb: string, stroke: string): Colors {
  return {
    fill: `rgba(${rgb}, 0.5)`,
    stroke,
    glowFill: `rgba(${rgb}, 0.3)`,
    glowStroke: `rgba(${rgb}, 0.5)`,
  };
}

const OBSTACLE_COLORS = colorsFor("239, 68, 68", "#ef4444"); // Red-500
const COLORS: Partial<Record<NonNullable<CollisionMarker["type"]>, Colors>> = {
  boundary: colorsFor("249, 115, 22", "#f97316"), // Orange-500
  "zero-length": colorsFor("217, 70, 239", "#d946ef"), // Fuchsia-500
  "keep-in": colorsFor("59, 130, 246", "#3b82f6"), // Blue-500
};

/** Number of steps used to trace a collision range along a path. */
const RANGE_SAMPLES = 30;

export function generateCollisionElements(
  markers: CollisionMarker[],
  lines: Line[],
  startPoint: Point,
  timePrediction: TimePrediction | null | undefined,
  ctx: RenderContext,
) {
  const { x, y, uiLength } = ctx;

  const dot = (px: number, py: number, colors: Colors) => {
    const circle = new Two.Circle(x(px), y(py), uiLength(2));
    circle.fill = colors.fill;
    circle.stroke = colors.stroke;
    circle.linewidth = uiLength(0.5);
    return circle;
  };

  const stroke = (anchors: Anchor[], color: string, width: number) => {
    const path = new Two.Path(anchors, false, false);
    path.noFill();
    path.stroke = color;
    path.linewidth = uiLength(width);
    path.cap = "round";
    path.join = "round";
    return path;
  };

  /** Where the robot was over [start, end], traced event by event. */
  const drawRange = (
    group: InstanceType<typeof Two.Group>,
    timeline: TimelineEvent[],
    start: number,
    end: number,
    colors: Colors,
  ) => {
    for (const ev of timeline) {
      if (ev.endTime < start || ev.startTime > end) continue;

      if (ev.type === "wait") {
        if (ev.atPoint) group.add(dot(ev.atPoint.x, ev.atPoint.y, colors));
        continue;
      }
      if (ev.type !== "travel") continue;

      const from = Math.max(start, ev.startTime);
      const to = Math.min(end, ev.endTime);
      const anchors: Anchor[] = [];
      for (let i = 0; i <= RANGE_SAMPLES; i++) {
        const seconds = from + ((to - from) * i) / RANGE_SAMPLES;
        const pose = robotPoseDuring(ev, seconds, lines, startPoint);
        if (pose) anchors.push(new Two.Anchor(x(pose.x), y(pose.y)));
      }
      if (anchors.length === 0) continue;

      group.add(stroke(anchors, colors.stroke, 2));
      const glow = stroke(anchors, colors.glowStroke, 6);
      glow.opacity = 0.5;
      group.add(glow);
    }
  };

  /** A dot with a white cross through it, in a soft halo. */
  const drawPoint = (
    group: InstanceType<typeof Two.Group>,
    marker: CollisionMarker,
    colors: Colors,
  ) => {
    const cx = x(marker.x);
    const cy = y(marker.y);
    const arm = uiLength(1.5);
    const cross = (x1: number, y1: number, x2: number, y2: number) => {
      const line = new Two.Line(x1, y1, x2, y2);
      line.stroke = "#ffffff";
      line.linewidth = uiLength(0.5);
      return line;
    };

    const glow = new Two.Circle(cx, cy, uiLength(6));
    glow.fill = colors.glowFill;
    glow.stroke = colors.glowStroke;
    glow.linewidth = uiLength(0.5);

    group.add(
      glow,
      dot(marker.x, marker.y, colors),
      cross(cx - arm, cy - arm, cx + arm, cy + arm),
      cross(cx + arm, cy - arm, cx - arm, cy + arm),
    );
  };

  return markers.map((marker) => {
    const group = new Two.Group();
    const colors = (marker.type && COLORS[marker.type]) || OBSTACLE_COLORS;
    const timeline = timePrediction?.timeline;

    if (
      marker.endTime !== undefined &&
      marker.endTime > marker.time &&
      timeline
    ) {
      drawRange(group, timeline, marker.time, marker.endTime, colors);
    } else {
      drawPoint(group, marker, colors);
    }
    return group;
  });
}
