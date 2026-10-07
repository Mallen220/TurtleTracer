// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type {
  Line,
  Point,
  BasePoint,
  Shape,
  Settings,
  SequenceItem,
  KeyBinding,
  MenuEntry,
  ContextMenuItem,
} from "../../../types";
import { toUser } from "../../../utils/coordinates";
import { getDisplayShortcut } from "../../../utils/shortcuts";
import { DEFAULT_KEY_BINDINGS } from "../../../config/keybindings";
import { getAlignmentMenuItems } from "../../../utils/alignmentMenu";
import {
  parseElementId,
  type ParsedPoint,
  type ParsedObstacle,
} from "./ElementIdParser";
import { getTransformedCoordinates } from "./CoordinateTransform";
import { makeId } from "../../../utils/nameGenerator";

export interface BuildContextMenuCallbacks {
  onRecordChange: (desc?: string) => void;
  setLines: (lines: Line[]) => void;
  updateLines: (updater: (lines: Line[]) => Line[]) => void;
  setStartPoint: (point: Point) => void;
  updateStartPoint: (updater: (point: Point) => Point) => void;
  updateShapes: (updater: (shapes: Shape[]) => Shape[]) => void;
  updateSequence: (updater: (seq: SequenceItem[]) => SequenceItem[]) => void;
  setSelectedLineId: (id: string | null) => void;
  openTransformDialog: () => void;
  notify: (notification: {
    message: string;
    type: "info" | "success" | "warning" | "error";
  }) => void;
  closeContextMenu: () => void;
}

export interface BuildContextMenuParams {
  currentElem: string | null;
  multiSelectedPointIds: string[];
  startPoint: Point;
  lines: Line[];
  shapes: Shape[];
  settings: Settings;
  fieldCoordinates: { x: number; y: number };
  registryItems?: ContextMenuItem[];
  callbacks: BuildContextMenuCallbacks;
}

type SimpleHeadingMode = "tangential" | "constant" | "linear";

const HEADING_MODES: { mode: SimpleHeadingMode; label: string }[] = [
  { mode: "tangential", label: "Tangential" },
  { mode: "constant", label: "Constant" },
  { mode: "linear", label: "Linear" },
];

/**
 * Returns a copy of `p` using the given heading mode. Values from the old mode
 * are carried over where they apply, and anything specific to it is dropped.
 */
function withHeadingMode(p: Point, mode: SimpleHeadingMode): Point {
  const base = {
    x: p.x,
    y: p.y,
    locked: p.locked,
    isMacroElement: p.isMacroElement,
    macroId: p.macroId,
    originalId: p.originalId,
  };
  switch (mode) {
    case "tangential":
      return { ...base, heading: "tangential", reverse: p.reverse ?? false };
    case "constant":
      return { ...base, heading: "constant", degrees: p.degrees ?? 0 };
    case "linear":
      return {
        ...base,
        heading: "linear",
        startDeg: p.startDeg ?? 0,
        endDeg: p.endDeg ?? 0,
      };
  }
}

function headingModeItems(
  current: Point["heading"] | undefined,
  keyBindings: KeyBinding[],
  apply: (mode: SimpleHeadingMode, label: string) => void,
): MenuEntry[] {
  return [
    { separator: true },
    {
      label: "Heading Mode",
      disabled: true,
      shortcut: getDisplayShortcut("toggleHeadingMode", keyBindings),
    },
    ...HEADING_MODES.map(({ mode, label }) => ({
      label,
      disabled: current === mode,
      onClick: () => apply(mode, label),
    })),
  ];
}

/**
 * Builds the context menu items for the FieldRenderer based on the target element,
 * current multi-selection state, registry contributions, and field click position.
 */
