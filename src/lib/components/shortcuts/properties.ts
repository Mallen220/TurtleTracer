// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { get } from "svelte/store";
import { linesStore, sequenceStore, startPointStore } from "../../projectStore";
import { selectedLineId, selectedPointId, notification } from "../../../stores";
import { actionRegistry } from "../../actionRegistry";
import {
  updateLinkedWaits,
  updateLinkedRotations,
} from "../../../utils/pointLinking";
import type { Point } from "../../../types/index";
import { isUIElementFocused } from "./utils";
import {
  parseSelectionId,
  findSequenceItem,
  findSequenceItemIndex,
  updateEventMarkerPosition,
} from "./itemUtils";

export function modifyValue(
  delta: number,
  recordChange: (action?: string) => void,
) {
  if (isUIElementFocused()) return;
  const current = get(selectedPointId);
  const sequence = [...get(sequenceStore)];
  const lines = [...get(linesStore)];
  if (!current) return;

  const info = parseSelectionId(current);

  if (info.type === "wait") {
    const item = findSequenceItem(sequence, info.id, "wait");
    if (item && !item.locked) {
      const newItem = {
        ...item,
        durationMs: Math.max(0, item.durationMs + delta * 100),
      };
      const itemIdx = findSequenceItemIndex(sequence, info.id, "wait");
      if (itemIdx !== -1) {
        sequence[itemIdx] = newItem;
        sequenceStore.set([...updateLinkedWaits(sequence, newItem.id)]);
        recordChange("Modify Duration");
      }
    }
    return;
  }
  if (info.type === "rotate") {
    const item = findSequenceItem(sequence, info.id, "rotate");
    if (item && !item.locked) {
      const step = 5;
      const newItem = {
        ...item,
        degrees: Number((item.degrees + delta * step).toFixed(2)),
      };
      const itemIdx = findSequenceItemIndex(sequence, info.id, "rotate");
      if (itemIdx !== -1) {
        sequence[itemIdx] = newItem;
        sequenceStore.set([...updateLinkedRotations(sequence, newItem.id)]);
        recordChange("Modify Rotation");
      }
    }
    return;
  }
  if (info.type === "event-wait" || info.type === "event-rotate") {
    const kind = info.type === "event-wait" ? "wait" : "rotate";
    const itemIdx = findSequenceItemIndex(sequence, info.id, kind);
    if (itemIdx !== -1) {
      const item = sequence[itemIdx] as any;
      if (item?.eventMarkers?.[info.evIdx] && !item.locked) {
        const newPos = updateEventMarkerPosition(
          item.eventMarkers[info.evIdx],
          0.01 * delta,
        );
        const newMarkers = [...item.eventMarkers];
        newMarkers[info.evIdx] = {
          ...newMarkers[info.evIdx],
          position: newPos,
        };
        sequence[itemIdx] = { ...item, eventMarkers: newMarkers };
        sequenceStore.set([...sequence]);
        recordChange("Move Event Marker");
      }
    }
    return;
  }
  if (info.type === "event-line") {
    const line = lines[info.lineIdx];
    if (line?.eventMarkers?.[info.evIdx] && !line.locked) {
      const newPos = updateEventMarkerPosition(
        line.eventMarkers[info.evIdx],
        0.01 * delta,
      );
      const newMarkers = [...line.eventMarkers];
      newMarkers[info.evIdx] = { ...newMarkers[info.evIdx], position: newPos };
      lines[info.lineIdx] = { ...line, eventMarkers: newMarkers };
      linesStore.set([...lines]);
      recordChange("Move Event Marker");
    }
    return;
  }
  // Modify last event if line selected
  if (get(selectedLineId)) {
    const lineIdx = lines.findIndex((l) => l.id === get(selectedLineId));
    if (lineIdx !== -1) {
      const line = lines[lineIdx];
      if (line?.eventMarkers && line.eventMarkers?.length > 0 && !line.locked) {
        const lastIdx = line.eventMarkers.length - 1;
        const newPos = updateEventMarkerPosition(
          line.eventMarkers[lastIdx],
          0.01 * delta,
        );
        const newMarkers = [...line.eventMarkers];
        newMarkers[lastIdx] = { ...newMarkers[lastIdx], position: newPos };
        lines[lineIdx] = { ...line, eventMarkers: newMarkers };
        linesStore.set([...lines]);
        recordChange("Move Event Marker");
      }
    }
  }
}

