// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import type {
  Line,
  Point,
  SequenceItem,
  SequenceMacroItem,
  SequencePathItem,
  SequenceWaitItem,
  SequenceRotateItem,
  PedroData,
  Transformation,
} from "../types";
import {
  getDistance,
  getLineStartHeading,
  getLineEndHeading,
  getAngularDifference,
} from "../utils/math";

// Helper to make unique IDs
function makeId() {
  return Math.random().toString(36).substring(2, 9);
}

function unwrapAngle(target: number, reference: number): number {
  const diff = getAngularDifference(reference, target);
  return reference + diff;
}

// --- Transformation Helpers ---

function resolvePivot(
  pivot: Transformation["pivot"],
  center: { x: number; y: number },
): { x: number; y: number } {
  if (!pivot || pivot === "origin") return { x: 72, y: 72 };
  if (pivot === "center") return center;
  return pivot; // it's {x,y}
}

function applyPointTransformInternal(
  p: { x: number; y: number },
  t: Transformation,
  pivot: { x: number; y: number },
): { x: number; y: number } {
  let x = p.x;
  let y = p.y;

  if (t.type === "translate") {
    x += t.dx || 0;
    y += t.dy || 0;
  } else if (t.type === "rotate" && t.degrees) {
    const rad = (t.degrees * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = x - pivot.x;
    const dy = y - pivot.y;
    x = pivot.x + (dx * cos - dy * sin);
    y = pivot.y + (dx * sin + dy * cos);
  } else if (t.type === "flip") {
    if (t.axis === "horizontal") {
      // Mirror across vertical axis at pivot.x
      x = 2 * pivot.x - x;
    } else if (t.axis === "vertical") {
      // Mirror across horizontal axis at pivot.y
      y = 2 * pivot.y - y;
    }
  }

  return { x, y };
}

function transformHeading(degrees: number, t: Transformation): number {
  let d = degrees;
  if (t.type === "rotate" && t.degrees) {
    d += t.degrees;
  } else if (t.type === "flip") {
    if (t.axis === "horizontal") {
      // Mirror across vertical axis: 0 -> 180, 90 -> 90.
      // Formula: 180 - angle
      d = 180 - d;
    } else if (t.axis === "vertical") {
      // Mirror across horizontal axis: 0 -> 0, 90 -> -90
      // Formula: -angle
      d = -d;
    }
  }
  // Normalize to -180 to 180 or 0-360? Usually just keep it wrapped or raw.
  // Let's normalize to 0-360 for cleanliness, but standardizing later is fine.
  return d;
}

function calculateMacroCenter(data: PedroData): { x: number; y: number } {
  let minX = data.startPoint.x;
  let minY = data.startPoint.y;
  let maxX = data.startPoint.x;
  let maxY = data.startPoint.y;

  data.lines.forEach((l) => {
    [l.endPoint, ...l.controlPoints].forEach((p) => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    });
  });

  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

function transformMacroData(
  data: PedroData,
  transforms: Transformation[],
): { data: PedroData; resolvedTransforms: Transformation[] } {
  if (!transforms || transforms.length === 0) {
    return { data, resolvedTransforms: [] };
  }

  // Clone data deeply
  const newData: PedroData = JSON.parse(JSON.stringify(data));
  const resolvedTransforms: Transformation[] = [];

  transforms.forEach((t) => {
    // Determine pivot for this step
    const center = calculateMacroCenter(newData);
    const pivot = resolvePivot(t.pivot, center);

    // Helper to transform a generic point-like object in place
    const transformPt = (pt: { x: number; y: number }) => {
      const res = applyPointTransformInternal(pt, t, pivot);
      pt.x = res.x;
      pt.y = res.y;
    };

    // Apply to startPoint
    transformPt(newData.startPoint);
    if (newData.startPoint.heading === "constant") {
      newData.startPoint.degrees = transformHeading(
        newData.startPoint.degrees,
        t,
      );
    } else if (newData.startPoint.heading === "linear") {
      newData.startPoint.startDeg = transformHeading(
        newData.startPoint.startDeg,
        t,
      );
      newData.startPoint.endDeg = transformHeading(
        newData.startPoint.endDeg,
        t,
      );
    }
    // Tangential reverse logic?
    if (
      newData.startPoint.heading === "tangential" &&
      t.type === "flip" &&
      newData.startPoint.reverse !== undefined
    ) {
      // Flipping geometry preserves tangential relationship direction relative to path,
      // but the "absolute" angle flips. The 'reverse' flag just means "backward along path".
      // That shouldn't change.
    }

    // Apply to lines
    newData.lines.forEach((line) => {
      transformPt(line.endPoint);
      if (line.endPoint.heading === "constant") {
        line.endPoint.degrees = transformHeading(line.endPoint.degrees, t);
      } else if (line.endPoint.heading === "linear") {
        line.endPoint.startDeg = transformHeading(line.endPoint.startDeg, t);
        line.endPoint.endDeg = transformHeading(line.endPoint.endDeg, t);
      }

      line.controlPoints.forEach((cp) => transformPt(cp));
    });

    // Handle sequence items (Wait, Rotate, nested Macro?)
    if (newData.sequence) {
      newData.sequence.forEach((seqItem) => {
        if (seqItem.kind === "rotate") {
          seqItem.degrees = transformHeading(seqItem.degrees, t);
        }
        // Wait items don't have spatial properties
        // Macro items: we don't transform them here, we pass the transformation down via resolvedTransforms
        // because we haven't loaded their data yet (or we have, but we recurse later).
        // However, if we flip the coordinate system, the nested macro will be flipped by applying resolvedTransforms later.
      });
    }

    // Save resolved transform for children
    resolvedTransforms.push({
      ...t,
      pivot: pivot, // Explicit coordinates
    });
  });

  return { data: newData, resolvedTransforms };
}

// --- Main Expansion Logic ---

/**
 * Expands a macro into a list of lines and a sequence of items.
 * Handles bridge generation and rotation alignment.
 */
export function expandMacro(
  macroItem: SequenceMacroItem,
  prevPoint: Point,
  prevHeading: number,
  macroData: PedroData,
  macrosMap: Map<string, PedroData>,
  visitedPaths: Set<string>,
): {
  lines: Line[];
  sequence: SequenceItem[];
  endPoint: Point;
  endHeading: number;
} {
  // Check for recursion loop
  if (visitedPaths.has(macroItem.filePath)) {
    throw new Error(`Recursion detected: ${macroItem.filePath}`);
  }

  // Clone visitedPaths for this branch
  const nextVisited = new Set(visitedPaths);
  nextVisited.add(macroItem.filePath);

  // --- Apply Transformations to Macro Data ---
  const { data: transformedData, resolvedTransforms } = transformMacroData(
    macroData,
    macroItem.transformations || [],
  );

  const generatedLines: Line[] = [];
  const generatedSequence: SequenceItem[] = [];

  // 1. Bridge Generation (uses transformed start point)
  const dist = getDistance(prevPoint, transformedData.startPoint);
  let currentHeading = prevHeading;
  let currentPoint = prevPoint;

  if (dist > 0.1) {
    // Determine bridge heading based on macro start point preferences
    let bridgeEndPoint: Point;
    const target = transformedData.startPoint;

    if (target.heading === "constant") {
      bridgeEndPoint = {
        x: target.x,
        y: target.y,
        heading: "constant",
        degrees: target.degrees,
        isMacroElement: true,
        macroId: macroItem.id,
      };
    } else if (target.heading === "linear") {
      // Use tangential bridges for macros even when the macro start is linear.
      // Tangential bridges provide a smoother connection from caller paths
      // and avoid introducing artificial linear headings.
      bridgeEndPoint = {
        x: target.x,
        y: target.y,
        heading: "tangential",
        reverse: false,
        isMacroElement: true,
        macroId: macroItem.id,
      };
    } else {
      // Tangential (already tangential)
      bridgeEndPoint = {
        x: target.x,
        y: target.y,
        heading: "tangential",
        reverse: target.reverse ?? false,
        isMacroElement: true,
        macroId: macroItem.id,
      };
    }

    const bridgeLine: Line = {
      id: `bridge-${macroItem.id}`,
      startPoint: { ...prevPoint, isMacroElement: true, macroId: macroItem.id },
      endPoint: bridgeEndPoint,
      controlPoints: [],
      color: "rgba(100, 100, 100, 0.5)", // gray
      name: `Bridge to ${macroItem.name}`,
      isMacroElement: true,
      macroId: macroItem.id,
    };

    generatedLines.push(bridgeLine);
    generatedSequence.push({
      kind: "path",
      lineId: bridgeLine.id!,
    });

    currentPoint = bridgeLine.endPoint;
    // Estimate new heading after bridge
    currentHeading = getLineEndHeading(bridgeLine, prevPoint);
  } else {
    currentPoint = transformedData.startPoint;
  }

  // 2. Process Macro Lines/Sequence
  const macroLines = transformedData.lines.map((l) => ({ ...l }));

  // Create a mapping from old ID to new ID to preserve sequence references
  const lineIdMap = new Map<string, string>();

  macroLines.forEach((line) => {
    const originalId = line.id;
    const newId = `macro-${macroItem.id}-${originalId || makeId()}`;
    lineIdMap.set(originalId || "", newId);

    line.id = newId;
    line.isMacroElement = true;
    line.macroId = macroItem.id;
    line.originalId = originalId;
    line.locked = true; // Enforce read-only

    // Also mark points
    line.endPoint = {
      ...line.endPoint,
      isMacroElement: true,
      macroId: macroItem.id,
      locked: true,
    };
    line.controlPoints = line.controlPoints.map((cp) => ({
      ...cp,
      isMacroElement: true,
      macroId: macroItem.id,
      locked: true,
    }));

    generatedLines.push(line);
  });

  const sourceSeq =
    transformedData.sequence && transformedData.sequence.length > 0
      ? transformedData.sequence
      : transformedData.lines.map(
          (l) => ({ kind: "path", lineId: l.id! }) as SequenceItem,
        );

  sourceSeq.forEach((item) => {
    if (item.kind === "path") {
      const newId = lineIdMap.get(item.lineId);
      if (newId) {
        // Check rotation requirement
        const line = generatedLines.find((l) => l.id === newId);
        if (line) {
          const requiredStartHeadingRaw = getLineStartHeading(
            line,
            currentPoint,
          );
          const requiredStartHeading = unwrapAngle(
            requiredStartHeadingRaw,
            currentHeading,
          );

          if (Math.abs(currentHeading - requiredStartHeading) > 0.1) {
            generatedSequence.push({
              kind: "rotate",
              id: `rotate-align-${newId}`,
              name: "Align Rotation",
              degrees: requiredStartHeading,
              locked: true,
            });
            currentHeading = requiredStartHeading;
          }

          generatedSequence.push({
            kind: "path",
            lineId: newId,
          });

          // Update state
          const endHeadingRaw = getLineEndHeading(line, currentPoint);
          if (line.endPoint.heading === "tangential") {
            const tangent = endHeadingRaw;
            currentHeading = unwrapAngle(tangent, currentHeading);
          } else if (line.endPoint.heading === "constant") {
            currentHeading = line.endPoint.degrees;
          } else if (line.endPoint.heading === "linear") {
            currentHeading = line.endPoint.endDeg;
          }

          currentPoint = line.endPoint;
        }
      }
    } else if (item.kind === "wait") {
      generatedSequence.push({
        ...item,
        id: `macro-${macroItem.id}-${item.id}`,
        locked: true,
      });
    } else if (item.kind === "rotate") {
      generatedSequence.push({
        ...item,
        id: `macro-${macroItem.id}-${item.id}`,
        locked: true,
      });
      currentHeading = item.degrees;
    } else if (item.kind === "macro") {
      const nestedData = macrosMap.get(item.filePath);
      if (nestedData) {
        const nestedId = `macro-${macroItem.id}-${item.id}`;

        // Propagate transformations to nested macro
        const childTransforms = [
          ...(item.transformations || []),
          ...resolvedTransforms, // Apply parent transforms (resolved) on top
        ];

        const nestedItem: SequenceMacroItem = {
          ...item,
          id: nestedId,
          locked: true,
          transformations: childTransforms,
        };

        const result = expandMacro(
          nestedItem,
          currentPoint,
          currentHeading,
          nestedData,
          macrosMap,
          nextVisited,
        );

        generatedLines.push(...result.lines);

        const expandedNestedItem: SequenceMacroItem = {
          ...nestedItem,
          sequence: result.sequence,
        };
        generatedSequence.push(expandedNestedItem);

        currentPoint = result.endPoint;
        currentHeading = result.endHeading;
      } else {
        // Missing data for nested macro, push placeholder or skip
        generatedSequence.push({
          ...item,
          id: `macro-${macroItem.id}-${item.id}`,
          locked: true,
        });
      }
    }
  });

  return {
    lines: generatedLines,
    sequence: generatedSequence,
    endPoint: currentPoint,
    endHeading: currentHeading,
  };
}

/**
 * Regenerates all macros in the project based on current user lines.
 * Updates the lines list (including macro lines) and the sequence items.
 */
export function regenerateProjectMacros(
  startPoint: Point,
  lines: Line[],
  sequence: SequenceItem[],
  macrosMap: Map<string, PedroData>,
): { lines: Line[]; sequence: SequenceItem[] } {
  const newLines: Line[] = [];
  // Separate user lines from macro lines to keep user edits
  const userLines = lines.filter((l) => !l.isMacroElement);
  newLines.push(...userLines);

  // Index user lines for fast lookup
  const lineMap = new Map(userLines.map((l) => [l.id!, l]));

  const newSequence: SequenceItem[] = []; // Top level sequence

  // Tracking state
  let currentPoint: Point = startPoint;
  let currentHeading = 0;

  // Initialize start heading
  if (startPoint.heading === "linear") currentHeading = startPoint.startDeg;
  else if (startPoint.heading === "constant")
    currentHeading = startPoint.degrees;

  // Special handling for initial tangential heading
  if (startPoint.heading === "tangential") {
    // Look ahead at first path line
    const firstPathItem = sequence.find((s) => s.kind === "path");
    if (firstPathItem) {
      const l = lineMap.get((firstPathItem as any).lineId);
      if (l) {
        const nextP =
          l.controlPoints.length > 0 ? l.controlPoints[0] : l.endPoint;
        const angle =
          Math.atan2(nextP.y - startPoint.y, nextP.x - startPoint.x) *
          (180 / Math.PI);
        currentHeading = startPoint.reverse ? angle + 180 : angle;
      }
    }
  }

  sequence.forEach((item) => {
    if (item.kind === "path") {
      newSequence.push(item);
      const line = lineMap.get(item.lineId);
      if (line) {
        const requiredStartHeadingRaw = getLineStartHeading(line, currentPoint);
        const requiredStartHeading = unwrapAngle(
          requiredStartHeadingRaw,
          currentHeading,
        );
        currentHeading = requiredStartHeading;

        const endHeadingRaw = getLineEndHeading(line, currentPoint);
        if (line.endPoint.heading === "tangential") {
          const tangent = endHeadingRaw;
          currentHeading = unwrapAngle(tangent, currentHeading);
        } else if (line.endPoint.heading === "constant") {
          currentHeading = line.endPoint.degrees;
        } else if (line.endPoint.heading === "linear") {
          currentHeading = line.endPoint.endDeg;
        }
        currentPoint = line.endPoint;
      }
    } else if (item.kind === "wait") {
      newSequence.push(item);
    } else if (item.kind === "rotate") {
      newSequence.push(item);
      currentHeading = item.degrees;
    } else if (item.kind === "macro") {
      const macroData = macrosMap.get(item.filePath);
      if (macroData) {
        // Expand with recursion support
        const result = expandMacro(
          item,
          currentPoint,
          currentHeading,
          macroData,
          macrosMap,
          new Set(), // Initial visited paths
        );

        // Add generated lines to master list
        newLines.push(...result.lines);

        // Update macro item with new sequence
        const newMacroItem: SequenceMacroItem = {
          ...item,
          sequence: result.sequence,
        };
        newSequence.push(newMacroItem);

        // Update state
        currentPoint = result.endPoint;
        currentHeading = result.endHeading;
      } else {
        // Macro data missing, just push item as is
        newSequence.push(item);

        // Attempt to preserve existing lines for this macro if they exist in the input
        const prefix = `macro-${item.id}-`;
        const bridgePrefix = `bridge-${item.id}`;
        const preservedLines = lines.filter(
          (l) =>
            l.macroId === item.id ||
            (l.id && (l.id.startsWith(prefix) || l.id === bridgePrefix)),
        );

        if (preservedLines.length > 0) {
          newLines.push(...preservedLines);

          // Reconstruct sequence if missing
          if (!item.sequence || item.sequence.length === 0) {
            const reconstructedSeq: SequenceItem[] = preservedLines.map(
              (l) => ({
                kind: "path",
                lineId: l.id!,
              }),
            );
            const newItem: SequenceMacroItem = {
              ...item,
              sequence: reconstructedSeq,
            };
            newSequence[newSequence.length - 1] = newItem;
          }

          // Update current point to end of last line
          const lastLine = preservedLines[preservedLines.length - 1];
          currentPoint = lastLine.endPoint;
          currentHeading = getLineEndHeading(
            lastLine,
            preservedLines.length > 1
              ? preservedLines[preservedLines.length - 2].endPoint
              : currentPoint,
          );
          if (lastLine.endPoint.heading === "constant")
            currentHeading = lastLine.endPoint.degrees;
          else if (lastLine.endPoint.heading === "linear")
            currentHeading = lastLine.endPoint.endDeg;
        }
      }
    }
  });

  return { lines: newLines, sequence: newSequence };
}
