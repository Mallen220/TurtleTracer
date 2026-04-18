// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { actionRegistry } from "../../actionRegistry";
import type { SequenceItem } from "../../../types/index";

export type SelectionInfo =
  | { type: "wait"; id: string }
  | { type: "rotate"; id: string }
  | { type: "point"; lineNum: number; ptIdx: number }
  | { type: "event-wait"; id: string; evIdx: number }
  | { type: "event-rotate"; id: string; evIdx: number }
  | { type: "event-line"; lineIdx: number; evIdx: number }
  | { type: "obstacle"; shapeIdx: number; vertexIdx: number }
  | { type: "unknown"; raw: string };

export function parseSelectionId(sel: string): SelectionInfo {
  if (!sel) return { type: "unknown", raw: "" };

  if (sel.startsWith("wait-")) {
    return { type: "wait", id: sel.slice(5) };
  }
  if (sel.startsWith("rotate-")) {
    return { type: "rotate", id: sel.slice(7) };
  }
  if (sel.startsWith("point-")) {
    const parts = sel.split("-");
    return {
      type: "point",
      lineNum: Number(parts[1]),
      ptIdx: Number(parts[2]),
    };
  }
  if (sel.startsWith("event-wait-")) {
    const parts = sel.split("-");
    return {
      type: "event-wait",
      evIdx: Number(parts.pop()),
      id: parts.slice(2).join("-"),
    };
  }
  if (sel.startsWith("event-rotate-")) {
    const parts = sel.split("-");
    return {
      type: "event-rotate",
      evIdx: Number(parts.pop()),
      id: parts.slice(2).join("-"),
    };
  }
  if (sel.startsWith("event-")) {
    const parts = sel.split("-");
    return {
      type: "event-line",
      lineIdx: Number(parts[1]),
      evIdx: Number(parts[2]),
    };
  }
  if (sel.startsWith("obstacle-")) {
    const parts = sel.split("-");
    return {
      type: "obstacle",
      shapeIdx: Number(parts[1]),
      vertexIdx: Number(parts[2]),
    };
  }
  return { type: "unknown", raw: sel };
}

export function findSequenceItem(
  sequence: SequenceItem[],
  id: string,
  kind: "wait" | "rotate",
): any {
  return sequence.find(
    (s) =>
      actionRegistry.get(s.kind)?.[kind === "wait" ? "isWait" : "isRotate"] &&
      (s as any).id === id,
  );
}

export function findSequenceItemIndex(
  sequence: SequenceItem[],
  id: string,
  kind: "wait" | "rotate",
): number {
  return sequence.findIndex(
    (s) =>
      actionRegistry.get(s.kind)?.[kind === "wait" ? "isWait" : "isRotate"] &&
      (s as any).id === id,
  );
}

export function updateEventMarkerPosition(marker: any, delta: number): number {
  let newPos = marker.position + delta;
  return Math.max(0, Math.min(1, newPos));
}