export function toggleHeadingMode(recordChange: (action?: string) => void) {
  if (isUIElementFocused()) return;
  const sel = get(selectedPointId);
  if (!sel?.startsWith("point-")) return;

  const startPoint = get(startPointStore);
  const lines = get(linesStore);

  const parts = sel.split("-");
  const lineNum = Number(parts[1]);
  const ptIdx = Number(parts[2]);

  // Only Start Point (lineNum=0, ptIdx=0) and Line End Points (ptIdx=0) have heading modes
  if (lineNum === 0 && ptIdx === 0) {
    if (startPoint.locked) return;
    // Cycle: tangential -> constant -> linear
    const modes = ["tangential", "constant", "linear"];
    const current = startPoint.heading;
    const next = modes[(modes.indexOf(current as string) + 1) % modes.length];

    // Update start point structure based on new mode
    if (next === "tangential") {
      startPointStore.set({
        ...startPoint,
        heading: "tangential",
        reverse: false,
        degrees: undefined,
        startDeg: undefined,
        endDeg: undefined,
      } as unknown as Point);
    } else if (next === "constant") {
      startPointStore.set({
        ...startPoint,
        heading: "constant",
        degrees: 0,
        reverse: undefined,
        startDeg: undefined,
        endDeg: undefined,
      } as unknown as Point);
    } else {
      startPointStore.set({
        ...startPoint,
        heading: "linear",
        startDeg: 90,
        endDeg: 180,
        reverse: undefined,
        degrees: undefined,
      } as unknown as Point);
    }
    recordChange("Toggle Heading Mode");
    return;
  }

  if (lineNum > 0 && ptIdx === 0) {
    const lineIndex = lineNum - 1;
    const line = lines[lineIndex];
    if (!line || line.locked) return;

    const modes = ["tangential", "constant", "linear"];
    const current = line.endPoint.heading;
    const next = modes[(modes.indexOf(current as string) + 1) % modes.length];

    if (next === "tangential") {
      lines[lineIndex] = {
        ...line,
        endPoint: {
          ...line.endPoint,
          heading: "tangential",
          reverse: false,
          degrees: undefined,
          startDeg: undefined,
          endDeg: undefined,
        } as unknown as Point,
      };
    } else if (next === "constant") {
      lines[lineIndex] = {
        ...line,
        endPoint: {
          ...line.endPoint,
          heading: "constant",
          degrees: 0,
          reverse: undefined,
          startDeg: undefined,
          endDeg: undefined,
        } as unknown as Point,
      };
    } else {
      lines[lineIndex] = {
        ...line,
        endPoint: {
          ...line.endPoint,
          heading: "linear",
          startDeg: 90,
          endDeg: 180,
          reverse: undefined,
          degrees: undefined,
        } as unknown as Point,
      };
    }
    linesStore.set([...lines]);
    recordChange("Toggle Heading Mode");
  }
}

export function toggleReverse(recordChange: (action?: string) => void) {
  if (isUIElementFocused()) return;
  const sel = get(selectedPointId);
  const startPoint = get(startPointStore);
  const lines = get(linesStore);
  if (!sel?.startsWith("point-")) return;

  const parts = sel.split("-");
  const lineNum = Number(parts[1]);
  const ptIdx = Number(parts[2]);

  if (lineNum === 0 && ptIdx === 0) {
    if (startPoint.locked) return;
    if (startPoint.heading === "tangential") {
      startPointStore.set({
        ...startPoint,
        reverse: !startPoint.reverse,
      });
      recordChange("Toggle Reverse");
    }
    return;
  }

  if (lineNum > 0 && ptIdx === 0) {
    const lineIndex = lineNum - 1;
    const line = lines[lineIndex];
    if (!line || line.locked) return;

    if (line.endPoint.heading === "tangential") {
      lines[lineIndex] = {
        ...line,
        endPoint: {
          ...line.endPoint,
          reverse: !line.endPoint.reverse,
        },
      };
      linesStore.set([...lines]);
      recordChange("Toggle Reverse");
    }
  }
}

