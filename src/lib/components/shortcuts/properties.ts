// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { get } from "svelte/store";
import { linesStore, sequenceStore, startPointStore } from "../../projectStore";
import { selectedLineId, selectedPointId, notification } from "../../../stores";
import { toggleChain } from "../../sequenceOperations";
import {
  updateLinkedWaits,
  updateLinkedRotations,
} from "../../../utils/pointLinking";
import type {
  EventMarker,
  Line,
  PiecewiseSegment,
  Point,
  SequenceItem,
} from "../../../types/index";
import { confirmFollowedJavaEdit } from "../../javaFollow";
import { isUIElementFocused } from "./utils";
import {
  parseSelectionId,
  eventStepKind,
  findSequenceItem,
  findSequenceItemIndex,
  updateEventMarkerPosition,
} from "./itemUtils";

/** Changes a wait's duration or a turn's angle by one step. */
function modifyStep(
  info: { type: "wait" | "rotate"; id: string },
  delta: number,
  recordChange: (action?: string) => void,
) {
  const sequence = [...get(sequenceStore)];
  const itemIdx = findSequenceItemIndex(sequence, info.id, info.type);
  const item = sequence[itemIdx];
  if (!item || (item.kind !== "wait" && item.kind !== "rotate")) return;
  if (item.locked) return;

  const changed: SequenceItem =
    item.kind === "wait"
      ? { ...item, durationMs: Math.max(0, item.durationMs + delta * 100) }
      : { ...item, degrees: Number((item.degrees + delta * 5).toFixed(2)) };
  sequence[itemIdx] = changed;
  const relinked =
    changed.kind === "wait"
      ? updateLinkedWaits(sequence, changed.id)
      : updateLinkedRotations(sequence, changed.id);
  sequenceStore.set([...relinked]);
  recordChange(changed.kind === "wait" ? "Modify Duration" : "Modify Rotation");
}

/** Moves an event marker along its step by a hundredth per step. */
function modifyStepMarker(
  info: { type: "event-wait" | "event-rotate"; id: string; evIdx: number },
  delta: number,
  recordChange: (action?: string) => void,
) {
  const sequence = [...get(sequenceStore)];
  const kind = eventStepKind(info);
  const itemIdx = findSequenceItemIndex(sequence, info.id, kind);
  const item = findSequenceItem(sequence, info.id, kind);
  if (!item?.eventMarkers?.[info.evIdx] || item.locked) return;

  sequence[itemIdx] = {
    ...item,
    eventMarkers: movedMarker(item.eventMarkers, info.evIdx, delta),
  };
  sequenceStore.set([...sequence]);
  recordChange("Move Event Marker");
}

/** A copy of the markers with one moved along its path or step by a hundredth per step. */
function movedMarker(markers: EventMarker[], evIdx: number, delta: number) {
  const moved = [...markers];
  moved[evIdx] = {
    ...moved[evIdx],
    position: updateEventMarkerPosition(moved[evIdx], 0.01 * delta),
  };
  return moved;
}

/** Moves an event marker (the given one, or else the last) of the path at `lineIdx`. */
function modifyPathMarker(
  lineIdx: number,
  evIdx: number | "last",
  delta: number,
  recordChange: (action?: string) => void,
) {
  const lines = [...get(linesStore)];
  const line = lines[lineIdx];
  if (!line?.eventMarkers || line.locked) return;

  const index = evIdx === "last" ? line.eventMarkers.length - 1 : evIdx;
  if (!line.eventMarkers[index]) return;

  lines[lineIdx] = {
    ...line,
    eventMarkers: movedMarker(line.eventMarkers, index, delta),
  };
  linesStore.set([...lines]);
  recordChange("Move Event Marker");
}

export function modifyValue(
  delta: number,
  recordChange: (action?: string) => void,
) {
  if (isUIElementFocused()) return;
  const current = get(selectedPointId);
  if (!current) return;

  const info = parseSelectionId(current);
  if (info.type === "wait" || info.type === "rotate") {
    return modifyStep(info, delta, recordChange);
  }
  if (info.type === "event-wait" || info.type === "event-rotate") {
    return modifyStepMarker(info, delta, recordChange);
  }
  if (info.type === "event-line") {
    return modifyPathMarker(info.lineIdx, info.evIdx, delta, recordChange);
  }

  // Otherwise, the last marker of the selected path.
  const selectedLine = get(selectedLineId);
  const lineIdx = selectedLine
    ? get(linesStore).findIndex((l) => l.id === selectedLine)
    : -1;
  if (lineIdx !== -1) modifyPathMarker(lineIdx, "last", delta, recordChange);
}

/** What each heading mode keeps. Everything else is cleared when switching to it. */
const HEADING_MODE_FIELDS = {
  tangential: {
    reverse: false,
    degrees: undefined,
    startDeg: undefined,
    endDeg: undefined,
  },
  constant: {
    degrees: 0,
    reverse: undefined,
    startDeg: undefined,
    endDeg: undefined,
  },
  linear: {
    startDeg: 90,
    endDeg: 180,
    reverse: undefined,
    degrees: undefined,
  },
} as const;

