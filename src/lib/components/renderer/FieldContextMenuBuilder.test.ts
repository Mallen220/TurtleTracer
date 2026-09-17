// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi } from "vitest";
import {
  buildFieldContextMenuItems,
  buildContextMenuForEvent,
  createContextMenuStoreCallbacks,
} from "./FieldContextMenuBuilder";
import type { Line, Point, Shape, Settings } from "../../../types";

describe("FieldContextMenuBuilder", () => {
  const defaultSettings: Settings = {
    coordinateSystem: "Pedro",
    keyBindings: {},
  } as Settings;

  const startPoint: Point = { x: 10, y: 20, heading: "tangential" };
  const lines: Line[] = [
    {
      id: "line-1",
      color: "#ff0000",
      endPoint: { x: 30, y: 40, heading: "tangential" },
      controlPoints: [{ x: 20, y: 30 }],
    },
  ];
  const shapes: Shape[] = [
    {
      id: "shape-1",
      name: "Obstacle 1",
      color: "#000",
      fillColor: "#fff",
      locked: false,
      vertices: [
        { x: 50, y: 50 },
        { x: 60, y: 60 },
      ],
    },
  ];

  function createMockCallbacks() {
    return {
      onRecordChange: vi.fn(),
      setLines: vi.fn(),
      updateLines: vi.fn(),
      setStartPoint: vi.fn(),
      updateStartPoint: vi.fn(),
      updateShapes: vi.fn(),
      updateSequence: vi.fn(),
      setSelectedLineId: vi.fn(),
      openTransformDialog: vi.fn(),
      notify: vi.fn(),
      closeContextMenu: vi.fn(),
    };
  }

  it("builds empty space context menu with Transform Path", () => {
    const callbacks = createMockCallbacks();
    const items = buildFieldContextMenuItems({
      currentElem: null,
      multiSelectedPointIds: [],
      startPoint,
      lines,
      shapes,
      settings: defaultSettings,
      fieldCoordinates: { x: 50, y: 50 },
      callbacks,
    });

    expect(items.some((i) => i.label === "Transform Path")).toBe(true);
    const transformItem = items.find((i) => i.label === "Transform Path");
    transformItem?.onClick?.();
    expect(callbacks.openTransformDialog).toHaveBeenCalled();
    expect(callbacks.closeContextMenu).toHaveBeenCalled();
  });

  it("includes registry items in empty space context menu", () => {
    const callbacks = createMockCallbacks();
    const registryOnClick = vi.fn();
    const items = buildFieldContextMenuItems({
      currentElem: null,
      multiSelectedPointIds: [],
      startPoint,
      lines,
      shapes,
      settings: defaultSettings,
      fieldCoordinates: { x: 72, y: 72 },
      registryItems: [
        {
          label: "Custom Action",
          onClick: registryOnClick,
        },
      ],
      callbacks,
    });

    const customItem = items.find((i) => i.label === "Custom Action");
    expect(customItem).toBeDefined();
    customItem?.onClick?.();
    expect(registryOnClick).toHaveBeenCalledWith({ x: 72, y: 72 });
    expect(callbacks.closeContextMenu).toHaveBeenCalled();
  });

  it("builds context menu for start point", () => {
    const callbacks = createMockCallbacks();
    const items = buildFieldContextMenuItems({
      currentElem: "point-0-0",
      multiSelectedPointIds: ["point-0-0"],
      startPoint,
      lines,
      shapes,
      settings: defaultSettings,
      fieldCoordinates: { x: 10, y: 20 },
      callbacks,
    });

    expect(items.some((i) => i.label === "Start Point")).toBe(true);
    expect(items.some((i) => i.label === "Copy Coordinates")).toBe(true);
    expect(items.some((i) => i.label === "Heading Mode")).toBe(true);
    expect(items.some((i) => i.label === "Constant")).toBe(true);

    const constantItem = items.find((i) => i.label === "Constant");
    constantItem?.onClick?.();
    expect(callbacks.updateStartPoint).toHaveBeenCalled();
    expect(callbacks.onRecordChange).toHaveBeenCalledWith("Set Start Constant");
  });

  it("builds context menu for line end point", () => {
    const callbacks = createMockCallbacks();
    const items = buildFieldContextMenuItems({
      currentElem: "point-1-0",
      multiSelectedPointIds: ["point-1-0"],
      startPoint,
      lines,
      shapes,
      settings: defaultSettings,
      fieldCoordinates: { x: 30, y: 40 },
      callbacks,
    });

    expect(items.some((i) => i.label === "Path 1")).toBe(true);
    expect(items.some((i) => i.label === "Add Wait Command")).toBe(true);
    expect(items.some((i) => i.label === "Delete Path")).toBe(true);

    const deleteItem = items.find((i) => i.label === "Delete Path");
    deleteItem?.onClick?.();
    expect(callbacks.updateLines).toHaveBeenCalled();
    expect(callbacks.onRecordChange).toHaveBeenCalledWith("Delete Path");
    expect(callbacks.setSelectedLineId).toHaveBeenCalledWith(null);
  });

  it("builds context menu for obstacle", () => {
    const callbacks = createMockCallbacks();
    const items = buildFieldContextMenuItems({
      currentElem: "obstacle-0-0",
      multiSelectedPointIds: [],
      startPoint,
      lines,
      shapes,
      settings: defaultSettings,
      fieldCoordinates: { x: 50, y: 50 },
      callbacks,
    });

    expect(items.some((i) => i.label === "Obstacle")).toBe(true);
    expect(items.some((i) => i.label === "Lock")).toBe(true);
    expect(items.some((i) => i.label === "Delete Obstacle")).toBe(true);

    const deleteObstacleItem = items.find((i) => i.label === "Delete Obstacle");
    deleteObstacleItem?.onClick?.();
    expect(callbacks.updateShapes).toHaveBeenCalled();
    expect(callbacks.onRecordChange).toHaveBeenCalledWith("Delete Obstacle");
  });

  it("builds alignment menu for multi-selected points", () => {
    const callbacks = createMockCallbacks();
    const items = buildFieldContextMenuItems({
      currentElem: "point-0-0",
      multiSelectedPointIds: ["point-0-0", "point-1-0"],
      startPoint,
      lines,
      shapes,
      settings: defaultSettings,
      fieldCoordinates: { x: 10, y: 20 },
      callbacks,
    });

    expect(items.some((i) => i.label === "Align Horizontal (Y)")).toBe(true);
  });

  it("buildContextMenuForEvent transforms coordinates and returns null if no items", () => {
    const callbacks = createMockCallbacks();
    const mockEvent = { clientX: 200, clientY: 200 } as MouseEvent;
    const mockRect = {
      left: 100,
      top: 100,
      width: 500,
      height: 500,
    } as DOMRect;

    const result = buildContextMenuForEvent({
      event: mockEvent,
      containerRect: mockRect,
      fieldRotation: 0,
      xInvert: (v: number) => v / 2,
      yInvert: (v: number) => v / 2,
      currentElem: null,
      multiSelectedPointIds: [],
      startPoint,
      lines,
      shapes,
      settings: defaultSettings,
      registryItems: [],
      callbacks,
    });

    expect(result).not.toBeNull();
    expect(result?.x).toBe(200);
    expect(result?.y).toBe(200);
    expect(result?.items.length).toBeGreaterThan(0);
  });

  it("createContextMenuStoreCallbacks wires all store actions properly", () => {
    const onRecordChange = vi.fn();
    const linesStore = { set: vi.fn(), update: vi.fn() };
    const startPointStore = { set: vi.fn(), update: vi.fn() };
    const shapesStore = { update: vi.fn() };
    const sequenceStore = { update: vi.fn() };
    const selectedLineIdStore = { set: vi.fn() };
    const showTransformDialogStore = { set: vi.fn() };
    const notificationStore = { set: vi.fn() };
    const onClose = vi.fn();

    const callbacks = createContextMenuStoreCallbacks({
      onRecordChange,
      linesStore,
      startPointStore,
      shapesStore,
      sequenceStore,
      selectedLineIdStore,
      showTransformDialogStore,
      notificationStore,
      onClose,
    });

    callbacks.setLines([]);
    expect(linesStore.set).toHaveBeenCalledWith([]);

    callbacks.openTransformDialog();
    expect(showTransformDialogStore.set).toHaveBeenCalledWith(true);

    callbacks.closeContextMenu();
    expect(onClose).toHaveBeenCalled();
  });
});
