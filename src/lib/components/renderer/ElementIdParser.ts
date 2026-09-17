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
  } else if (type === "wait" && parts[1] === "event") {
    const waitId = parts[2];
    const evIdx = Number(parts[3]);
    return { type: "wait-event", waitId, eventIndex: evIdx };
  } else if (type === "rotate" && parts[1] === "event") {
    const rotateId = parts[2];
    const evIdx = Number(parts[3]);
    return { type: "rotate-event", rotateId, eventIndex: evIdx };
  }

  return { type: "unknown", originalId: id };
}

/**
 * Normalizes complex SVG event element IDs (e.g. event-circle-0-1, wait-event-flag-id-2) into canonical event keys.
 */
export function normalizeEventElementId(targetId: string): string {
  const idParts = targetId.split("-");
  if (targetId.startsWith("wait-event-")) {
    if (idParts.length >= 4) {
      const waitId = idParts[idParts.length - 2];
      const evIdx = idParts[idParts.length - 1];
      return `wait-event-${waitId}-${evIdx}`;
    }
    return targetId;
  }
  if (targetId.startsWith("rotate-event-")) {
    if (idParts.length >= 4) {
      const rotateId = idParts[idParts.length - 2];
      const evIdx = idParts[idParts.length - 1];
      return `rotate-event-${rotateId}-${evIdx}`;
    }
    return targetId;
  }
  if (idParts.length >= 3) {
    const lineIdx = idParts[idParts.length - 2];
    const evIdx = idParts[idParts.length - 1];
    return `event-${lineIdx}-${evIdx}`;
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
  } else if (elemId.startsWith("wait-event-")) {
    const parts = elemId.split("-");
    if (parts.length >= 4) {
      const waitId = parts[2];
      const eIdx = Number(parts[3]);
      const waitItem = sequence.find(
        (s) => s.kind === "wait" && s.id === waitId,
      );
      if (waitItem?.eventMarkers?.[eIdx]) {
        return waitItem.eventMarkers[eIdx].id;
      }
    }
  } else if (elemId.startsWith("rotate-event-")) {
    const parts = elemId.split("-");
    if (parts.length >= 4) {
      const rotateId = parts[2];
      const eIdx = Number(parts[3]);
      const rotateItem = sequence.find(
        (s) => s.kind === "rotate" && s.id === rotateId,
      );
      if (rotateItem?.eventMarkers?.[eIdx]) {
        return rotateItem.eventMarkers[eIdx].id;
      }
    }
  }
  return null;
}
