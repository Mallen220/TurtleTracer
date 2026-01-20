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

  const generatedLines: Line[] = [];
  const generatedSequence: SequenceItem[] = [];

  // 1. Bridge Generation
  const dist = getDistance(prevPoint, macroData.startPoint);
  let currentHeading = prevHeading;
  let currentPoint = prevPoint;

  if (dist > 0.1) {
    // Determine bridge heading based on macro start point preferences
    let bridgeEndPoint: Point;
    const target = macroData.startPoint;

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
      // Bridge ends where macro starts.
      bridgeEndPoint = {
        x: target.x,
        y: target.y,
        heading: "linear",
        startDeg: 0, // Ignored by calculator (uses current)
        endDeg: target.startDeg,
        isMacroElement: true,
        macroId: macroItem.id,
      };
    } else {
      // Tangential
      bridgeEndPoint = {
        x: target.x,
        y: target.y,
        heading: "tangential",
        reverse: target.reverse,
        isMacroElement: true,
        macroId: macroItem.id,
      };
    }

    const bridgeLine: Line = {
      id: `bridge-${macroItem.id}`,
      startPoint: { ...prevPoint, isMacroElement: true, macroId: macroItem.id },
      endPoint: bridgeEndPoint,
      controlPoints: [],
      color: "rgba(100, 100, 100, 0.5)", // Ghostly gray
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
    currentPoint = macroData.startPoint;
  }

  // 2. Process Macro Lines/Sequence
  const macroLines = macroData.lines.map((l) => ({ ...l }));

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
      locked: true
    };
    line.controlPoints = line.controlPoints.map(cp => ({
      ...cp,
      isMacroElement: true,
      macroId: macroItem.id,
      locked: true
    }));

    generatedLines.push(line);
  });

  const sourceSeq = macroData.sequence && macroData.sequence.length > 0
    ? macroData.sequence
    : macroData.lines.map(l => ({ kind: "path", lineId: l.id! } as SequenceItem));

  sourceSeq.forEach(item => {
    if (item.kind === "path") {
        const newId = lineIdMap.get(item.lineId);
        if (newId) {
            // Check rotation requirement
            const line = generatedLines.find(l => l.id === newId);
            if (line) {
                const requiredStartHeadingRaw = getLineStartHeading(line, currentPoint);
                const requiredStartHeading = unwrapAngle(requiredStartHeadingRaw, currentHeading);

                if (Math.abs(currentHeading - requiredStartHeading) > 0.1) {
                    generatedSequence.push({
                        kind: "rotate",
                        id: `rotate-align-${newId}`,
                        name: "Align Rotation",
                        degrees: requiredStartHeading,
                        locked: true
                    });
                    currentHeading = requiredStartHeading;
                }

                generatedSequence.push({
                    kind: "path",
                    lineId: newId
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
        generatedSequence.push({ ...item, id: `macro-${macroItem.id}-${item.id}`, locked: true });
    } else if (item.kind === "rotate") {
        generatedSequence.push({ ...item, id: `macro-${macroItem.id}-${item.id}`, locked: true });
        currentHeading = item.degrees;
    } else if (item.kind === "macro") {
        const nestedData = macrosMap.get(item.filePath);
        if (nestedData) {
            const nestedId = `macro-${macroItem.id}-${item.id}`;
            const nestedItem: SequenceMacroItem = {
              ...item,
              id: nestedId,
              locked: true
            };

            const result = expandMacro(nestedItem, currentPoint, currentHeading, nestedData, macrosMap, nextVisited);

            generatedLines.push(...result.lines);

            const expandedNestedItem: SequenceMacroItem = {
                ...nestedItem,
                sequence: result.sequence
            };
            generatedSequence.push(expandedNestedItem);

            currentPoint = result.endPoint;
            currentHeading = result.endHeading;
        } else {
            // Missing data for nested macro, push placeholder or skip
            // We can push it, but it won't have sequence expanded.
            // When data loads, refreshMacros will re-run.
            generatedSequence.push({ ...item, id: `macro-${macroItem.id}-${item.id}`, locked: true });
        }
    }
  });

  return {
    lines: generatedLines,
    sequence: generatedSequence,
    endPoint: currentPoint,
    endHeading: currentHeading
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
  macrosMap: Map<string, PedroData>
): { lines: Line[]; sequence: SequenceItem[] } {
  const newLines: Line[] = [];
  // Separate user lines from macro lines to keep user edits
  const userLines = lines.filter(l => !l.isMacroElement);
  newLines.push(...userLines);

  // Index user lines for fast lookup
  const lineMap = new Map(userLines.map(l => [l.id!, l]));

  const newSequence: SequenceItem[] = []; // Top level sequence

  // Tracking state
  let currentPoint: Point = startPoint;
  let currentHeading = 0;

  // Initialize start heading
  if (startPoint.heading === "linear") currentHeading = startPoint.startDeg;
  else if (startPoint.heading === "constant") currentHeading = startPoint.degrees;
  // Tangential start depends on first line... handled inside loop logic or special case?
  // If first item is macro, we need to know heading.
  // If first item is path, we process it.

  // Special handling for initial tangential heading
  if (startPoint.heading === "tangential") {
      // Look ahead at first path line
      const firstPathItem = sequence.find(s => s.kind === "path");
      if (firstPathItem) {
          const l = lineMap.get((firstPathItem as any).lineId);
          if (l) {
            const nextP = l.controlPoints.length > 0 ? l.controlPoints[0] : l.endPoint;
            const angle = Math.atan2(nextP.y - startPoint.y, nextP.x - startPoint.x) * (180 / Math.PI);
            currentHeading = startPoint.reverse ? angle + 180 : angle;
          }
      }
  }

  sequence.forEach(item => {
      if (item.kind === "path") {
          newSequence.push(item);
          const line = lineMap.get(item.lineId);
          if (line) {
              const requiredStartHeadingRaw = getLineStartHeading(line, currentPoint);
              const requiredStartHeading = unwrapAngle(requiredStartHeadingRaw, currentHeading);
              currentHeading = requiredStartHeading; // Snap?

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
          // Wait doesn't change heading or point
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
                new Set() // Initial visited paths
              );

              // Add generated lines to master list
              newLines.push(...result.lines);

              // Update macro item with new sequence
              const newMacroItem: SequenceMacroItem = {
                  ...item,
                  sequence: result.sequence
              };
              newSequence.push(newMacroItem);

              // Update state
              currentPoint = result.endPoint;
              currentHeading = result.endHeading;
          } else {
              // Macro data missing, just push item as is
              newSequence.push(item);
          }
      }
  });

  return { lines: newLines, sequence: newSequence };
}
