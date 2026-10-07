// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { ActionDefinition, InsertionContext } from "../actionRegistry";
import { makeId, renumberDefaultPathNames } from "../../utils/nameGenerator";
import { getRandomColor } from "../../utils/draw";
import type { Line, Point } from "../../types";
import { settingsStore } from "../projectStore";
import { get } from "svelte/store";

// Tailwind Safelist for dynamic classes:
// bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 focus:ring-green-300 dark:focus:ring-green-700
// bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 border-green-200 dark:border-green-800/30

/**
 * The end point for a new path at (x, y), turning the way the path before
 * it does. Facing a point doesn't carry over; the new path faces forward.
 */
export function endPointAfter(
  previous: Point | undefined,
  x: number,
  y: number,
): Point {
  if (previous?.heading === "linear") {
    const deg = previous.endDeg ?? 0;
    return { x, y, heading: "linear", startDeg: deg, endDeg: deg };
  }
  if (previous?.heading === "constant") {
    return { x, y, heading: "constant", degrees: previous.degrees ?? 0 };
  }
  return { x, y, heading: "tangential", reverse: previous?.reverse ?? false };
}

/** A new, empty path to `endPoint`. */
export function createLine(endPoint: Point): Line {
  return {
    id: makeId(),
    name: "",
    endPoint,
    controlPoints: [],
    color: getRandomColor(),
    eventMarkers: [],
    waitBeforeMs: 0,
    waitAfterMs: 0,
    waitBeforeName: "",
    waitAfterName: "",
  };
}

/**
 * Inserts a new path at `ctx.index`, starting where the last path before it
 * ends and turning the same way. `place` picks its end from that start.
 */
export function insertPath(
  ctx: InsertionContext,
  place: (from: Point) => { x: number; y: number },
) {
  const previous = ctx.sequence
    .slice(0, ctx.index)
    .findLast((s) => s.kind === "path");
  const afterIndex =
    previous?.kind === "path"
      ? ctx.lines.findIndex((l) => l.id === previous.lineId)
      : -1;
  const from = ctx.lines[afterIndex]?.endPoint ?? ctx.startPoint;
  const { x, y } = place(from);
  const line = createLine(endPointAfter(from, x, y));

  // Edited in place: the caller's arrays are the ones it re-renders.
  const renumbered = renumberDefaultPathNames(
    ctx.lines.toSpliced(afterIndex + 1, 0, line),
  );
  ctx.lines.splice(0, ctx.lines.length, ...renumbered);
  ctx.sequence.splice(ctx.index, 0, { kind: "path", lineId: line.id! });
  ctx.triggerReactivity();
}

// This is a partial definition for the Path action.
// The UI rendering and logic for Path is still handled natively in WaypointTable and FieldRenderer
// for deep integration reasons, but registering it here allows us to use generic flags
// like isPath in other parts of the application.

export const PathAction: ActionDefinition = {
  kind: "path",
  label: "Path",
  buttonColor: "green",
  isPath: true,
  color: "#16a34a", // Green-600
  showInToolbar: true,
  button: {
    label: "Add Path",
  },

  component: null,

  // Menu inserts put the new end a short step on from the previous one.
  onInsert: (ctx: InsertionContext) => {
    const settings = get(settingsStore);
    const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
    insertPath(ctx, (from) => ({
      x: clamp(from.x + 10, settings?.fieldWidth ?? 144),
      y: clamp(from.y + 10, settings?.fieldHeight ?? 144),
    }));
  },
};
