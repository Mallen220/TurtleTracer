// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Macros embed another project file in the sequence. Expanding one produces
// the locked lines and steps it adds to the open project, plus a "bridge"
// path from wherever the robot is to the macro's start.
import type {
  Line,
  Point,
  SequenceItem,
  SequenceMacroItem,
  TurtleData,
  Transformation,
} from "../types";
import {
  getDistance,
  getLineStartHeading,
  getLineEndHeading,
  getAngularDifference,
} from "../utils/math";
import { startingHeading } from "../utils/timeCalculator/pathCalculator";
import { makeId } from "../utils/nameGenerator";
import { pathInMessage } from "../utils/messagePaths";

type XY = { x: number; y: number };

const FIELD_CENTER: XY = { x: 72, y: 72 };

/** Deeper nesting than this is treated as a mistake rather than expanded. */
export const MAX_MACRO_DEPTH = 50;

/** `target` moved by whole turns to within 180 degrees of `reference`. */
function unwrapAngle(target: number, reference: number): number {
  return reference + getAngularDifference(reference, target);
}

/** Paths compare equal regardless of slash direction or case. */
function normalizePath(p: string): string {
  return p ? p.replaceAll("\\", "/").toLowerCase() : "";
}

// --- Transformations (translate / rotate / flip a macro in place) ---

function resolvePivot(pivot: Transformation["pivot"], center: XY): XY {
  if (!pivot || pivot === "origin") return FIELD_CENTER;
  if (pivot === "center") return center;
  return pivot;
}

function transformPoint(p: XY, t: Transformation, pivot: XY) {
  if (t.type === "translate") {
    p.x += t.dx || 0;
    p.y += t.dy || 0;
  } else if (t.type === "rotate" && t.degrees) {
    const rad = (t.degrees * Math.PI) / 180;
    const dx = p.x - pivot.x;
    const dy = p.y - pivot.y;
    p.x = pivot.x + (dx * Math.cos(rad) - dy * Math.sin(rad));
    p.y = pivot.y + (dx * Math.sin(rad) + dy * Math.cos(rad));
  } else if (t.type === "flip" && t.axis === "horizontal") {
    p.x = 2 * pivot.x - p.x;
  } else if (t.type === "flip" && t.axis === "vertical") {
    p.y = 2 * pivot.y - p.y;
  }
}

function transformHeading(degrees: number, t: Transformation): number {
  if (t.type === "rotate") return degrees + (t.degrees || 0);
  if (t.type === "flip" && t.axis === "horizontal") return 180 - degrees;
  if (t.type === "flip" && t.axis === "vertical") return -degrees;
  return degrees;
}

// The heading fields shared by points, piecewise segments and a chain's
// global heading.
type HeadingSettings = {
  heading?: string;
  degrees?: number;
  startDeg?: number;
  endDeg?: number;
  targetX?: number;
  targetY?: number;
  segments?: HeadingSettings[];
};

/** Turns (or re-aims) a heading setting to match the transformed path. */
function transformHeadingSettings(
  h: HeadingSettings,
  t: Transformation,
  pivot: XY,
) {
  if (h.heading === "constant") {
    h.degrees = transformHeading(h.degrees ?? 0, t);
  } else if (h.heading === "linear") {
    h.startDeg = transformHeading(h.startDeg ?? 0, t);
    h.endDeg = transformHeading(h.endDeg ?? 0, t);
  } else if (h.heading === "facingPoint") {
    const target = { x: h.targetX ?? 0, y: h.targetY ?? 0 };
    transformPoint(target, t, pivot);
    h.targetX = target.x;
    h.targetY = target.y;
  } else if (h.heading === "piecewise") {
    for (const seg of h.segments ?? []) transformHeadingSettings(seg, t, pivot);
  }
}

