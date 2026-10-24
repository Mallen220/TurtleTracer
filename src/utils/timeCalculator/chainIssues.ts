// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// The chained corners worth telling the user about, worked out once from the
// timeline so that the statistics, the field markers and the optimizer agree on
// which they are and say one thing about each.
import type {
  Line,
  Point,
  SequenceItem,
  Settings,
  TimelineEvent,
} from "../../types";
import {
  chainJunctions,
  SHARP_TURN_DEGREES,
  type ChainJunction,
} from "./chainMeta";
import { DEFAULT_TRANSLATIONAL_P } from "./chainRecovery";
import {
  PARAMETRIC_END_TOLERANCE,
  pathDirectionAt,
  pedroClosestParameter,
} from "./pedroClosest";

/** Passing this far (inches) from the point two chained paths join is worth a warning. */
const MISSED_POINT_WARNING = 3;
/** Below this translational P the messages point out the gain is very low. */
const LOW_TRANSLATIONAL_P = 0.05;
/** A swing past the path smaller than this isn't worth mentioning (inches). */
const SMALL_SWING = 0.5;

export interface ChainCornerIssue {
  /** Index in `lines` of the path the robot is steered onto. */
  lineIndex: number;
  /** Where the two paths join. */
  x: number;
  y: number;
  /** "error" if the robot never gets back onto the next path, else "warning". */
  severity: "warning" | "error";
  startTime: number;
  endTime: number;
  message: string;
  /** The number that matters most here, with what it is, for display. */
  value: number;
  valueLabel: string;
}

const inches = (n: number) => `${n.toFixed(1)} in`;

/** Where a chained corner is, and how sharp. */
interface Corner {
  x: number;
  y: number;
  turn: number;
  /** "chained corner (90°)", or just "chained corner" where the turn is unknown. */
  name: string;
}

/** How far the robot swings past the path, and how far from the join it passes. */
interface Excursion {
  swing: number;
  missed: number;
}

/** The robot is still not back on the next path when the simulation gives up on it. */
function unsettledIssue(
  ev: TimelineEvent,
  corner: Corner,
  swing: number,
  gain: number,
): ChainCornerIssue {
  const hint =
    gain <= LOW_TRANSLATIONAL_P
      ? ` Your translational P (${gain}) is very low, so the robot can barely correct.`
      : "";
  return {
    lineIndex: ev.lineIndex ?? -1,
    x: corner.x,
    y: corner.y,
    severity: "error",
    startTime: ev.startTime,
    endTime: ev.endTime,
    message: `After this ${corner.name} the robot is still not back on the next path after ${ev.duration.toFixed(1)} s. It probably can't follow the next path at this speed; slow down, soften the corner, or unchain the paths.${hint}`,
    value: swing,
    valueLabel: `Swing: ${inches(swing)}`,
  };
}

/** A sharp turn, or a corner cut so the join is missed, that the robot did get through. */
function warningIssue(
  ev: TimelineEvent,
  corner: Corner,
  { swing, missed }: Excursion,
): ChainCornerIssue | null {
  const sharp = corner.turn >= SHARP_TURN_DEGREES;
  const cut = missed > MISSED_POINT_WARNING;
  if (!sharp && !cut) return null;

  // One sentence on what the robot does, one on the point it misses.
  const does =
    swing >= SMALL_SWING
      ? `swings about ${inches(swing)} past the next path`
      : "slows right down";
  const first = sharp
    ? `Sharp ${corner.name}: a robot can't change direction instantly, so the simulation has it ${does}, taking ${ev.duration.toFixed(1)} s to get back on the path.`
    : `The robot cuts this ${corner.name}.`;
  const where = `(${corner.x.toFixed(1)}, ${corner.y.toFixed(1)})`;
  const second = cut
    ? ` It passes ${inches(missed)} from the point the paths join at ${where}; if it has to reach that point, unchain the paths or slow down.`
    : "";
  return {
    lineIndex: ev.lineIndex ?? -1,
    x: corner.x,
    y: corner.y,
    severity: "warning",
    startTime: ev.startTime,
    endTime: ev.endTime,
    message: first + second,
    value: sharp ? swing : missed,
    valueLabel: sharp
      ? `Swing: ${inches(swing)}`
      : `Missed by: ${inches(missed)}`,
  };
}