export function buildFieldContextMenuItems(
  params: BuildContextMenuParams,
): MenuEntry[] {
  const {
    currentElem,
    multiSelectedPointIds,
    startPoint,
    lines,
    shapes,
    settings,
    fieldCoordinates,
    registryItems,
    callbacks,
  } = params;

  const keyBindings = Array.isArray(settings?.keyBindings)
    ? settings.keyBindings
    : DEFAULT_KEY_BINDINGS;

  const menuItems: MenuEntry[] = [];

  const multiSel = multiSelectedPointIds;
  const isClickOnMultiSel = currentElem ? multiSel.includes(currentElem) : true;

  // Handle multi-selection alignment and distribution
  if (
    multiSel.length > 1 &&
    multiSel.every((id) => id.startsWith("point-")) &&
    isClickOnMultiSel
  ) {
    menuItems.push(
      ...getAlignmentMenuItems(
        multiSel,
        startPoint,
        lines,
        (newLines, newStartPoint) => {
          callbacks.setLines(newLines);
          callbacks.setStartPoint(newStartPoint);
        },
        callbacks.onRecordChange,
      ),
    );
  }

  // Handle single element selection
  if (currentElem && (!isClickOnMultiSel || multiSel.length <= 1)) {
    const parsed = parseElementId(currentElem);
    if (parsed) {
      if (parsed.type === "point") {
        const { lineIndex, pointIndex } = parsed as ParsedPoint;
        const isStartPoint = lineIndex === -1;
        const isControlPoint = pointIndex > 0;
        const isEndPoint = !isStartPoint && !isControlPoint;

        const pointName = isStartPoint
          ? "Start Point"
          : isControlPoint
            ? "Control Point"
            : `Path ${lineIndex + 1}`;

        menuItems.push({ label: pointName, disabled: true });
        menuItems.push({ separator: true });

        // Copy Coordinates
        menuItems.push({
          label: "Copy Coordinates",
          onClick: () => {
            let pt: Point | BasePoint | undefined;
            if (isStartPoint) pt = startPoint;
            else if (lines[lineIndex]) {
              if (isEndPoint) pt = lines[lineIndex].endPoint;
              else pt = lines[lineIndex].controlPoints[pointIndex - 1];
            }
            if (pt) {
              const system = settings.coordinateSystem || "Pedro";
              const userPt = toUser(pt, system);
              const text = `${userPt.x.toFixed(2)}, ${userPt.y.toFixed(2)}`;
              if (typeof navigator !== "undefined" && navigator.clipboard) {
                navigator.clipboard
                  .writeText(text)
                  .catch((err) =>
                    console.warn("Failed to copy to clipboard", err),
                  );
              }
              callbacks.notify({
                message: `Copied "${text}"`,
                type: "success",
              });
            }
          },
        });

        if (isEndPoint) {
          menuItems.push({
            label: "Add Wait Command",
            shortcut: getDisplayShortcut("addWait", keyBindings),
            onClick: () => {
              const lineId = lines[lineIndex]?.id;
              if (!lineId) return;

              callbacks.updateSequence((seq) => {
                const idx = seq.findIndex(
                  (s) => s.kind === "path" && s.lineId === lineId,
                );
                if (idx === -1) return seq;
                const wait: SequenceItem = {
                  kind: "wait",
                  id: makeId("wait"),
                  name: "Wait",
                  durationMs: 1000,
                };
                return [...seq.slice(0, idx + 1), wait, ...seq.slice(idx + 1)];
              });
              callbacks.onRecordChange("Add Wait Command");
            },
          });

          menuItems.push({
            label: "Delete Path",
            shortcut: getDisplayShortcut("removeSelected", keyBindings),
            danger: true,
            onClick: () => {
              callbacks.updateLines((l) => l.filter((_, i) => i !== lineIndex));
              callbacks.onRecordChange("Delete Path");
              callbacks.setSelectedLineId(null);
            },
          });

          menuItems.push(
            ...headingModeItems(
              lines[lineIndex]?.endPoint.heading,
              keyBindings,
              (mode, label) => {
                callbacks.updateLines((l) =>
                  l.map((line, i) =>
                    i === lineIndex
                      ? {
                          ...line,
                          endPoint: withHeadingMode(line.endPoint, mode),
                        }
                      : line,
                  ),
                );
                callbacks.onRecordChange(`Set Heading ${label}`);
              },
            ),
          );
        } else if (isStartPoint) {
          menuItems.push(
            ...headingModeItems(
              startPoint.heading,
              keyBindings,
              (mode, label) => {
                callbacks.updateStartPoint((p) => withHeadingMode(p, mode));
                callbacks.onRecordChange(`Set Start ${label}`);
              },
            ),
          );
        }
      } else if (parsed.type === "obstacle") {
        const { shapeIndex } = parsed as ParsedObstacle;
        menuItems.push({ label: "Obstacle", disabled: true });
        menuItems.push({ separator: true });
        if (shapes[shapeIndex]) {
          menuItems.push({
            label: shapes[shapeIndex].locked ? "Unlock" : "Lock",
            onClick: () => {
              callbacks.updateShapes((s) => {
                const newShapes = [...s];
                if (newShapes[shapeIndex]) {
                  newShapes[shapeIndex] = {
                    ...newShapes[shapeIndex],
                    locked: !newShapes[shapeIndex].locked,
                  };
                }
                return newShapes;
              });
              callbacks.onRecordChange("Toggle Obstacle Lock");
            },
          });
          menuItems.push({
            label: "Delete Obstacle",
            danger: true,
            onClick: () => {
              callbacks.updateShapes((s) => {
                const newShapes = [...s];
                newShapes.splice(shapeIndex, 1);
                return newShapes;
              });
              callbacks.onRecordChange("Delete Obstacle");
            },
          });
        }
      }
    }
  }

  // Handle empty space or append global actions
  if (menuItems.length === 0) {
    if (registryItems && registryItems.length > 0) {
      const validItems = registryItems.filter((item) => {
        if (item.condition) {
          return item.condition(fieldCoordinates);
        }
        return true;
      });

      if (validItems.length > 0) {
        menuItems.push(
          ...validItems.map((item) => ({
            label: item.label,
            icon: item.icon,
            onClick: () => {
              item.onClick(fieldCoordinates);
              callbacks.closeContextMenu();
            },
          })),
        );
      }
    }

    // Add global actions
    if (menuItems.length > 0) {
      menuItems.push({ separator: true });
    }
    menuItems.push({
      label: "Transform Path",
      shortcut: getDisplayShortcut("toggleTransformDialog", keyBindings),
      onClick: () => {
        callbacks.openTransformDialog();
        callbacks.closeContextMenu();
      },
    });
  }

  return menuItems;
}

