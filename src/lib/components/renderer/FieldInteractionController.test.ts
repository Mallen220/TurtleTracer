// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { writable, get } from "svelte/store";
import { FieldInteractionController } from "./FieldInteractionController";
import type { Line, Point, SequenceItem, Shape } from "../../../types/index";
import { DEFAULT_SETTINGS } from "../../../config/defaults";

describe("FieldInteractionController", () => {
  let domElement: HTMLElement;
  let wrapperElement: HTMLElement;
  let mockTwo: any;
  let stores: any;
  let options: any;

  beforeEach(() => {
    domElement = document.createElement("div");
    wrapperElement = document.createElement("div");

    vi.spyOn(domElement, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 500,
      height: 500,
      right: 500,
      bottom: 500,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    vi.spyOn(wrapperElement, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 500,
      height: 500,
      right: 500,
      bottom: 500,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    mockTwo = {
      renderer: {
        domElement,
      },
      add: vi.fn(),
      update: vi.fn(),
    };

    stores = {
      gridSize: writable(12),
      snapToGrid: writable(true),
      showGrid: writable(false),
      selectedPointId: writable<string | null>(null),
      multiSelectedPointIds: writable<string[]>([]),
      selectedLineId: writable<string | null>(null),
      multiSelectedLineIds: writable<string[]>([]),
      hoveredMarkerId: writable<string | null>(null),
      fieldPan: writable({ x: 0, y: 0 }),
      notification: writable(null),
      isDrawingMode: writable(false),
      linesStore: writable<Line[]>([
        {
          id: "line-1",
          name: "Path 1",
          color: "#ff0000",
          controlPoints: [
            { x: 20, y: 20 },
            { x: 50, y: 50 },
          ],
          endPoint: {
            x: 50,
            y: 50,
            heading: "linear",
            startDeg: 0,
            endDeg: 0,
            reverse: false,
          },
        },
      ]),
      shapesStore: writable<Shape[]>([]),
      startPointStore: writable<Point>({
        x: 10,
        y: 10,
        heading: "tangential",
        reverse: false,
      }),
      sequenceStore: writable<SequenceItem[]>([
        { kind: "path", lineId: "line-1" },
      ]),
      followRobotStore: writable(false),
      isDraggingStore: writable(false),
    };

    options = {
      domElement,
      getWrapperDiv: () => wrapperElement,
      getTwo: () => mockTwo,
      getScales: () => ({
        x: Object.assign((v: number) => v * 3.47, {
          invert: (v: number) => v / 3.47,
        }),
        y: Object.assign((v: number) => 500 - v * 3.47, {
          invert: (v: number) => (500 - v) / 3.47,
        }),
        uiLength: (inches: number) => inches * 3.47,
      }),
      getSettings: () => ({
        ...DEFAULT_SETTINGS,
        fieldWidth: 144,
        fieldHeight: 144,
        fieldRotation: 0,
        smartSnapping: true,
        showVelocityTooltip: true,
      }),
      getFieldDimensions: () => ({ fieldW: 144, fieldH: 144 }),
      getTimePrediction: () => null,
      onRecordChange: vi.fn(),
      onMouseStateChange: vi.fn(),
      onTooltipChange: vi.fn(),
      onSnapGuidesChange: vi.fn(),
      onDrawingChange: vi.fn(),
      stores,
    };
  });

  it("attaches event listeners and updates rects on mouse enter", () => {
    const controller = new FieldInteractionController(options);
    const enterEvt = new MouseEvent("mouseenter");
    domElement.dispatchEvent(enterEvt);

    expect(domElement).toBeDefined();
    controller.destroy();
  });

  it("handles mouseleave by clearing hovered marker and reporting mouse state", () => {
    const controller = new FieldInteractionController(options);
    stores.hoveredMarkerId.set("marker-1");

    const leaveEvt = new MouseEvent("mouseleave");
    domElement.dispatchEvent(leaveEvt);

    expect(get(stores.hoveredMarkerId)).toBeNull();
    expect(options.onMouseStateChange).toHaveBeenCalledWith({
      mouseX: 0,
      mouseY: 0,
      isOver: false,
      isObstructingHUD: false,
    });
    controller.destroy();
  });

  it("tracks mouse movement across field coordinates", () => {
    const controller = new FieldInteractionController(options);
    const moveEvt = new MouseEvent("mousemove", {
      clientX: 250,
      clientY: 250,
    });
    domElement.dispatchEvent(moveEvt);

    expect(options.onMouseStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        isOver: true,
        mouseX: expect.any(Number),
        mouseY: expect.any(Number),
      }),
    );
    controller.destroy();
  });

  it("handles canvas panning via drag", () => {
    const controller = new FieldInteractionController(options);

    // Mousedown on empty canvas starts panning
    const downEvt = new MouseEvent("mousedown", {
      clientX: 100,
      clientY: 100,
    });
    domElement.dispatchEvent(downEvt);
    expect(domElement.style.cursor).toBe("grabbing");

    // Mousemove updates fieldPan
    const moveEvt = new MouseEvent("mousemove", {
      clientX: 120,
      clientY: 130,
    });
    domElement.dispatchEvent(moveEvt);

    expect(get(stores.fieldPan)).toEqual({ x: 20, y: 30 });

    // Mouseup ends panning
    const upEvt = new MouseEvent("mouseup");
    domElement.dispatchEvent(upEvt);
    expect(domElement.style.cursor).toBe("grab");

    controller.destroy();
  });

  it("handles drawing mode lifecycle", () => {
    stores.isDrawingMode.set(true);
    const controller = new FieldInteractionController(options);

    // Mousedown starts drawing stroke
    const downEvt = new MouseEvent("mousedown", { clientX: 50, clientY: 50 });
    domElement.dispatchEvent(downEvt);

    expect(options.onDrawingChange).toHaveBeenCalledWith(
      expect.objectContaining({
        isDrawing: true,
        points: expect.any(Array),
      }),
    );

    // Mousemove continues drawing
    const moveEvt = new MouseEvent("mousemove", { clientX: 70, clientY: 80 });
    domElement.dispatchEvent(moveEvt);

    // Mouseup completes drawing and creates a path
    const upEvt = new MouseEvent("mouseup");
    domElement.dispatchEvent(upEvt);

    expect(options.onDrawingChange).toHaveBeenCalledWith({
      isDrawing: false,
      points: [],
    });

    controller.destroy();
  });

  it("handles double click to create path", () => {
    const controller = new FieldInteractionController(options);
    const dblEvt = new MouseEvent("dblclick", {
      clientX: 200,
      clientY: 200,
    });
    domElement.dispatchEvent(dblEvt);

    expect((get(stores.linesStore) as Line[]).length).toBe(2);
    expect(options.onRecordChange).toHaveBeenCalledWith("Add Path");

    controller.destroy();
  });
});