export function toggleLock(recordChange: (action?: string) => void) {
  if (isUIElementFocused()) return;
  const sel = get(selectedPointId);
  const selLineId = get(selectedLineId);

  if (!sel) return;
  const info = parseSelectionId(sel);

  if (info.type === "wait" || info.type === "rotate") {
    const kind = info.type === "wait" ? "wait" : "rotate";
    sequenceStore.update((seq) =>
      seq.map((s) => {
        if (
          actionRegistry.get(s.kind)?.[
            kind === "wait" ? "isWait" : "isRotate"
          ] &&
          (s as any).id === info.id
        ) {
          return { ...s, locked: !(s as any).locked };
        }
        return s;
      }),
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

    const lineIndex = info.lineNum - 1;
    linesStore.update((l) => {
      const newLines = [...l];
      if (newLines[lineIndex]) {
        newLines[lineIndex] = {
          ...newLines[lineIndex],
          locked: !newLines[lineIndex].locked,
        };
      }
      return newLines;
    });
    recordChange("Toggle Lock");
    return;
  }

  if (selLineId) {
    linesStore.update((l) => {
      const newLines = [...l];
      const idx = newLines.findIndex((line) => line.id === selLineId);
      if (idx !== -1) {
        newLines[idx] = {
          ...newLines[idx],
          locked: !newLines[idx].locked,
        };
      }
      return newLines;
    });
    recordChange("Toggle Lock");
  }
}

export function togglePathChain(recordChange: (action?: string) => void) {
  if (isUIElementFocused()) return;
  const selId = get(selectedLineId);
  if (!selId) return;

  const sequence = [...get(sequenceStore)];
  const lines = [...get(linesStore)];
  const sIdx = sequence.findIndex(
    (s) => s.kind === "path" && s.lineId === selId,
  );
  if (sIdx === -1 || sIdx === 0) return; // Cannot chain the first path

  const item = sequence[sIdx] as any;
  const newIsChain = !item.isChain;

  if (!newIsChain) {
    // Reset globalHeading for all paths in the former chain island
    let rootIdx = sIdx;
    while (
      rootIdx > 0 &&
      sequence[rootIdx - 1].kind === "path" &&
      (sequence[rootIdx] as any).isChain
    ) {
      rootIdx--;
    }

    let endIdx = sIdx;
    while (
      endIdx + 1 < sequence.length &&
      sequence[endIdx + 1].kind === "path" &&
      (sequence[endIdx + 1] as any).isChain
    ) {
      endIdx++;
    }

    for (let i = rootIdx; i <= endIdx; i++) {
      const sItem = sequence[i];
      if (sItem.kind === "path") {
        const lIdx = lines.findIndex((l) => l.id === (sItem as any).lineId);
        if (lIdx !== -1 && lines[lIdx].globalHeading !== undefined) {
          lines[lIdx] = { ...lines[lIdx], globalHeading: undefined };
        }
      }
    }
  }

  sequence[sIdx] = { ...item, isChain: newIsChain };
  const lIdx = lines.findIndex((l) => l.id === selId);
  if (lIdx !== -1) {
    lines[lIdx] = { ...lines[lIdx], isChain: newIsChain };
  }

  linesStore.set([...lines]);
  sequenceStore.set([...sequence]);
  recordChange("Toggle Path Chain");

  notification.set({
    message: `Path chain ${newIsChain ? "enabled" : "disabled"}`,
    type: "success",
    timeout: 2000,
  });
}

export function togglePiecewise(recordChange: (action?: string) => void) {
  if (isUIElementFocused()) return;
  const sel = get(selectedPointId);
  if (!sel?.startsWith("point-")) return;

  const lines = [...get(linesStore)];
  const parts = sel.split("-");
  const lineNum = Number(parts[1]);
  const ptIdx = Number(parts[2]);

  if (lineNum > 0 && ptIdx === 0) {
    const lineIndex = lineNum - 1;
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

export function toggleGlobalHeading(recordChange: (action?: string) => void) {
  if (isUIElementFocused()) return;
  const selId = get(selectedLineId);
  if (!selId) return;

  const lines = [...get(linesStore)];
  const idx = lines.findIndex((l) => l.id === selId);
  if (idx === -1) return;

  const line = lines[idx];
  if (line.locked) return;

  // Find if it's already part of a chain
  let isChainContinuation = line.isChain === true;
  let isChainRoot =
    !isChainContinuation &&
    idx + 1 < lines.length &&
    lines[idx + 1].isChain === true;

  if (!isChainRoot && !isChainContinuation) return; // Only works for chains

  // Find chain root
  let chainRootIndex = -1;
  if (isChainRoot) chainRootIndex = idx;
  else {
    for (let i = idx; i >= 0; i--) {
      if (!lines[i].isChain) {
        chainRootIndex = i;
        break;
      }
    }
  }

  if (chainRootIndex === -1) return;

  const targetLine = lines[chainRootIndex];
  const hasGlobalHeading = targetLine.globalHeading !== undefined;

  if (hasGlobalHeading) {
    targetLine.globalHeading = undefined;
  } else {
    // Enable global heading using current endPoint values
    targetLine.globalHeading = line.endPoint.heading;
    if (line.endPoint.degrees !== undefined)
      targetLine.globalDegrees = line.endPoint.degrees;
    if (line.endPoint.targetX !== undefined)
      targetLine.globalTargetX = line.endPoint.targetX;
    if (line.endPoint.targetY !== undefined)
      targetLine.globalTargetY = line.endPoint.targetY;
    if (line.endPoint.reverse !== undefined)
      targetLine.globalReverse = line.endPoint.reverse;
    if (line.endPoint.startDeg !== undefined)
      targetLine.globalStartDeg = line.endPoint.startDeg;
    if (line.endPoint.endDeg !== undefined)
      targetLine.globalEndDeg = line.endPoint.endDeg;

    if (line.endPoint.segments && line.endPoint.segments.length > 0) {
      targetLine.globalSegments = [...line.endPoint.segments];
    } else if (line.endPoint.heading === "piecewise") {
      targetLine.globalSegments = [
        {
          tStart: 0,
          tEnd: 1,
          heading: "tangential",
          reverse: line.endPoint.reverse ?? false,
        },
      ];
    }
  }

  // Sync starting point if root is index 0
  if (chainRootIndex === 0) {
    startPointStore.update((s) => {
      const h = targetLine.globalHeading;
      if (h === "constant" || h === "linear") {
        s.heading = h;
        if (h === "constant") s.degrees = targetLine.globalDegrees || 0;
        else {
          s.startDeg = targetLine.globalStartDeg || 0;
          s.endDeg = targetLine.globalEndDeg || 0;
        }
      } else if (h === "tangential" || h === "facingPoint") {
        s.heading = h;
        if (h === "facingPoint") {
          s.targetX = targetLine.globalTargetX || 0;
          s.targetY = targetLine.globalTargetY || 0;
        }
      }
      return { ...s };
    });
  }

  lines[chainRootIndex] = { ...targetLine };
  linesStore.set(lines);
  recordChange("Toggle Global Heading");

  notification.set({
    message: `Global chain heading ${hasGlobalHeading ? "disabled" : "enabled"}`,
    type: "success",
    timeout: 2000,
  });
}