/** Transforms a chain's global heading, stored as `global*` fields. */
function transformGlobalHeading(line: Line, t: Transformation, pivot: XY) {
  if (!line.globalHeading || line.globalHeading === "none") return;
  const h: HeadingSettings = {
    heading: line.globalHeading,
    degrees: line.globalDegrees,
    startDeg: line.globalStartDeg,
    endDeg: line.globalEndDeg,
    targetX: line.globalTargetX,
    targetY: line.globalTargetY,
    segments: line.globalSegments,
  };
  transformHeadingSettings(h, t, pivot);
  line.globalDegrees = h.degrees;
  line.globalStartDeg = h.startDeg;
  line.globalEndDeg = h.endDeg;
  line.globalTargetX = h.targetX;
  line.globalTargetY = h.targetY;
}

/** Centre of the box around the macro's points. */
function boundingBoxCenter(data: TurtleData): XY {
  const points: XY[] = [data.startPoint];
  for (const line of data.lines) {
    if (line?.endPoint) points.push(line.endPoint, ...line.controlPoints);
  }
  const xs = points.filter(Boolean).map((p) => p.x);
  const ys = points.filter(Boolean).map((p) => p.y);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

/**
 * A transformed copy of the macro's data. Also returns the transforms with
 * their pivots as coordinates, so nested macros move with their parent.
 */
function transformMacroData(
  data: TurtleData,
  transforms: Transformation[] = [],
): { data: TurtleData; resolvedTransforms: Transformation[] } {
  // The original is shared by every use of the macro, so work on a copy.
  const copy: TurtleData = structuredClone(data);
  const resolvedTransforms: Transformation[] = [];

  for (const t of transforms) {
    const pivot = resolvePivot(t.pivot, boundingBoxCenter(copy));

    transformPoint(copy.startPoint, t, pivot);
    transformHeadingSettings(copy.startPoint, t, pivot);
    for (const line of copy.lines) {
      transformPoint(line.endPoint, t, pivot);
      transformHeadingSettings(line.endPoint, t, pivot);
      transformGlobalHeading(line, t, pivot);
      for (const cp of line.controlPoints) transformPoint(cp, t, pivot);
    }
    for (const item of copy.sequence ?? []) {
      if (item.kind === "rotate")
        item.degrees = transformHeading(item.degrees, t);
    }

    resolvedTransforms.push({ ...t, pivot });
  }

  return { data: copy, resolvedTransforms };
}

// --- Expansion ---

/** The heading after driving `line` from `start`, kept near `heading`. */
function headingAfter(line: Line, start: Point, heading: number): number {
  const end = line.endPoint;
  if (end.heading === "constant") return end.degrees;
  if (end.heading === "linear") return end.endDeg;
  return unwrapAngle(getLineEndHeading(line, start), heading);
}

/** The path from where the robot is to the start of the macro. */
function bridgeLine(macro: SequenceMacroItem, from: Point, to: Point): Line {
  const tag = { isMacroElement: true, macroId: macro.id };
  // A constant heading is kept; otherwise the bridge simply drives forward
  // (or backward, if the macro starts reversed and tangential).
  const endPoint: Point =
    to.heading === "constant"
      ? { x: to.x, y: to.y, heading: "constant", degrees: to.degrees, ...tag }
      : {
          x: to.x,
          y: to.y,
          heading: "tangential",
          reverse: to.heading === "linear" ? false : (to.reverse ?? false),
          ...tag,
        };
  return {
    id: `bridge-${macro.id}`,
    startPoint: { ...from, ...tag },
    endPoint,
    controlPoints: [],
    color: "rgba(100, 100, 100, 0.5)",
    name: `Bridge to ${macro.name}`,
    ...tag,
  };
}

/** A copy of one of the macro's own lines, marked as part of the macro. */
function lockedMacroLine(line: Line, macro: SequenceMacroItem): Line {
  const tag = { isMacroElement: true, macroId: macro.id, locked: true };
  return {
    ...line,
    ...tag,
    id: `macro-${macro.id}-${line.id || makeId()}`,
    originalId: line.id,
    endPoint: { ...line.endPoint, ...tag },
    controlPoints: line.controlPoints.map((cp) => ({ ...cp, ...tag })),
  };
}

/**
 * Expands `macroItem` (whose file contents are `macroData`), starting from
 * the robot's current point and heading. Nested macros are expanded too;
 * `visitedPaths` holds the files already being expanded, to catch cycles.
 */
export function expandMacro(
  macroItem: SequenceMacroItem,
  prevPoint: Point,
  prevHeading: number,
  macroData: TurtleData,
  macrosMap: Map<string, TurtleData>,
  visitedPaths: Set<string>,
  depth: number = 0,
): {
  lines: Line[];
  sequence: SequenceItem[];
  endPoint: Point;
  endHeading: number;
} {
  if (depth > MAX_MACRO_DEPTH) {
    throw new Error(
      `Maximum macro depth exceeded: ${pathInMessage(macroItem.filePath)}`,
    );
  }
  const normalizedPath = normalizePath(macroItem.filePath);
  if (visitedPaths.has(normalizedPath)) {
    throw new Error(`Recursion detected: ${pathInMessage(macroItem.filePath)}`);
  }
  const visited = new Set(visitedPaths).add(normalizedPath);

  const { data, resolvedTransforms } = transformMacroData(
    macroData,
    macroItem.transformations,
  );

  const lines: Line[] = [];
  const sequence: SequenceItem[] = [];
  let point = prevPoint;
  let heading = prevHeading;

  if (getDistance(prevPoint, data.startPoint) > 0.1) {
    const bridge = bridgeLine(macroItem, prevPoint, data.startPoint);
    lines.push(bridge);
    sequence.push({ kind: "path", lineId: bridge.id! });
    point = bridge.endPoint;
    heading = getLineEndHeading(bridge, prevPoint);
  } else {
    point = data.startPoint;
  }

  const linesById = new Map<string, Line>();
  for (const line of data.lines.filter(Boolean)) {
    const copy = lockedMacroLine(line, macroItem);
    linesById.set(line.id || "", copy);
    lines.push(copy);
  }

  const steps: SequenceItem[] = data.sequence?.length
    ? data.sequence
    : data.lines.map((l) => ({ kind: "path", lineId: l.id! }));
  const scopedId = (id: string) => `macro-${macroItem.id}-${id}`;

  for (const item of steps) {
    if (item.kind === "path") {
      const line = linesById.get(item.lineId);
      if (!line) continue;
      // Turn in place first if the path needs to start facing elsewhere.
      const startHeading = unwrapAngle(
        getLineStartHeading(line, point),
        heading,
      );
      if (Math.abs(heading - startHeading) > 0.1) {
        sequence.push({
          kind: "rotate",
          id: `rotate-align-${line.id}`,
          name: "Align Rotation",
          degrees: startHeading,
          locked: true,
        });
        heading = startHeading;
      }
      sequence.push({ kind: "path", lineId: line.id! });
      heading = headingAfter(line, point, heading);
      point = line.endPoint;
    } else if (item.kind === "wait") {
      sequence.push({ ...item, id: scopedId(item.id), locked: true });
    } else if (item.kind === "rotate") {
      sequence.push({ ...item, id: scopedId(item.id), locked: true });
      heading = item.degrees;
    } else if (item.kind === "macro") {
      const nestedData = macrosMap.get(item.filePath);
      const nested: SequenceMacroItem = {
        ...item,
        id: scopedId(item.id),
        locked: true,
      };
      if (!nestedData) {
        sequence.push(nested);
        continue;
      }
      // The nested macro's own transforms apply first, then this macro's.
      nested.transformations = [
        ...(item.transformations || []),
        ...resolvedTransforms,
      ];
      const result = expandMacro(
        nested,
        point,
        heading,
        nestedData,
        macrosMap,
        visited,
        depth + 1,
      );
      lines.push(...result.lines);
      sequence.push({ ...nested, sequence: result.sequence });
      point = result.endPoint;
      heading = result.endHeading;
    }
  }

  return { lines, sequence, endPoint: point, endHeading: heading };
}

/**
 * Whether embedding `targetFilePath` in `startFilePath` would make a macro
 * include itself, directly or through other macros.
 */
export function wouldCreateCycle(
  targetFilePath: string,
  startFilePath: string,
  macrosMap: Map<string, TurtleData>,
): boolean {
  const start = normalizePath(startFilePath);
  const macros = new Map(
    [...macrosMap].map(([path, data]) => [normalizePath(path), data]),
  );
  const checked = new Set<string>();

  function reachesStart(path: string, branch: Set<string>): boolean {
    const p = normalizePath(path);
    if (p === start || branch.has(p)) return true;
    if (checked.has(p)) return false;

    const nextBranch = new Set(branch).add(p);
    for (const item of macros.get(p)?.sequence ?? []) {
      if (
        item.kind === "macro" &&
        item.filePath &&
        reachesStart(item.filePath, nextBranch)
      ) {
        return true;
      }
    }
    checked.add(p);
    return false;
  }

  return reachesStart(targetFilePath, new Set());
}

/**
 * Re-expands every macro in the project. The user's own lines are kept;
 * macro lines are rebuilt from the macro files in `macrosMap`.
 */
export function regenerateProjectMacros(
  startPoint: Point,
  lines: Line[],
  sequence: SequenceItem[],
  macrosMap: Map<string, TurtleData>,
  currentFilePath: string | null = null,
): { lines: Line[]; sequence: SequenceItem[] } {
  const userLines = lines.filter((l) => !l.isMacroElement);
  const linesById = new Map(userLines.map((l) => [l.id!, l]));
  const newLines: Line[] = [...userLines];
  const newSequence: SequenceItem[] = [];

  let point = startPoint;
  let heading = startingHeading(startPoint, userLines, sequence);

  for (const item of sequence) {
    if (item.kind === "path") {
      newSequence.push(item);
      const line = linesById.get(item.lineId);
      if (!line) continue;
      heading = unwrapAngle(getLineStartHeading(line, point), heading);
      heading = headingAfter(line, point, heading);
      point = line.endPoint;
    } else if (item.kind === "wait") {
      newSequence.push(item);
    } else if (item.kind === "rotate") {
      newSequence.push(item);
      heading = item.degrees;
    } else if (item.kind === "macro") {
      const macroData = macrosMap.get(item.filePath);
      if (macroData) {
        // The open file can't include itself.
        const visited = new Set<string>();
        if (currentFilePath) visited.add(normalizePath(currentFilePath));
        const result = expandMacro(
          item,
          point,
          heading,
          macroData,
          macrosMap,
          visited,
        );
        newLines.push(...result.lines);
        newSequence.push({ ...item, sequence: result.sequence });
        point = result.endPoint;
        heading = result.endHeading;
        continue;
      }

      // The macro file isn't loaded (yet). Keep the lines it produced last
      // time so the path doesn't jump around.
      const kept = lines.filter(
        (l) =>
          l.macroId === item.id ||
          l.id?.startsWith(`macro-${item.id}-`) ||
          l.id === `bridge-${item.id}`,
      );
      if (kept.length === 0) {
        newSequence.push(item);
        continue;
      }
      newLines.push(...kept);
      newSequence.push(
        item.sequence?.length
          ? item
          : {
              ...item,
              sequence: kept.map((l) => ({ kind: "path", lineId: l.id! })),
            },
      );

      const last = kept.at(-1)!;
      heading = headingAfter(last, kept.at(-2)?.endPoint ?? point, heading);
      point = last.endPoint;
    }
  }

  return { lines: newLines, sequence: newSequence };
}
