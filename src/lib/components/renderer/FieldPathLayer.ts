// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import Two from "two.js";
import type { Anchor } from "two.js/src/anchor";
import { LINE_WIDTH } from "../../../config";
import type {
  Line,
  Point,
  RecoveryTrace,
  TimePrediction,
} from "../../../types";
import {
  generatePathElements,
  speedColor,
  type PathElement,
} from "./PathGenerator";
import type { RenderContext } from "./GeneratorUtils";
import type { ElementCache } from "./ElementCache";

export interface StandardPathParams {
  effectiveTimePrediction: TimePrediction | null;
  lines: Line[];
  sequencedLines: Line[];
  startPoint: Point;
  isDiffMode: boolean;
  selectedLineId: string | null;
  ctx: RenderContext;
  /** Reuses the shapes of lines that haven't changed since the last call. */
  cache?: ElementCache<PathElement[]>;
}

/** Most points used to draw one recovery path. */
const RECOVERY_DRAW_POINTS = 32;
/** Most points used to draw one recovery path in heatmap colours. */
const RECOVERY_HEATMAP_POINTS = 100;

/**
 * Where the robot goes when it leaves a path at a sharp chained corner,
 * between the two paths: dashed, or with the velocity heatmap on, coloured
 * by its speed like the paths it joins. (Macro paths aren't coloured.)
 */
function buildRecoveryElements(
  timeline: TimePrediction["timeline"],
  lines: Line[],
  ctx: RenderContext,
): PathElement[] {
  return timeline.flatMap((ev, idx) => {
    if (ev.type !== "recovery" || !ev.trace || ev.trace.time.length < 2) {
      return [];
    }
    const coloured =
      ctx.settings.showVelocityHeatmap &&
      lines.some((l) => l.id === ev.line?.id);
    return coloured
      ? swingHeatmap(ev.trace, idx, ctx)
      : [dashedSwing(ev.trace, idx, ctx)];
  });
}

/**
 * Indices of the samples to draw a recovery with. Drawing every sample of a
 * long recovery makes redrawing slow (each one is a Two.js anchor), and a
 * few dozen points trace the same curve.
 */
function drawnSamples(length: number, most: number): number[] {
  const count = Math.min(length, most);
  return Array.from({ length: count }, (_, i) =>
    Math.round((i * (length - 1)) / (count - 1)),
  );
}

function swingPath(anchors: Anchor[], id: string, ctx: RenderContext) {
  const path = new Two.Path(anchors, false, false);
  path.noFill();
  path.linewidth = ctx.uiLength(LINE_WIDTH);
  path.cap = "round";
  path.join = "round";
  path.id = id;
  return path;
}

function dashedSwing(trace: RecoveryTrace, idx: number, ctx: RenderContext) {
  const anchors = drawnSamples(trace.x.length, RECOVERY_DRAW_POINTS).map(
    (i) => new Two.Anchor(ctx.x(trace.x[i]!), ctx.y(trace.y[i]!)),
  );
  const path = swingPath(anchors, `recovery-path-${idx}`, ctx);
  path.stroke = "#eab308";
  path.dashes = [ctx.uiLength(1.5), ctx.uiLength(1.5)];
  return path;
}

/** A recovery split into runs coloured by the robot's speed along it. */
function swingHeatmap(
  trace: RecoveryTrace,
  idx: number,
  ctx: RenderContext,
): PathElement[] {
  const topSpeed = ctx.settings.maxVelocity || 100;
  const samples = drawnSamples(trace.x.length, RECOVERY_HEATMAP_POINTS);
  const anchor = (
    i: number,
    command: typeof Two.Commands.move | typeof Two.Commands.line,
  ) =>
    new Two.Anchor(ctx.x(trace.x[i]!), ctx.y(trace.y[i]!), 0, 0, 0, 0, command);
  const segments: PathElement[] = [];
  let anchors: Anchor[] = [];
  let color = "";
  const flush = () => {
    const path = swingPath(
      anchors,
      `recovery-path-${idx}-heatmap-${segments.length}`,
      ctx,
    );
    path.stroke = color;
    segments.push(path);
  };
  for (let s = 1; s < samples.length; s++) {
    const [from, to] = [samples[s - 1]!, samples[s]!];
    // The speed halfway between the two points drawn.
    const next = speedColor(
      trace.speed[Math.round((from + to) / 2)]!,
      topSpeed,
    );
    if (next !== color) {
      if (anchors.length > 0) flush();
      anchors = [anchor(from, Two.Commands.move)];
      color = next;
    }
    anchors.push(anchor(to, Two.Commands.line));
  }
  flush();
  return segments;
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
    cache,
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

      // The heatmap shows how fast the robot drives this stretch, which is
      // this event's own profile. Macro paths aren't coloured.
      return generatePathElements(
        [line],
        start,
        (l) => l.color || "#60a5fa",
        () => width,
        `timeline-path-${idx}`,
        ctx,
        isMainLine ? () => ev : undefined,
        cache,
      );
    });
    cache?.sweep();
    return [
      ...paths,
      ...buildRecoveryElements(effectiveTimePrediction.timeline, lines, ctx),
    ];
  }

  // Fallback if no simulation (e.g. initial load, an error, or while
  // dragging). Without a timeline there are no speeds for a heatmap.
  const paths = generatePathElements(
    sequencedLines,
    startPoint,
    (l) => l.color,
    (l) =>
      l.id === selectedLineId
        ? ctx.uiLength(LINE_WIDTH * 2.5)
        : ctx.uiLength(LINE_WIDTH),
    "",
    ctx,
    undefined,
    cache,
  );
  cache?.sweep();
  return paths;
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
  );

  return [...committedPaths, ...currentPaths];
}
