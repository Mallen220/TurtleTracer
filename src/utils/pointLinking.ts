// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import type { Line, SequenceItem, SequenceWaitItem, Point } from "../types";

// Update linked waypoints: shares endpoint x/y
export function updateLinkedWaypoints(
  allLines: Line[],
  changedLineId: string,
): Line[] {
  const changedLine = allLines.find((l) => l.id === changedLineId);
  if (!changedLine || !changedLine.name) return allLines;

  // Find other lines with the same non-empty name
  const linkedLines = allLines.filter(
    (l) => l.id !== changedLineId && l.name === changedLine.name,
  );

  if (linkedLines.length === 0) return allLines;

  // Update their endpoints to match the changed line
  return allLines.map((l) => {
    if (l.id !== changedLineId && l.name === changedLine.name) {
      return {
        ...l,
        endPoint: {
          ...l.endPoint,
          x: changedLine.endPoint.x,
          y: changedLine.endPoint.y,
        },
      };
    }
    return l;
  });
}

// Handle renaming of a waypoint
export function handleWaypointRename(
  allLines: Line[],
  lineId: string,
  newName: string,
): Line[] {
  const lineToRename = allLines.find((l) => l.id === lineId);
  if (!lineToRename) return allLines;

  // If new name is empty, just rename and it is unlinked
  if (!newName) {
    return allLines.map((l) => (l.id === lineId ? { ...l, name: newName } : l));
  }

  // Check if there are existing lines with the new name
  const targetGroupLine = allLines.find(
    (l) => l.name === newName && l.id !== lineId,
  );

  let updatedLine: Line;

  if (targetGroupLine) {
    // Adopt the position of the group
    updatedLine = {
      ...lineToRename,
      name: newName,
      endPoint: {
        ...lineToRename.endPoint,
        x: targetGroupLine.endPoint.x,
        y: targetGroupLine.endPoint.y,
      },
    };
  } else {
    // Just rename, it starts a new group (or is unique)
    updatedLine = {
      ...lineToRename,
      name: newName,
    };
  }

  return allLines.map((l) => (l.id === lineId ? updatedLine : l));
}

// Update linked wait events: shares duration
export function updateLinkedWaits(
  sequence: SequenceItem[],
  changedWaitId: string,
): SequenceItem[] {
  const changedItem = sequence.find(
    (s) => s.kind === "wait" && s.id === changedWaitId,
  ) as SequenceWaitItem | undefined;

  if (!changedItem || !changedItem.name) return sequence;

  return sequence.map((s) => {
    if (
      s.kind === "wait" &&
      s.id !== changedWaitId &&
      s.name === changedItem.name
    ) {
      return {
        ...s,
        durationMs: changedItem.durationMs,
      };
    }
    return s;
  });
}

// Handle renaming of a wait event
export function handleWaitRename(
  sequence: SequenceItem[],
  waitId: string,
  newName: string,
): SequenceItem[] {
  const waitToRename = sequence.find(
    (s) => s.kind === "wait" && s.id === waitId,
  ) as SequenceWaitItem | undefined;

  if (!waitToRename) return sequence;

  // If new name is empty, just rename
  if (!newName) {
    return sequence.map((s) =>
      s.kind === "wait" && s.id === waitId ? { ...s, name: newName } : s,
    );
  }

  // Check if there are existing waits with the new name
  const targetGroupWait = sequence.find(
    (s) => s.kind === "wait" && s.name === newName && s.id !== waitId,
  ) as SequenceWaitItem | undefined;

  let updatedWait: SequenceWaitItem;

  if (targetGroupWait) {
    // Adopt the duration of the group
    updatedWait = {
      ...waitToRename,
      name: newName,
      durationMs: targetGroupWait.durationMs,
    };
  } else {
    updatedWait = {
      ...waitToRename,
      name: newName,
    };
  }

  return sequence.map((s) =>
    s.kind === "wait" && s.id === waitId ? updatedWait : s,
  );
}

// Check if a line is linked
export function isLineLinked(allLines: Line[], lineId: string): boolean {
  const line = allLines.find((l) => l.id === lineId);
  if (!line || !line.name) return false;
  return allLines.some((l) => l.id !== lineId && l.name === line.name);
}

// Check if a wait is linked
export function isWaitLinked(
  sequence: SequenceItem[],
  waitId: string,
): boolean {
  const wait = sequence.find((s) => s.kind === "wait" && s.id === waitId) as
    | SequenceWaitItem
    | undefined;
  if (!wait || !wait.name) return false;
  return sequence.some(
    (s) => s.kind === "wait" && s.id !== waitId && s.name === wait.name,
  );
}
