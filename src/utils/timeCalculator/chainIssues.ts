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
import { chainJunctions, SHARP_TURN_DEGREES } from "./chainMeta";
import { DEFAULT_TRANSLATIONAL_P } from "./chainRecovery";

/** Passing this far (inches) from the point two chained paths join is worth a warning. */
export const MISSED_POINT_WARNING = 3;
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

/**
 * The corners between chained paths the robot struggles with: it never gets
 * back onto the next path, or the turn is sharp, or it cuts the corner so
 * that it misses the point the paths join at. Each corner is reported once.
 */
export function chainCornerIssues(
  timeline: TimelineEvent[],
  startPoint: Point,
  lines: Line[],
  sequence: SequenceItem[],
  settings: Settings,
): ChainCornerIssue[] {
  const turns = new Map(
    chainJunctions(startPoint, lines, sequence).map((j) => [j.lineIndex, j]),
  );
  const gain = settings.translationalP ?? DEFAULT_TRANSLATIONAL_P;
  const issues: ChainCornerIssue[] = [];

  for (const ev of timeline) {
    if (ev.type !== "recovery") continue;
    const joint = turns.get(ev.lineIndex ?? -1);
    const turn = joint?.turnDegrees ?? 0;
    const x = joint?.x ?? ev.prevPoint?.x ?? 0;
    const y = joint?.y ?? ev.prevPoint?.y ?? 0;
    const swing = ev.overshoot ?? 0;
    const missed = ev.missedBy ?? 0;
    const where = `(${x.toFixed(1)}, ${y.toFixed(1)})`;
    const corner =
      turn > 0 ? `chained corner (${Math.round(turn)}°)` : "chained corner";

    if (ev.settled === false) {
      const hint =
        gain <= LOW_TRANSLATIONAL_P
          ? ` Your translational P (${gain}) is very low, so the robot can barely correct.`
          : "";
      issues.push({
        lineIndex: ev.lineIndex ?? -1,
        x,
        y,
        severity: "error",
        startTime: ev.startTime,
        endTime: ev.endTime,
        message: `After this ${corner} the robot is still not back on the next path after ${ev.duration.toFixed(1)} s. It probably can't follow the next path at this speed; slow down, soften the corner, or unchain the paths.${hint}`,
        value: swing,
        valueLabel: `Swing: ${inches(swing)}`,
      });
      continue;
    }

    const sharp = turn >= SHARP_TURN_DEGREES;
    const cut = missed > MISSED_POINT_WARNING;
    if (!sharp && !cut) continue;

    // One sentence on what the robot does, one on the point it misses.
    const does =
      swing >= SMALL_SWING
        ? `swings about ${inches(swing)} past the next path`
        : "slows right down";
    const first = sharp
      ? `Sharp ${corner}: a robot can't change direction instantly, so the simulation has it ${does}, taking ${ev.duration.toFixed(1)} s to get back on the path.`
      : `The robot cuts this ${corner}.`;
    const second = cut
      ? ` It passes ${inches(missed)} from the point the paths join at ${where}; if it has to reach that point, unchain the paths or slow down.`
      : "";
    issues.push({
      lineIndex: ev.lineIndex ?? -1,
      x,
      y,
      severity: "warning",
      startTime: ev.startTime,
      endTime: ev.endTime,
      message: first + second,
      value: sharp ? swing : missed,
      valueLabel: sharp
        ? `Swing: ${inches(swing)}`
        : `Missed by: ${inches(missed)}`,
    });
  }
  return issues;
}
