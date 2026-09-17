// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type {
  Line,
  Point,
  BasePoint,
  Shape,
  Settings,
  SequenceItem,
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

export interface ContextMenuItemDescriptor {
  label?: string;
  action?: string;
  onClick?: () => void;
  icon?: any;
  separator?: boolean;
  danger?: boolean;
  disabled?: boolean;
  shortcut?: string;
}

export interface RegistryContextMenuItem {
  condition?: (pos: { x: number; y: number }) => boolean;
  label: string;
  icon?: any;
  onClick: (pos: { x: number; y: number }) => void;
}

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
  registryItems?: RegistryContextMenuItem[];
  callbacks: BuildContextMenuCallbacks;
}

/**
 * Builds the context menu items for the FieldRenderer based on the target element,
 * current multi-selection state, registry contributions, and field click position.
 */
export function buildFieldContextMenuItems(
  params: BuildContextMenuParams,
): ContextMenuItemDescriptor[] {
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

  const menuItems: ContextMenuItemDescriptor[] = [];

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
                navigator.clipboard.writeText(text);
              }
              callbacks.notify({
                message: `Copied "${text}"`,
                type: "success",
              });
            }
          },
        });

        // EndPoint specific actions
        if (isEndPoint) {
          menuItems.push({
            label: "Add Wait Command",
            shortcut: getDisplayShortcut("addWait", keyBindings),
            onClick: () => {
              const lineId = lines[lineIndex]?.id;
              if (!lineId) return;

              callbacks.updateSequence((seq) => {
                const newSeq = [...seq];
                const idx = newSeq.findIndex(
                  (s) => s.kind === "path" && (s as any).lineId === lineId,
                );
                if (idx !== -1) {
                  newSeq.splice(idx + 1, 0, {
                    kind: "wait",
                    id: `wait-${Math.random().toString(36).slice(2)}`,
                    name: "Wait",
                    durationMs: 1000,
                  } as SequenceItem);
                }
                return newSeq;
              });
              callbacks.onRecordChange("Add Wait Command");
            },
          });

          menuItems.push({
            label: "Delete Path",
            shortcut: getDisplayShortcut("removeSelected", keyBindings),
            danger: true,
            onClick: () => {
              callbacks.updateLines((l) => {
                const newLines = [...l];
                newLines.splice(lineIndex, 1);
                return newLines;
              });
              callbacks.onRecordChange("Delete Path");
              callbacks.setSelectedLineId(null);
            },
          });

          const currentHeading = lines[lineIndex]?.endPoint.heading;
          const headingShortcut = getDisplayShortcut(
            "toggleHeadingMode",
            keyBindings,
          );
          menuItems.push({ separator: true });
          menuItems.push({
            label: "Heading Mode",
            disabled: true,
            shortcut: headingShortcut,
          });
          menuItems.push({
            label: "Tangential",
            disabled: currentHeading === "tangential",
            onClick: () => {
              callbacks.updateLines((l) => {
                const newLines = [...l];
                const line = { ...newLines[lineIndex] };
                if (!line) return l;
                const ep = line.endPoint;
                const base = {
                  x: ep.x,
                  y: ep.y,
                  locked: ep.locked,
                  isMacroElement: ep.isMacroElement,
                  macroId: ep.macroId,
                  originalId: ep.originalId,
                };
                line.endPoint = {
                  ...base,
                  heading: "tangential",
                  reverse: (ep as any).reverse ?? false,
                };
                newLines[lineIndex] = line;
                return newLines;
              });
              callbacks.onRecordChange("Set Heading Tangential");
            },
          });
          menuItems.push({
            label: "Constant",
            disabled: currentHeading === "constant",
            onClick: () => {
              callbacks.updateLines((l) => {
                const newLines = [...l];
                const line = { ...newLines[lineIndex] };
                if (!line) return l;
                const ep = line.endPoint;
                const base = {
                  x: ep.x,
                  y: ep.y,
                  locked: ep.locked,
                  isMacroElement: ep.isMacroElement,
                  macroId: ep.macroId,
                  originalId: ep.originalId,
                };
                line.endPoint = {
                  ...base,
                  heading: "constant",
                  degrees: (ep as any).degrees ?? 0,
                };
                newLines[lineIndex] = line;
                return newLines;
              });
              callbacks.onRecordChange("Set Heading Constant");
            },
          });
          menuItems.push({
            label: "Linear",
            disabled: currentHeading === "linear",
            onClick: () => {
              callbacks.updateLines((l) => {
                const newLines = [...l];
                const line = { ...newLines[lineIndex] };
                if (!line) return l;
                const ep = line.endPoint;
                const base = {
                  x: ep.x,
                  y: ep.y,
                  locked: ep.locked,
                  isMacroElement: ep.isMacroElement,
                  macroId: ep.macroId,
                  originalId: ep.originalId,
                };
                line.endPoint = {
                  ...base,
                  heading: "linear",
                  startDeg: (ep as any).startDeg ?? 0,
                  endDeg: (ep as any).endDeg ?? 0,
                };
                newLines[lineIndex] = line;
                return newLines;
              });
              callbacks.onRecordChange("Set Heading Linear");
            },
          });
        } else if (isStartPoint) {
          const currentHeading = startPoint.heading;
          const headingShortcut = getDisplayShortcut(
            "toggleHeadingMode",
            keyBindings,
          );
          menuItems.push({ separator: true });
          menuItems.push({
            label: "Heading Mode",
            disabled: true,
            shortcut: headingShortcut,
          });
          menuItems.push({
            label: "Tangential",
            disabled: currentHeading === "tangential",
            onClick: () => {
              callbacks.updateStartPoint((p) => {
                const base = {
                  x: p.x,
                  y: p.y,
                  locked: p.locked,
                  isMacroElement: p.isMacroElement,
                  macroId: p.macroId,
                  originalId: p.originalId,
                };
                return {
                  ...base,
                  heading: "tangential",
                  reverse: (p as any).reverse ?? false,
                };
              });
              callbacks.onRecordChange("Set Start Tangential");
            },
          });
          menuItems.push({
            label: "Constant",
            disabled: currentHeading === "constant",
            onClick: () => {
              callbacks.updateStartPoint((p) => {
                const base = {
                  x: p.x,
                  y: p.y,
                  locked: p.locked,
                  isMacroElement: p.isMacroElement,
                  macroId: p.macroId,
                  originalId: p.originalId,
                };
                return {
                  ...base,
                  heading: "constant",
                  degrees: (p as any).degrees ?? 0,
                };
              });
              callbacks.onRecordChange("Set Start Constant");
            },
          });
          menuItems.push({
            label: "Linear",
            disabled: currentHeading === "linear",
            onClick: () => {
              callbacks.updateStartPoint((p) => {
                const base = {
                  x: p.x,
                  y: p.y,
                  locked: p.locked,
                  isMacroElement: p.isMacroElement,
                  macroId: p.macroId,
                  originalId: p.originalId,
                };
                return {
                  ...base,
                  heading: "linear",
                  startDeg: (p as any).startDeg ?? 0,
                  endDeg: (p as any).endDeg ?? 0,
                };
              });
              callbacks.onRecordChange("Set Start Linear");
            },
          });
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
  registryItems: RegistryContextMenuItem[];
  callbacks: BuildContextMenuCallbacks;
}

export interface OpenContextMenuResult {
  items: ContextMenuItemDescriptor[];
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