const HEADING_MODES = Object.keys(HEADING_MODE_FIELDS) as Array<
  keyof typeof HEADING_MODE_FIELDS
>;

/** The point switched to the heading mode after its current one. */
function withNextHeadingMode(point: Point): Point {
  const current = HEADING_MODES.indexOf(point.heading as never);
  const next = HEADING_MODES[(current + 1) % HEADING_MODES.length];
  return {
    ...point,
    heading: next,
    ...HEADING_MODE_FIELDS[next],
  } as unknown as Point;
}

/** The point selected on the field, if one is. */
function selectedPoint() {
  const info = parseSelectionId(get(selectedPointId) ?? "");
  return info.type === "point" ? info : null;
}

/**
 * Changes the start point or a path's end point, whichever is selected, unless
 * it is locked. `edit` returns the new point, or null to leave it as it is.
 * Control points have no heading, so they are never changed. Returns whether
 * anything changed.
 */
function editSelectedEndPoint(edit: (point: Point) => Point | null): boolean {
  const info = selectedPoint();
  if (info?.ptIdx !== 0) return false;

  if (info.lineNum === 0) {
    const startPoint = get(startPointStore);
    const edited = startPoint.locked ? null : edit(startPoint);
    if (!edited) return false;
    startPointStore.set(edited);
    return true;
  }

  const lines = [...get(linesStore)];
  const lineIndex = info.lineNum - 1;
  const line = lines[lineIndex];
  const edited = !line || line.locked ? null : edit(line.endPoint);
  if (!edited) return false;
  lines[lineIndex] = { ...line, endPoint: edited };
  linesStore.set(lines);
  return true;
}

export function toggleHeadingMode(recordChange: (action?: string) => void) {
  if (isUIElementFocused()) return;
  if (editSelectedEndPoint(withNextHeadingMode)) {
    recordChange("Toggle Heading Mode");
  }
}

export function toggleReverse(recordChange: (action?: string) => void) {
  if (isUIElementFocused()) return;
  const flipped = editSelectedEndPoint((point) =>
    point.heading === "tangential"
      ? { ...point, reverse: !point.reverse }
      : null,
  );
  if (flipped) recordChange("Toggle Reverse");
}

function toggleLineLock(isTarget: (line: Line, index: number) => boolean) {
  linesStore.update((lines) =>
    lines.map((line, index) =>
      isTarget(line, index) ? { ...line, locked: !line.locked } : line,
    ),
  );
}

export function toggleLock(recordChange: (action?: string) => void) {
  if (isUIElementFocused()) return;
  if (!confirmFollowedJavaEdit()) return;
  const sel = get(selectedPointId);
  const selLineId = get(selectedLineId);

  if (!sel) return;
  const info = parseSelectionId(sel);

  if (info.type === "wait" || info.type === "rotate") {
    const kind = info.type === "wait" ? "wait" : "rotate";
    sequenceStore.update((seq) =>
      seq.map((s) =>
        s.kind === kind && s.id === info.id ? { ...s, locked: !s.locked } : s,
      ),
    );
    recordChange("Toggle Lock");
    return;
  }

  if (info.type === "point") {
    if (info.lineNum === 0) {
      startPointStore.update((p) => ({ ...p, locked: !p.locked }));
      recordChange("Toggle Lock");
      return;
    }

    toggleLineLock((_, index) => index === info.lineNum - 1);
    recordChange("Toggle Lock");
    return;
  }

  if (selLineId) {
    toggleLineLock((line) => line.id === selLineId);
    recordChange("Toggle Lock");
  }
}

export function togglePathChain(recordChange: (action?: string) => void) {
  if (isUIElementFocused()) return;
  const selId = get(selectedLineId);
  if (!selId) return;

  const sequence = get(sequenceStore);
  const lines = get(linesStore);
  const sIdx = sequence.findIndex(
    (s) => s.kind === "path" && s.lineId === selId,
  );
  if (sIdx === -1 || sIdx === 0) return; // Cannot chain the first path

  const result = toggleChain(lines, sequence, sIdx);
  const newItem = result.sequence[sIdx];
  const newIsChain = newItem.kind === "path" && !!newItem.isChain;
  linesStore.set(result.lines);
  sequenceStore.set(result.sequence);
  recordChange("Toggle Path Chain");

  notification.set({
    message: `Path chain ${newIsChain ? "enabled" : "disabled"}`,
    type: "success",
    timeout: 2000,
  });
}

