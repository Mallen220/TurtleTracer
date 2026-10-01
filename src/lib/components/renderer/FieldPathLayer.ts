// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import Two from "two.js";
import { LINE_WIDTH } from "../../../config";
import type { Line, Point, TimePrediction } from "../../../types";
import { generatePathElements } from "./PathGenerator";
import type { RenderContext } from "./GeneratorUtils";

export interface StandardPathParams {
  effectiveTimePrediction: TimePrediction | null;
  lines: Line[];
  sequencedLines: Line[];
  startPoint: Point;
  isDiffMode: boolean;
  selectedLineId: string | null;
  ctx: RenderContext;
}

/** Most points used to draw one recovery path. */
const RECOVERY_DRAW_POINTS = 32;

/**
 * Dashed lines for where the robot goes when it leaves a path at a sharp
 * chained corner, between the two paths.
 */
function buildRecoveryElements(
  timeline: TimePrediction["timeline"],
  ctx: RenderContext,
) {
  return timeline.flatMap((ev, idx) => {
    if (ev.type !== "recovery" || !ev.trace || ev.trace.time.length < 2) {
      return [];
    }
    // Drawing every sample of a long recovery makes redrawing slow (each one
    // is a Two.js anchor, rebuilt on every redraw), and a few dozen points
    // trace the same curve.
    const { x, y } = ev.trace;
    const count = Math.min(x.length, RECOVERY_DRAW_POINTS);
    const anchors = Array.from({ length: count }, (_, i) => {
      const at = Math.round((i * (x.length - 1)) / (count - 1));
      return new Two.Anchor(ctx.x(x[at]), ctx.y(y[at]));
    });
    const path = new Two.Path(anchors, false, false);
    path.noFill();
    path.stroke = "#eab308";
    path.linewidth = ctx.uiLength(LINE_WIDTH);
    path.dashes = [ctx.uiLength(1.5), ctx.uiLength(1.5)];
    path.cap = "round";
    path.join = "round";
    path.id = `recovery-path-${idx}`;
    return [path];
  });
}

/**
 * Builds Two.js elements for standard simulation or fallback path rendering.
 */
export function buildStandardPathElements(params: StandardPathParams) {
  const {
    effectiveTimePrediction,
    lines,
    sequencedLines,
    startPoint,
    isDiffMode,
    selectedLineId,
    ctx,
  } = params;

  if (isDiffMode) return [];

  // Start with standard lines for the basic "lines" array.
  // To include macro/bridge lines, iterate timeline travel events directly when available.
  if (effectiveTimePrediction?.timeline) {
    const travelEvents = effectiveTimePrediction.timeline.filter(
      (e) => e.type === "travel" && e.line,
    );

    const paths = travelEvents.flatMap((ev, idx) => {
      const line = ev.line!;
      const start = ev.prevPoint!;

      const isMainLine = lines.some((l) => l.id === line.id);
      const isSelected = line.id === selectedLineId;
      const width = isSelected
        ? ctx.uiLength(LINE_WIDTH * 2.5)
        : ctx.uiLength(LINE_WIDTH);

      return generatePathElements(
        [line],
        start,
        (l) => l.color || "#60a5fa",
        () => width,
        `timeline-path-${idx}`,
        ctx,
        isMainLine,
      );
    });
    return [
      ...paths,
      ...buildRecoveryElements(effectiveTimePrediction.timeline, ctx),
    ];
  }

  // Fallback if no simulation (e.g. initial load or error)
  return generatePathElements(
    sequencedLines,
    startPoint,
    (l) => l.color,
    (l) =>
      l.id === selectedLineId
        ? ctx.uiLength(LINE_WIDTH * 2.5)
        : ctx.uiLength(LINE_WIDTH),
    "",
    ctx,
    true,
  );
}

export interface DiffPathParams {
  isDiffMode: boolean;
  oldData: { lines: Line[]; startPoint: Point } | null;
  sequencedLines: Line[];
  startPoint: Point;
  diffData: { sameLines: Array<{ id?: string }> } | null;
  ctx: RenderContext;
}

/**
 * Builds Two.js elements for diff mode (old committed paths vs current paths).
 */
export function buildDiffPathElements(params: DiffPathParams) {
  const { isDiffMode, oldData, sequencedLines, startPoint, diffData, ctx } =
    params;

  if (!isDiffMode) return [];

  // 1. Committed Path (Old) - Red
  const committedPaths = oldData
    ? generatePathElements(
        oldData.lines,
        oldData.startPoint,
        () => "#ef4444", // Red
        () => ctx.uiLength(LINE_WIDTH),
        "diff-old",
        ctx,
        false,
      )
    : [];

  // 2. Current Path (New/Same)
  const currentPaths = generatePathElements(
    sequencedLines,
    startPoint,
    (l) => {
      const isSame = diffData?.sameLines.some((sl) => sl.id === l.id);
      if (isSame) return "#3b82f6"; // Blue
      return "#22c55e"; // Green
    },
    () => ctx.uiLength(LINE_WIDTH),
    "diff-new",
    ctx,
    false,
  );

  return [...committedPaths, ...currentPaths];
}
