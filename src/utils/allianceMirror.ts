// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Mirrors a project onto the other alliance's half of the field, the same way
// TurtleTracerLib's FieldMirror does on the robot. Used to preview a path as
// it will run for the other alliance; the project itself is never changed.
import type {
  Line,
  Point,
  RecoveryTrace,
  TimelineEvent,
  TimePrediction,
} from "../types";

/** Which field axes are flipped: the same values as TurtleTracerLib's MirrorAxes. */
export type MirrorAxes = "BOTH" | "X" | "Y";

export interface FieldMirror {
  axes: MirrorAxes;
  /** Field width in inches. */
  width: number;
  /** Field height in inches. */
  height: number;
}

const flipsX = (m: FieldMirror) => m.axes !== "Y";
const flipsY = (m: FieldMirror) => m.axes !== "X";

export const mirrorX = (x: number, m: FieldMirror) =>
  flipsX(m) ? m.width - x : x;
export const mirrorY = (y: number, m: FieldMirror) =>
  flipsY(m) ? m.height - y : y;

/** A field heading in degrees (counter-clockwise, 0 along +x), mirrored, in [-180, 180). */
export function mirrorDegrees(degrees: number, m: FieldMirror): number {
  let d = degrees;
  if (flipsX(m)) d = 180 - d;
  if (flipsY(m)) d = -d;
  return ((((d + 180) % 360) + 360) % 360) - 180;
}

/**
 * The playback robot's heading mirrored. It is stored as the negative of
 * the field heading (the way the field is drawn), so it is converted first.
 */
export function mirrorRobotHeading(heading: number, m: FieldMirror): number {
  return -mirrorDegrees(-heading, m);
}

/** Mirrors the heading settings on a point, a piecewise segment or a chain. */
function mirrorHeadingFields<T extends Record<string, any>>(
  h: T,
  m: FieldMirror,
  prefix: "" | "global" = "",
): T {
  const out: Record<string, any> = { ...h };
  const key = (name: string) =>
    prefix ? `${prefix}${name[0].toUpperCase()}${name.slice(1)}` : name;
  for (const name of ["degrees", "startDeg", "endDeg"]) {
    const k = key(name);
    if (typeof out[k] === "number") out[k] = mirrorDegrees(out[k], m);
  }
  if (typeof out[key("targetX")] === "number") {
    out[key("targetX")] = mirrorX(out[key("targetX")], m);
  }
  if (typeof out[key("targetY")] === "number") {
    out[key("targetY")] = mirrorY(out[key("targetY")], m);
  }
  const segmentsKey = key("segments");
  if (Array.isArray(out[segmentsKey])) {
    out[segmentsKey] = out[segmentsKey].map((s: Record<string, any>) =>
      mirrorHeadingFields(s, m),
    );
  }
  return out as T;
}

/** A point (with its heading settings) on the other alliance's half. */
export function mirrorPoint<T extends Point>(p: T, m: FieldMirror): T {
  return {
    ...mirrorHeadingFields(p, m),
    x: mirrorX(p.x, m),
    y: mirrorY(p.y, m),
  };
}

/** A path on the other alliance's half: its points, headings and markers. */
export function mirrorLine(line: Line, m: FieldMirror): Line {
  return {
    ...mirrorHeadingFields(line, m, "global"),
    endPoint: mirrorPoint(line.endPoint, m),
    ...(line.startPoint ? { startPoint: mirrorPoint(line.startPoint, m) } : {}),
    controlPoints: line.controlPoints.map((cp) => ({
      ...cp,
      x: mirrorX(cp.x, m),
      y: mirrorY(cp.y, m),
    })),
    eventMarkers: line.eventMarkers?.map((marker) => ({
      ...marker,
      poseX:
        typeof marker.poseX === "number"
          ? mirrorX(marker.poseX, m)
          : marker.poseX,
      poseY:
        typeof marker.poseY === "number"
          ? mirrorY(marker.poseY, m)
          : marker.poseY,
      poseHeading:
        typeof marker.poseHeading === "number"
          ? mirrorDegrees(marker.poseHeading, m)
          : marker.poseHeading,
    })),
  };
}

/** A recorded robot track (a recovery or a run-wide excursion), mirrored. */
function mirrorTrace(trace: RecoveryTrace, m: FieldMirror): RecoveryTrace {
  return {
    ...trace,
    x: trace.x.map((x) => mirrorX(x, m)),
    y: trace.y.map((y) => mirrorY(y, m)),
    heading: trace.heading.map((h) => mirrorDegrees(h, m)),
  };
}

/** A timeline step with the geometry it draws mirrored; its timing is the same. */
function mirrorEvent(ev: TimelineEvent, m: FieldMirror): TimelineEvent {
  return {
    ...ev,
    ...(ev.line ? { line: mirrorLine(ev.line, m) } : {}),
    ...(ev.rootLine ? { rootLine: mirrorLine(ev.rootLine, m) } : {}),
    ...(ev.prevPoint ? { prevPoint: mirrorPoint(ev.prevPoint, m) } : {}),
    ...(ev.atPoint
      ? {
          atPoint: {
            ...ev.atPoint,
            x: mirrorX(ev.atPoint.x, m),
            y: mirrorY(ev.atPoint.y, m),
          },
        }
      : {}),
    ...(ev.trace ? { trace: mirrorTrace(ev.trace, m) } : {}),
    ...(ev.excursion
      ? {
          excursion: {
            ...ev.excursion,
            trace: mirrorTrace(ev.excursion.trace, m),
          },
        }
      : {}),
  };
}

/**
 * A time prediction whose timeline draws the mirrored path. Mirroring keeps
 * every length and turn, so the timing and speeds are the same; only where
 * things are drawn changes.
 */
export function mirrorTimePrediction<
  T extends TimePrediction | null | undefined,
>(prediction: T, m: FieldMirror): T {
  if (!prediction?.timeline) return prediction;
  return {
    ...prediction,
    timeline: prediction.timeline.map((ev) => mirrorEvent(ev, m)),
  };
}
