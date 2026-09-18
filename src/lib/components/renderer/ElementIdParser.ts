// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
export type ParsedPoint = {
  type: "point";
  lineIndex: number;
  pointIndex: number;
};

export type ParsedObstacle = {
  type: "obstacle";
  shapeIndex: number;
  vertexIndex: number;
};

export type ParsedEvent = {
  type: "event";
  lineIndex: number;
  eventIndex: number;
};

export type ParsedWaitEvent = {
  type: "wait-event";
  waitId: string;
  eventIndex: number;
};

export type ParsedRotateEvent = {
  type: "rotate-event";
  rotateId: string;
  eventIndex: number;
};

export type ParsedUnknown = {
  type: "unknown";
  originalId: string;
};

export type ParseResult =
  | ParsedPoint
  | ParsedObstacle
  | ParsedEvent
  | ParsedWaitEvent
  | ParsedRotateEvent
  | ParsedUnknown
  | null;

// Longest first, so "wait-event-circle-" wins over "wait-event-".
const STEP_EVENT_PREFIXES = [
  "wait-event-circle-",
  "wait-event-flag-",
  "wait-event-",
  "rotate-event-circle-",
  "rotate-event-arrow-",
  "rotate-event-",
];

/**
 * Parses the element id of an event marker on a wait or rotate step, e.g.
 * "wait-event-{waitId}-{markerIndex}" or "rotate-event-circle-{id}-{n}".
 * Step ids can themselves contain "-", so the index is read from the end.
 */
export function parseStepEventId(
  id: string,
): { kind: "wait" | "rotate"; itemId: string; eventIndex: number } | null {
  const prefix = STEP_EVENT_PREFIXES.find((p) => id.startsWith(p));
  if (!prefix) return null;
  const rest = id.slice(prefix.length);
  const cut = rest.lastIndexOf("-");
  if (cut <= 0) return null;
  const eventIndex = Number(rest.slice(cut + 1));
  if (Number.isNaN(eventIndex)) return null;
  return {
    kind: prefix.startsWith("wait") ? "wait" : "rotate",
    itemId: rest.slice(0, cut),
    eventIndex,
  };
}

/**
 * Parses an element ID string (e.g. from DOM or SVG elements) into structured metadata.
 *
 * Supported formats:
 * - point-{lineIndex+1}-{pointIndex} (where point-0-0 is the start point)
 * - obstacle-{shapeIndex}-{vertexIndex}
 * - event-{lineIndex}-{eventIndex}
 * - wait-event-{waitId}-{eventIndex}
 * - rotate-event-{rotateId}-{eventIndex}
 */
export function parseElementId(id: string | null | undefined): ParseResult {
  if (!id) return null;
  const parts = id.split("-");
  const type = parts[0];

  if (type === "point") {
    const lineNum = Number(parts[1]);
    const pointIdx = Number(parts[2]);
    if (Number.isNaN(lineNum) || Number.isNaN(pointIdx)) return null;
    return { type: "point", lineIndex: lineNum - 1, pointIndex: pointIdx };
  } else if (type === "obstacle") {
    const shapeIdx = Number(parts[1]);
    const vertexIdx = Number(parts[2]);
    if (Number.isNaN(shapeIdx) || Number.isNaN(vertexIdx)) return null;
    return {
      type: "obstacle",
      shapeIndex: shapeIdx,
      vertexIndex: vertexIdx,
    };
  } else if (type === "event") {
    const lineIdx = Number(parts[1]);
    const evIdx = Number(parts[2]);
    if (Number.isNaN(lineIdx) || Number.isNaN(evIdx)) return null;
    return { type: "event", lineIndex: lineIdx, eventIndex: evIdx };
  } else if (parts[1] === "event") {
    const step = parseStepEventId(id);
    if (step?.kind === "wait") {
      return {
        type: "wait-event",
        waitId: step.itemId,
        eventIndex: step.eventIndex,
      };
    }
    if (step?.kind === "rotate") {
      return {
        type: "rotate-event",
        rotateId: step.itemId,
        eventIndex: step.eventIndex,
      };
    }
  }

  return { type: "unknown", originalId: id };
}

/**
 * Normalizes complex SVG event element IDs (e.g. event-circle-0-1, wait-event-flag-id-2) into canonical event keys.
 */
export function normalizeEventElementId(targetId: string): string {
  const step = parseStepEventId(targetId);
  if (step) return `${step.kind}-event-${step.itemId}-${step.eventIndex}`;
  if (
    targetId.startsWith("wait-event-") ||
    targetId.startsWith("rotate-event-")
  ) {
    return targetId;
  }
  const idParts = targetId.split("-");
  if (idParts.length >= 3) {
    return `event-${idParts.at(-2)}-${idParts.at(-1)}`;
  }
  return targetId;
}

/**
 * Resolves the underlying unique event ID for hover highlighting from a normalized or raw event element ID.
 */
export function resolveHoveredMarkerId(
  elemId: string,
  lines: Array<{ eventMarkers?: Array<{ id: string }> }>,
  sequence: Array<{
    kind?: string;
    id?: string;
    eventMarkers?: Array<{ id: string }>;
  }>,
): string | null {
  if (elemId.startsWith("diff-event-")) {
    const parts = elemId.split("-");
    parts.pop(); // remove suffix
    parts.shift(); // diff
    parts.shift(); // event
    return parts.join("-");
  }
  if (elemId.startsWith("event-")) {
    const parts = elemId.split("-");
    if (parts.length >= 3) {
      const lIdx = Number(parts[1]);
      const eIdx = Number(parts[2]);
      if (lines[lIdx]?.eventMarkers?.[eIdx]) {
        return lines[lIdx].eventMarkers[eIdx].id;
      }
    }
  } else {
    const step = parseStepEventId(elemId);
    const item = step
      ? sequence.find((s) => s.kind === step.kind && s.id === step.itemId)
      : undefined;
    const marker = step ? item?.eventMarkers?.[step.eventIndex] : undefined;
    if (marker) return marker.id;
  }
  return null;
}