export function togglePiecewise(recordChange: (action?: string) => void) {
  if (isUIElementFocused()) return;
  const info = selectedPoint();
  if (!info) return;

  const lines = [...get(linesStore)];

  if (info.lineNum > 0 && info.ptIdx === 0) {
    const lineIndex = info.lineNum - 1;
    const line = lines[lineIndex];
    if (!line || line.locked) return;

    const isPiecewise = line.endPoint.heading === "piecewise";
    if (isPiecewise) {
      // Toggle back to tangential
      lines[lineIndex] = {
        ...line,
        endPoint: {
          ...line.endPoint,
          heading: "tangential",
          reverse: false,
          segments: undefined,
        } as unknown as Point,
      };
    } else {
      // Toggle to piecewise
      lines[lineIndex] = {
        ...line,
        endPoint: {
          ...line.endPoint,
          heading: "piecewise",
          segments: [
            {
              tStart: 0,
              tEnd: 1,
              heading: "tangential",
              reverse: line.endPoint.reverse ?? false,
            },
          ],
        } as unknown as Point,
      };
    }
    linesStore.set(lines);
    recordChange("Toggle Piecewise Heading");

    notification.set({
      message: `Piecewise heading ${isPiecewise ? "disabled" : "enabled"}`,
      type: "success",
      timeout: 2000,
    });
  }
}

/**
 * The first path of the chain that `lines[idx]` belongs to (or is the first
 * path of), or null if it isn't part of a chain.
 */
function chainRootIndex(lines: Line[], idx: number): number | null {
  if (lines[idx].isChain === true) {
    for (let i = idx; i >= 0; i--) {
      if (!lines[i].isChain) return i;
    }
    return null;
  }
  return lines[idx + 1]?.isChain === true ? idx : null;
}

/** An end point's own heading fields and the chain-wide `global...` fields they become. */
const GLOBAL_HEADING_FIELDS = [
  ["degrees", "globalDegrees"],
  ["targetX", "globalTargetX"],
  ["targetY", "globalTargetY"],
  ["reverse", "globalReverse"],
  ["startDeg", "globalStartDeg"],
  ["endDeg", "globalEndDeg"],
] as const;

/** The chain-wide heading that has the same heading as `endPoint`. */
function globalHeadingOf(endPoint: Point): Partial<Line> {
  const fields: Partial<Line> = { globalHeading: endPoint.heading };
  for (const [own, global] of GLOBAL_HEADING_FIELDS) {
    const value = (endPoint as Record<string, any>)[own];
    if (value !== undefined) (fields as Record<string, any>)[global] = value;
  }

  const segments = (endPoint as { segments?: PiecewiseSegment[] }).segments;
  if (segments && segments.length > 0) {
    fields.globalSegments = [...segments];
  } else if (endPoint.heading === "piecewise") {
    fields.globalSegments = [
      {
        tStart: 0,
        tEnd: 1,
        heading: "tangential",
        reverse: endPoint.reverse ?? false,
      },
    ];
  }
  return fields;
}

/** The start point's heading fields for a chain that starts the route, or null if the chain doesn't say. */
function startHeadingFor(chainStart: Line): Partial<Point> | null {
  switch (chainStart.globalHeading) {
    case "constant":
      return { heading: "constant", degrees: chainStart.globalDegrees || 0 };
    case "linear":
      return {
        heading: "linear",
        startDeg: chainStart.globalStartDeg || 0,
        endDeg: chainStart.globalEndDeg || 0,
      };
    case "tangential":
      return { heading: "tangential" };
    case "facingPoint":
      return {
        heading: "facingPoint",
        targetX: chainStart.globalTargetX || 0,
        targetY: chainStart.globalTargetY || 0,
      };
    default:
      return null;
  }
}

/** Makes the start point's heading match a chain that starts the route. */
function matchStartPointToChain(chainStart: Line) {
  const heading = startHeadingFor(chainStart);
  startPointStore.update((s) => ({ ...s, ...heading }) as Point);
}

export function toggleGlobalHeading(recordChange: (action?: string) => void) {
  if (isUIElementFocused()) return;
  const selId = get(selectedLineId);
  if (!selId) return;

  const lines = [...get(linesStore)];
  const idx = lines.findIndex((l) => l.id === selId);
  if (idx === -1 || lines[idx].locked) return;

  // Only paths that are part of a chain have one.
  const rootIndex = chainRootIndex(lines, idx);
  if (rootIndex === null) return;

  const root = lines[rootIndex];
  const wasEnabled = root.globalHeading !== undefined;
  if (wasEnabled) {
    root.globalHeading = undefined;
  } else {
    // Use the selected path's own heading for the whole chain.
    Object.assign(root, globalHeadingOf(lines[idx].endPoint));
  }

  if (rootIndex === 0) matchStartPointToChain(root);

  lines[rootIndex] = { ...root };
  linesStore.set(lines);
  recordChange("Toggle Global Heading");

  notification.set({
    message: `Global chain heading ${wasEnabled ? "disabled" : "enabled"}`,
    type: "success",
    timeout: 2000,
  });
}
