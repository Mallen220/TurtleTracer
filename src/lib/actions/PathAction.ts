// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { ActionDefinition, InsertionContext } from "../actionRegistry";
import { makeId, renumberDefaultPathNames } from "../../utils/nameGenerator";
import { getRandomColor } from "../../utils/draw";
import type { Line } from "../../types";

// Tailwind Safelist for dynamic classes:
// bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 focus:ring-green-300 dark:focus:ring-green-700
// bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 border-green-200 dark:border-green-800/30

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
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-3"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>`,
  },

  component: null,

  onInsert: (ctx: InsertionContext) => {
    // Logic similar to insertPath in WaypointTable
    let insertAfterLineId: string | null = null;
    let refPoint = ctx.startPoint;

    // Find the last path element before insertion point
    for (let i = ctx.index - 1; i >= 0; i--) {
      if (ctx.sequence[i].kind === "path") {
        insertAfterLineId = (ctx.sequence[i] as any).lineId;
        const l = ctx.lines.find((x) => x.id === insertAfterLineId);
        if (l) {
          refPoint = l.endPoint;
        }
        break;
      }
    }

    // Inherit heading type from refPoint
    let endPoint: import("../../types").Point;
    if (refPoint.heading === "linear") {
      const linRef = refPoint as Extract<
        import("../../types").Point,
        { heading: "linear" }
      >;
      const deg = linRef.endDeg ?? linRef.startDeg ?? 0;
      endPoint = {
        x: Math.max(0, Math.min(144, refPoint.x + 10)),
        y: Math.max(0, Math.min(144, refPoint.y + 10)),
        heading: "linear",
        startDeg: deg,
        endDeg: deg,
      };
    } else if (refPoint.heading === "constant") {
      const constRef = refPoint as Extract<
        import("../../types").Point,
        { heading: "constant" }
      >;
      endPoint = {
        x: Math.max(0, Math.min(144, refPoint.x + 10)),
        y: Math.max(0, Math.min(144, refPoint.y + 10)),
        heading: "constant",
        degrees: constRef.degrees ?? 0,
      };
    } else {
      endPoint = {
        x: Math.max(0, Math.min(144, refPoint.x + 10)),
        y: Math.max(0, Math.min(144, refPoint.y + 10)),
        heading: "tangential",
        reverse: (refPoint as any).reverse ?? false,
      };
    }

    // Create new line
    const newLine: Line = {
      id: makeId(),
      name: "",
      endPoint,
      controlPoints: [],
      color: getRandomColor(),
      waitBeforeMs: 0,
      waitAfterMs: 0,
      waitBeforeName: "",
      waitAfterName: "",
      eventMarkers: [],
    };

    let lineInsertIdx = 0;
    if (insertAfterLineId) {
      const idx = ctx.lines.findIndex((l) => l.id === insertAfterLineId);
      if (idx !== -1) lineInsertIdx = idx + 1;
    }

    ctx.lines.splice(lineInsertIdx, 0, newLine);

    const renumbered = renumberDefaultPathNames(ctx.lines);
    // Copy back to ctx.lines
    ctx.lines.length = 0;
    renumbered.forEach((l) => ctx.lines.push(l));

    ctx.sequence.splice(ctx.index, 0, { kind: "path", lineId: newLine.id! });

    ctx.triggerReactivity();
  },
};
