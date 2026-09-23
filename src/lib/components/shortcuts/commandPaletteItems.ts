// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type {
  CommandPaletteCommand,
  KeyBinding,
  Line,
  SequenceItem,
} from "../../../types";
import { actionRegistry } from "../../actionRegistry";
import { selectedLineId, selectedPointId } from "../../../stores";

export interface ControlTabScrollable {
  scrollToItem?: (type: string, id: string) => void;
}

export function generateLineCommands(
  lines: Line[],
  controlTabRef?: ControlTabScrollable | null,
): CommandPaletteCommand[] {
  return lines.map((l, i) => ({
    id: `cmd-line-${l.id}`,
    label: l.name ? `Path: ${l.name}` : `Path ${i + 1}`,
    category: "Path Segment",
    action: () => {
      selectedLineId.set(l.id || null);
      const idx = lines.findIndex((ln) => ln.id === l.id);
      if (idx !== -1) {
        selectedPointId.set(`point-${idx + 1}-0`);
      }

      if (controlTabRef?.scrollToItem) {
        controlTabRef.scrollToItem("path", l.id || "");
      }
    },
  }));
}

export function generateWaitCommands(
  sequence: SequenceItem[],
  controlTabRef?: ControlTabScrollable | null,
): CommandPaletteCommand[] {
  return sequence
    .filter((s) => actionRegistry.get(s.kind)?.isWait || s.kind === "wait")
    .map((s) => {
      const waitItem = s as SequenceItem & { id?: string; name?: string };
      const waitId = waitItem.id || "";
      return {
        id: `cmd-wait-${waitId}`,
        label: waitItem.name ? `Wait: ${waitItem.name}` : "Wait",
        category: "Wait",
        action: () => {
          selectedPointId.set(`wait-${waitId}`);
          selectedLineId.set(null);
          controlTabRef?.scrollToItem?.("wait", waitId);
        },
      };
    });
}

export function generateRotateCommands(
  sequence: SequenceItem[],
  controlTabRef?: ControlTabScrollable | null,
): CommandPaletteCommand[] {
  return sequence
    .filter((s) => actionRegistry.get(s.kind)?.isRotate || s.kind === "rotate")
    .map((s) => {
      const rotItem = s as SequenceItem & { id?: string; name?: string };
      const rotId = rotItem.id || "";
      return {
        id: `cmd-rotate-${rotId}`,
        label: rotItem.name ? `Rotate: ${rotItem.name}` : "Rotate",
        category: "Rotate",
        action: () => {
          selectedPointId.set(`rotate-${rotId}`);
          selectedLineId.set(null);
          controlTabRef?.scrollToItem?.("rotate", rotId);
        },
      };
    });
}

export function generateEventCommands(
  lines: Line[],
  sequence: SequenceItem[],
  controlTabRef?: ControlTabScrollable | null,
): CommandPaletteCommand[] {
  const cmds: CommandPaletteCommand[] = [];

  lines.forEach((l, lIdx) => {
    if (l.eventMarkers) {
      l.eventMarkers.forEach((m) => {
        cmds.push({
          id: `cmd-event-${m.id}`,
          label: m.name ? `Event: ${m.name}` : `Event (Path ${lIdx + 1})`,
          category: "Event Marker",
          action: () => {
            controlTabRef?.scrollToItem?.("event", m.id);
          },
        });
      });
    }
  });

  sequence.forEach((s) => {
    const def = actionRegistry.get(s.kind);
    const isWaitOrRotate =
      def?.isWait || def?.isRotate || s.kind === "wait" || s.kind === "rotate";
    if (isWaitOrRotate) {
      const item = s as SequenceItem & {
        eventMarkers?: { id: string; name?: string }[];
      };
      if (item.eventMarkers) {
        const typeLabel = def?.label || (s.kind === "wait" ? "Wait" : "Rotate");
        item.eventMarkers.forEach((m) => {
          cmds.push({
            id: `cmd-event-${m.id}`,
            label: m.name ? `Event: ${m.name}` : `Event (${typeLabel})`,
            category: "Event Marker",
            action: () => {
              controlTabRef?.scrollToItem?.("event", m.id);
            },
          });
        });
      }
    }
  });

  return cmds;
}

export function generateKeybindingCommands(
  keyBindings: KeyBinding[],
  actions: Record<string, (() => void) | undefined>,
): CommandPaletteCommand[] {
  return keyBindings
    .filter((b) => typeof actions[b.action] === "function")
    .map((b) => ({
      id: b.id,
      label: b.description,
      shortcut: b.key,
      category: b.category,
      action: actions[b.action] as () => void,
    }));
}