/** Past this far along the next path, its nearest point is far enough on to matter. */
const FAR_ALONG = 0.5;

/**
 * Where Pedro puts the robot on the next path when it takes over: the nearest
 * point of the path, which for a path that curves back toward the robot can be
 * its far end. Null if that is near the start, as it should be.
 */
function farEndIssue(
  ev: TimelineEvent,
  corner: Corner,
): ChainCornerIssue | null {
  const next = ev.line;
  const from = ev.trace;
  if (!next || !ev.prevPoint || !from || from.x.length === 0) return null;

  const curve = [ev.prevPoint, ...next.controlPoints, next.endPoint];
  const t = pedroClosestParameter(curve, { x: from.x[0], y: from.y[0] }, 0);
  if (t < FAR_ALONG) return null;

  const name = next.name || "the next path";
  const finished = t >= 1 - PARAMETRIC_END_TOLERANCE;
  const there = Math.round(pathDirectionAt(curve, t));
  const start = Math.round(pathDirectionAt(curve, 0));
  const reshape =
    "Unchain the paths so the robot stops at the corner first, or reshape the path so its start is nearer the robot, or give it a constant or linear heading.";
  const message = finished
    ? `When ${name} takes over, the nearest point of it is its very end (${Math.round(t * 100)}% along; Pedro counts a path as finished past ${Math.round((1 - PARAMETRIC_END_TOLERANCE) * 100)}% by default), because the path curves back toward the robot. Pedro would treat it as finished at once and skip it. ${reshape}`
    : `When ${name} takes over, its far end is nearer the robot than its start: Pedro's nearest point is ${Math.round(t * 100)}% along, where the path points ${there}°, not the ${start}° it starts at. It steers by that, so the robot faces and drives toward ${there}° first, then swings back once the start is nearer. ${reshape}`;
  return {
    lineIndex: ev.lineIndex ?? -1,
    x: corner.x,
    y: corner.y,
    severity: finished ? "error" : "warning",
    startTime: ev.startTime,
    endTime: ev.endTime,
    message,
    value: t * 100,
    valueLabel: `Nearest point: ${Math.round(t * 100)}% along`,
  };
}

/** Where the recovery after a chained corner happens, and how sharp the corner is. */
function cornerOf(
  ev: TimelineEvent,
  joints: Map<number, ChainJunction>,
): Corner {
  const joint = joints.get(ev.lineIndex ?? -1);
  const turn = joint?.turnDegrees ?? 0;
  return {
    x: joint?.x ?? ev.prevPoint?.x ?? 0,
    y: joint?.y ?? ev.prevPoint?.y ?? 0,
    turn,
    name: turn > 0 ? `chained corner (${Math.round(turn)}°)` : "chained corner",
  };
}

/**
 * The corners between chained paths the robot struggles with: it never gets
 * back onto the next path, or the turn is sharp, or it cuts the corner so
 * that it misses the point the paths join at, or the far end of the next path
 * is nearer the robot than its start, so Pedro steers by that. Each corner is
 * reported once.
 */
export function chainCornerIssues(
  timeline: TimelineEvent[],
  startPoint: Point,
  lines: Line[],
  sequence: SequenceItem[],
  settings: Settings,
): ChainCornerIssue[] {
  const joints = new Map(
    chainJunctions(startPoint, lines, sequence).map((j) => [j.lineIndex, j]),
  );
  const gain = settings.translationalP ?? DEFAULT_TRANSLATIONAL_P;

  return timeline
    .filter((ev) => ev.type === "recovery")
    .flatMap((ev) => {
      const corner = cornerOf(ev, joints);
      const swing = ev.overshoot ?? 0;
      const issue =
        ev.settled === false
          ? unsettledIssue(ev, corner, swing, gain)
          : warningIssue(ev, corner, { swing, missed: ev.missedBy ?? 0 });
      const far = farEndIssue(ev, corner);
      if (!issue) return far ? [far] : [];
      if (!far) return [issue];
      // One report for the corner, with both.
      return [
        {
          ...issue,
          severity:
            issue.severity === "error" || far.severity === "error"
              ? "error"
              : "warning",
          message: `${issue.message} ${far.message}`,
        },
      ];
    });
}
