// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type {
  Line,
  SequenceItem,
  SequenceWaitItem,
  Point,
  SequenceRotateItem,
} from "../types";

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

// Update linked rotate events: shares degrees
export function updateLinkedRotations(
  sequence: SequenceItem[],
  changedRotateId: string,
): SequenceItem[] {
  const changedItem = sequence.find(
    (s) => s.kind === "rotate" && s.id === changedRotateId,
  ) as SequenceRotateItem | undefined;

  if (!changedItem || !changedItem.name) return sequence;

  return sequence.map((s) => {
    if (
      s.kind === "rotate" &&
      s.id !== changedRotateId &&
      s.name === changedItem.name
    ) {
      return {
        ...s,
        degrees: changedItem.degrees,
      };
    }
    return s;
  });
}

// Handle renaming of a rotate event
export function handleRotateRename(
  sequence: SequenceItem[],
  rotateId: string,
  newName: string,
): SequenceItem[] {
  const rotateToRename = sequence.find(
    (s) => s.kind === "rotate" && s.id === rotateId,
  ) as SequenceRotateItem | undefined;

  if (!rotateToRename) return sequence;

  // If new name is empty, just rename
  if (!newName) {
    return sequence.map((s) =>
      s.kind === "rotate" && s.id === rotateId ? { ...s, name: newName } : s,
    );
  }

  // Check if there are existing rotates with the new name
  const targetGroupRotate = sequence.find(
    (s) => s.kind === "rotate" && s.name === newName && s.id !== rotateId,
  ) as SequenceRotateItem | undefined;

  let updatedRotate: SequenceRotateItem;

  if (targetGroupRotate) {
    // Adopt the degrees of the group
    updatedRotate = {
      ...rotateToRename,
      name: newName,
      degrees: targetGroupRotate.degrees,
    };
  } else {
    updatedRotate = {
      ...rotateToRename,
      name: newName,
    };
  }

  return sequence.map((s) =>
    s.kind === "rotate" && s.id === rotateId ? updatedRotate : s,
  );
}

// Check if a rotate is linked
export function isRotateLinked(
  sequence: SequenceItem[],
  rotateId: string,
): boolean {
  const rotate = sequence.find(
    (s) => s.kind === "rotate" && s.id === rotateId,
  ) as SequenceRotateItem | undefined;
  if (!rotate || !rotate.name) return false;
  return sequence.some(
    (s) => s.kind === "rotate" && s.id !== rotateId && s.name === rotate.name,
  );
}