export interface OpenContextMenuParams {
  event: MouseEvent;
  containerRect: DOMRect;
  fieldRotation: number;
  xInvert: (px: number) => number;
  yInvert: (py: number) => number;
  currentElem: string | null;
  multiSelectedPointIds: string[];
  startPoint: Point;
  lines: Line[];
  shapes: Shape[];
  settings: Settings;
  registryItems: ContextMenuItem[];
  callbacks: BuildContextMenuCallbacks;
}

export interface OpenContextMenuResult {
  items: MenuEntry[];
  x: number;
  y: number;
}

/**
 * Transforms client event coordinates into field coordinates and builds context menu items.
 */
export function buildContextMenuForEvent(
  params: OpenContextMenuParams,
): OpenContextMenuResult | null {
  const { event, containerRect, fieldRotation, xInvert, yInvert, ...rest } =
    params;
  const transformed = getTransformedCoordinates(
    event.clientX,
    event.clientY,
    containerRect,
    fieldRotation,
  );
  const fieldCoordinates = {
    x: xInvert(transformed.x),
    y: yInvert(transformed.y),
  };
  const items = buildFieldContextMenuItems({
    ...rest,
    fieldCoordinates,
  });
  if (items.length === 0) return null;
  return {
    items,
    x: event.clientX,
    y: event.clientY,
  };
}

export interface StoreCallbacksInputs {
  onRecordChange: (desc?: string) => void;
  linesStore: {
    set: (lines: Line[]) => void;
    update: (updater: (lines: Line[]) => Line[]) => void;
  };
  startPointStore: {
    set: (point: Point) => void;
    update: (updater: (point: Point) => Point) => void;
  };
  shapesStore: {
    update: (updater: (shapes: Shape[]) => Shape[]) => void;
  };
  sequenceStore: {
    update: (updater: (seq: SequenceItem[]) => SequenceItem[]) => void;
  };
  selectedLineIdStore: {
    set: (id: string | null) => void;
  };
  showTransformDialogStore: {
    set: (show: boolean) => void;
  };
  notificationStore: {
    set: (notification: {
      message: string;
      type: "info" | "success" | "warning" | "error";
    }) => void;
  };
  onClose: () => void;
}

/**
 * Creates standard callback implementations for Svelte stores used by the context menu.
 */
export function createContextMenuStoreCallbacks(
  inputs: StoreCallbacksInputs,
): BuildContextMenuCallbacks {
  return {
    onRecordChange: inputs.onRecordChange,
    setLines: (l) => inputs.linesStore.set(l),
    updateLines: (u) => inputs.linesStore.update(u),
    setStartPoint: (p) => inputs.startPointStore.set(p),
    updateStartPoint: (u) => inputs.startPointStore.update(u),
    updateShapes: (u) => inputs.shapesStore.update(u),
    updateSequence: (u) => inputs.sequenceStore.update(u),
    setSelectedLineId: (id) => inputs.selectedLineIdStore.set(id),
    openTransformDialog: () => inputs.showTransformDialogStore.set(true),
    notify: (n) => inputs.notificationStore.set(n),
    closeContextMenu: inputs.onClose,
  };
}
