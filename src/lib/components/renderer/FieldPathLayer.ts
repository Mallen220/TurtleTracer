// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
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

    return travelEvents.flatMap((ev, idx) => {
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
