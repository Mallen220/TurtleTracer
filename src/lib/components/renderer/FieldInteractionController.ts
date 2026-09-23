// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type Two from "two.js";
import { get, type Writable } from "svelte/store";
import type {
  Line,
  Point,
  SequenceItem,
  Settings,
  Shape,
} from "../../../types/index";
import {
  gridSize as defaultGridSize,
  snapToGrid as defaultSnapToGrid,
  showGrid as defaultShowGrid,
  selectedPointId as defaultSelectedPointId,
  multiSelectedPointIds as defaultMultiSelectedPointIds,
  selectedLineId as defaultSelectedLineId,
  multiSelectedLineIds as defaultMultiSelectedLineIds,
  hoveredMarkerId as defaultHoveredMarkerId,
  fieldPan as defaultFieldPan,
  notification as defaultNotification,
  isDrawingMode as defaultIsDrawingMode,
} from "../../../stores";
import {
  linesStore as defaultLinesStore,
  shapesStore as defaultShapesStore,
  startPointStore as defaultStartPointStore,
  sequenceStore as defaultSequenceStore,
  followRobotStore as defaultFollowRobotStore,
  isDraggingStore as defaultIsDraggingStore,
} from "../../projectStore";
import { getTransformedCoordinates } from "./CoordinateTransform";
import { calculateVelocityTooltip } from "./VelocityTooltipCalculator";
import {
  continueDrawing,
  initDrawingPoints,
  completeDrawingStroke,
} from "./FieldDrawingHandler";
import {
  findPointsInBox,
  calculateBoxBounds,
  calculateBoxPixelDimensions,
  createBoxSelectionShape,
  applyBoxSelections,
} from "./BoxSelection";
import {
  computeMultiDragOffsets,
  executeMultiDragIteration,
  resolveHoverCursor,
  createSnapGuides,
  applyDragIterationUpdates,
  calculateRotatedPan,
} from "./FieldDragHandler";
import {
  detectClickedElement,
  resolveSelectionOnDown,
  inferDragAction,
  isObstacleLocked,
  clearFieldSelections,
  applySelectionState,
} from "./FieldSelection";
import { tryCreatePathFromDoubleClick } from "./FieldPathCreator";

export interface InteractionStores {
  gridSize?: Writable<number>;
  snapToGrid?: Writable<boolean>;
  showGrid?: Writable<boolean>;
  selectedPointId?: Writable<string | null>;
  multiSelectedPointIds?: Writable<string[]>;
  selectedLineId?: Writable<string | null>;
  multiSelectedLineIds?: Writable<string[]>;
  hoveredMarkerId?: Writable<string | null>;
  fieldPan?: Writable<{ x: number; y: number }>;
  notification?: Writable<any>;
  isDrawingMode?: Writable<boolean>;
  linesStore?: Writable<Line[]>;
  shapesStore?: Writable<Shape[]>;
  startPointStore?: Writable<Point>;
  sequenceStore?: Writable<SequenceItem[]>;
  followRobotStore?: Writable<boolean>;
  isDraggingStore?: Writable<boolean>;
}

export interface FieldInteractionControllerOptions {
  domElement: HTMLElement;
  getWrapperDiv: () => HTMLElement | undefined;
  getTwo: () => Two | undefined;
  getScales: () => {
    x: { (v: number): number; invert: (v: number) => number };
    y: { (v: number): number; invert: (v: number) => number };
    uiLength: (inches: number) => number;
  };
  getSettings: () => Settings;
  getFieldDimensions: () => { fieldW: number; fieldH: number };
  getTimePrediction: () => any;
  onRecordChange: (action?: string) => void;
  onMouseStateChange?: (state: {
    mouseX: number;
    mouseY: number;
    isOver: boolean;
    isObstructingHUD: boolean;
  }) => void;
  onTooltipChange?: (tooltip: {
    visible: boolean;
    x: number;
    y: number;
    velocity: number;
    time: number;
    distance: number;
  }) => void;
  onSnapGuidesChange?: (guides: InstanceType<typeof Two.Line>[]) => void;
  onDrawingChange?: (drawing: {
    isDrawing: boolean;
    points: { x: number; y: number }[];
  }) => void;
  stores?: InteractionStores;
}

export class FieldInteractionController {
  private domElement: HTMLElement;
  private options: FieldInteractionControllerOptions;

  // Stores
  private gridSize: Writable<number>;
  private snapToGrid: Writable<boolean>;
  private showGrid: Writable<boolean>;
  private selectedPointId: Writable<string | null>;
  private multiSelectedPointIds: Writable<string[]>;
  private selectedLineId: Writable<string | null>;
  private multiSelectedLineIds: Writable<string[]>;
  private hoveredMarkerId: Writable<string | null>;
  private fieldPan: Writable<{ x: number; y: number }>;
  private notification: Writable<any>;
  private isDrawingMode: Writable<boolean>;
  private linesStore: Writable<Line[]>;
  private shapesStore: Writable<Shape[]>;
  private startPointStore: Writable<Point>;
  private sequenceStore: Writable<SequenceItem[]>;
  private followRobotStore: Writable<boolean>;
  private isDraggingStore: Writable<boolean>;

  // Interaction State
  private cachedRect: DOMRect | null = null;
  private cachedWrapperRect: DOMRect | null = null;
  private currentElem: string | null = null;
  private isDown = false;
  private isPanning = false;
  private isDrawing = false;
  private drawPoints: { x: number; y: number }[] = [];
  private isBoxSelecting = false;
  private boxSelectStart: { x: number; y: number } | null = null;
  private boxSelectCurrent: { x: number; y: number } | null = null;
  private boxSelectElement: InstanceType<typeof Two.Rectangle> | null = null;
  private multiDragOffsets = new Map<string, { x: number; y: number }>();
  private startPan = { x: 0, y: 0 };

  // Bound Event Listeners
  private onMouseEnter: () => void;
  private onMouseLeave: () => void;
  private onMouseMove: (evt: MouseEvent) => void;
  private onMouseDown: (evt: MouseEvent) => void;
  private onMouseUp: () => void;
  private onDoubleClick: (evt: MouseEvent) => void;
  private boundUpdateRects: () => void;

  constructor(options: FieldInteractionControllerOptions) {
    this.options = options;
    this.domElement = options.domElement;

    const s = options.stores || {};
    this.gridSize = s.gridSize || defaultGridSize;
    this.snapToGrid = s.snapToGrid || defaultSnapToGrid;
    this.showGrid = s.showGrid || defaultShowGrid;
    this.selectedPointId = s.selectedPointId || defaultSelectedPointId;
    this.multiSelectedPointIds =
      s.multiSelectedPointIds || defaultMultiSelectedPointIds;
    this.selectedLineId = s.selectedLineId || defaultSelectedLineId;
    this.multiSelectedLineIds =
      s.multiSelectedLineIds || defaultMultiSelectedLineIds;
    this.hoveredMarkerId = s.hoveredMarkerId || defaultHoveredMarkerId;
    this.fieldPan = s.fieldPan || defaultFieldPan;
    this.notification = s.notification || defaultNotification;
    this.isDrawingMode = s.isDrawingMode || defaultIsDrawingMode;
    this.linesStore = s.linesStore || defaultLinesStore;
    this.shapesStore = s.shapesStore || defaultShapesStore;
    this.startPointStore = s.startPointStore || defaultStartPointStore;
    this.sequenceStore = s.sequenceStore || defaultSequenceStore;
    this.followRobotStore = s.followRobotStore || defaultFollowRobotStore;
    this.isDraggingStore = s.isDraggingStore || defaultIsDraggingStore;

    this.boundUpdateRects = this.updateRects.bind(this);
    this.onMouseEnter = this.handleMouseEnter.bind(this);
    this.onMouseLeave = this.handleMouseLeave.bind(this);
    this.onMouseMove = this.handleMouseMove.bind(this);
    this.onMouseDown = this.handleMouseDown.bind(this);
    this.onMouseUp = this.handleMouseUp.bind(this);
    this.onDoubleClick = this.handleDoubleClick.bind(this);

    this.attach();
  }

  public getCurrentElem(): string | null {
    return this.currentElem;
  }

  public updateRects(): void {
    const two = this.options.getTwo();
    if (two?.renderer?.domElement) {
      this.cachedRect = two.renderer.domElement.getBoundingClientRect();
    }
    const wrapper = this.options.getWrapperDiv();
    if (wrapper) {
      this.cachedWrapperRect = wrapper.getBoundingClientRect();
    }
  }

  private attach(): void {
    this.domElement.addEventListener("mouseenter", this.onMouseEnter);
    this.domElement.addEventListener("mouseleave", this.onMouseLeave);
    this.domElement.addEventListener("mousemove", this.onMouseMove);
    this.domElement.addEventListener("mousedown", this.onMouseDown);
    this.domElement.addEventListener("mouseup", this.onMouseUp);
    this.domElement.addEventListener("dblclick", this.onDoubleClick);
  }

  public destroy(): void {
    this.domElement.removeEventListener("mouseenter", this.onMouseEnter);
    this.domElement.removeEventListener("mouseleave", this.onMouseLeave);
    this.domElement.removeEventListener("mousemove", this.onMouseMove);
    this.domElement.removeEventListener("mousedown", this.onMouseDown);
    this.domElement.removeEventListener("mouseup", this.onMouseUp);
    this.domElement.removeEventListener("dblclick", this.onDoubleClick);

    if (typeof globalThis.window !== "undefined") {
      globalThis.window.removeEventListener("resize", this.boundUpdateRects);
      globalThis.window.removeEventListener(
        "scroll",
        this.boundUpdateRects,
        true,
      );
    }

    if (this.boxSelectElement) {
      this.boxSelectElement.remove();
      this.boxSelectElement = null;
    }
  }

  private handleMouseEnter(): void {
    this.updateRects();
    if (typeof globalThis.window !== "undefined") {
      globalThis.window.addEventListener("resize", this.boundUpdateRects);
      globalThis.window.addEventListener("scroll", this.boundUpdateRects, true);
    }
  }

  private handleMouseLeave(): void {
    this.hoveredMarkerId.set(null);
    if (typeof globalThis.window !== "undefined") {
      globalThis.window.removeEventListener("resize", this.boundUpdateRects);
      globalThis.window.removeEventListener(
        "scroll",
        this.boundUpdateRects,
        true,
      );
    }
    this.options.onMouseStateChange?.({
      mouseX: 0,
      mouseY: 0,
      isOver: false,
      isObstructingHUD: false,
    });
  }

  private handleMouseMove(evt: MouseEvent): void {
    const two = this.options.getTwo();
    if (!two?.renderer?.domElement) return;

    const rect =
      this.cachedRect || two.renderer.domElement.getBoundingClientRect();
    const settings = this.options.getSettings();
    const { fieldW, fieldH } = this.options.getFieldDimensions();
    const { x, y, uiLength } = this.options.getScales();

    const transformed = getTransformedCoordinates(
      evt.clientX,
      evt.clientY,
      rect,
      settings.fieldRotation || 0,
    );
    const xPos = transformed.x;
    const yPos = transformed.y;
    const rawInchXForDisplay = x.invert(xPos);
    const rawInchYForDisplay = y.invert(yPos);

    const mouseX = Math.max(0, Math.min(fieldW, rawInchXForDisplay));
    const mouseY = Math.max(0, Math.min(fieldH, rawInchYForDisplay));

    // Check HUD obstruction
    let isObstructingHUD = false;
    const wrapperDiv = this.options.getWrapperDiv();
    if (wrapperDiv) {
      const wrapperRect =
        this.cachedWrapperRect || wrapperDiv.getBoundingClientRect();
      const visualX = evt.clientX - wrapperRect.left;
      const visualY = evt.clientY - wrapperRect.top;
      const w = wrapperRect.width;
      const h = wrapperRect.height;
      isObstructingHUD = visualX < w * 0.35 && visualY > h * 0.8;
    }

    this.options.onMouseStateChange?.({
      mouseX,
      mouseY,
      isOver: true,
      isObstructingHUD,
    });

    const effectiveTimePrediction = this.options.getTimePrediction();
    const isDrawingModeActive = get(this.isDrawingMode);
    const lines = get(this.linesStore);
    const startPoint = get(this.startPointStore);

    // Velocity Tooltip
    if (
      settings.showVelocityTooltip &&
      effectiveTimePrediction?.timeline &&
      !this.isDown &&
      !isDrawingModeActive &&
      !this.isPanning &&
      !this.isBoxSelecting
    ) {
      const res = calculateVelocityTooltip({
        rawInchX: rawInchXForDisplay,
        rawInchY: rawInchYForDisplay,
        lines,
        startPoint,
        timeline: effectiveTimePrediction.timeline,
        clientX: evt.clientX,
        clientY: evt.clientY,
      });

      if (res.visible) {
        this.options.onTooltipChange?.({
          visible: true,
          x: res.x!,
          y: res.y!,
          velocity: res.velocity!,
          time: res.time!,
          distance: res.distance!,
        });
      } else {
        this.options.onTooltipChange?.({
          visible: false,
          x: 0,
          y: 0,
          velocity: 0,
          time: 0,
          distance: 0,
        });
      }
    } else {
      this.options.onTooltipChange?.({
        visible: false,
        x: 0,
        y: 0,
        velocity: 0,
        time: 0,
        distance: 0,
      });
    }

    // Drawing mode continuation
    if (isDrawingModeActive && this.isDrawing) {
      continueDrawing(this.drawPoints, mouseX, mouseY, {
        snapToGrid: get(this.snapToGrid),
        showGrid: get(this.showGrid),
        gridSize: get(this.gridSize),
      });
      this.options.onDrawingChange?.({
        isDrawing: this.isDrawing,
        points: this.drawPoints,
      });
      return;
    }

    // Box selection update
    if (this.isBoxSelecting && this.boxSelectStart && this.boxSelectElement) {
      this.boxSelectCurrent = { x: rawInchXForDisplay, y: rawInchYForDisplay };
      const bounds = calculateBoxBounds(
        this.boxSelectStart,
        this.boxSelectCurrent,
      );
      const dims = calculateBoxPixelDimensions(bounds, x, y);

      this.boxSelectElement.translation.set(dims.centerX, dims.centerY);
      (this.boxSelectElement as any).width = dims.width;
      (this.boxSelectElement as any).height = dims.height;

      two.update();
      return;
    }

    // Dragging Logic
    if (this.isDown && this.currentElem) {
      const shapes = get(this.shapesStore);
      const sequence = get(this.sequenceStore);

      const dragIter = executeMultiDragIteration({
        multiSelectedPointIds: get(this.multiSelectedPointIds),
        multiDragOffsets: this.multiDragOffsets,
        xPos,
        yPos,
        xInvert: x.invert,
        yInvert: y.invert,
        snapToGrid: get(this.snapToGrid),
        showGrid: get(this.showGrid),
        gridSize: get(this.gridSize),
        smartSnappingEnabled: settings.smartSnapping !== false,
        isAltKey: evt.altKey,
        lines,
        shapes,
        startPoint,
        sequence,
        timePrediction: effectiveTimePrediction,
        currentElem: this.currentElem,
        fieldW,
        fieldH,
        settings,
      });

      const updates = applyDragIterationUpdates({
        dragIter,
        currentElem: this.currentElem,
        multiDragOffsets: this.multiDragOffsets,
        stores: {
          lines: this.linesStore,
          shapes: this.shapesStore,
          startPoint: this.startPointStore,
          sequence: this.sequenceStore,
          multiSelectedPointIds: this.multiSelectedPointIds,
        },
      });
      this.currentElem = updates.currentElem;

      const guides = createSnapGuides(
        dragIter.guides,
        x,
        y,
        fieldW,
        fieldH,
        uiLength,
      );
      this.options.onSnapGuidesChange?.(guides);
      return;
    }

    // Panning Logic
    if (this.isPanning) {
      this.followRobotStore.set(false);
      const { rdx, rdy } = calculateRotatedPan(
        evt.clientX,
        evt.clientY,
        this.startPan,
        settings.fieldRotation || 0,
      );
      this.fieldPan.update((p) => ({
        x: p.x + rdx,
        y: p.y + rdy,
      }));
      this.startPan = { x: evt.clientX, y: evt.clientY };
      this.domElement.style.cursor = "grabbing";
      return;
    }

    // Cursor Update
    const target = evt.target as Element;
    const sequence = get(this.sequenceStore);
    const hover = resolveHoverCursor(target?.id, lines, sequence);
    this.domElement.style.cursor = hover.cursor;
    this.currentElem = hover.currentElem;
    this.hoveredMarkerId.set(hover.hoveredMarkerId);
  }

  private handleMouseDown(evt: MouseEvent): void {
    this.updateRects();
    const two = this.options.getTwo();
    if (!two?.renderer?.domElement) return;

    const settings = this.options.getSettings();
    const { x, y } = this.options.getScales();
    const isDrawingModeActive = get(this.isDrawingMode);

    if (isDrawingModeActive) {
      this.isDrawing = true;
      const rectForMouse = two.renderer.domElement.getBoundingClientRect();
      const transformedForMouse = getTransformedCoordinates(
        evt.clientX,
        evt.clientY,
        rectForMouse,
        settings.fieldRotation || 0,
      );
      this.drawPoints = initDrawingPoints(
        x.invert(transformedForMouse.x),
        y.invert(transformedForMouse.y),
        {
          snapToGrid: get(this.snapToGrid),
          showGrid: get(this.showGrid),
          gridSize: get(this.gridSize),
        },
      );
      this.options.onDrawingChange?.({
        isDrawing: this.isDrawing,
        points: this.drawPoints,
      });
      return;
    }

    const clickedElem = detectClickedElement(evt.target);

    if (!clickedElem) {
      if (evt.shiftKey) {
        // Start Box Selection
        this.isBoxSelecting = true;
        const rectForMouse = two.renderer.domElement.getBoundingClientRect();
        const transformedForMouse = getTransformedCoordinates(
          evt.clientX,
          evt.clientY,
          rectForMouse,
          settings.fieldRotation || 0,
        );
        const inchX = x.invert(transformedForMouse.x);
        const inchY = y.invert(transformedForMouse.y);

        this.boxSelectStart = { x: inchX, y: inchY };
        this.boxSelectCurrent = { x: inchX, y: inchY };

        if (this.boxSelectElement) this.boxSelectElement.remove();

        this.boxSelectElement = createBoxSelectionShape(
          this.boxSelectStart,
          x,
          y,
        );
        two.add(this.boxSelectElement);
        two.update();
        return;
      } else if (!evt.ctrlKey && !evt.metaKey) {
        clearFieldSelections({
          selectedPointId: this.selectedPointId,
          selectedLineId: this.selectedLineId,
          multiSelectedPointIds: this.multiSelectedPointIds,
          multiSelectedLineIds: this.multiSelectedLineIds,
        });
      }
    }

    if (clickedElem) {
      this.isDown = true;
      this.isDraggingStore.set(true);
      this.currentElem = clickedElem;

      const lines = get(this.linesStore);
      const isModifierKey = Boolean(evt.shiftKey || evt.ctrlKey || evt.metaKey);
      const nextSelection = resolveSelectionOnDown({
        clickedElem,
        lines,
        currentPointIds: get(this.multiSelectedPointIds),
        currentLineIds: get(this.multiSelectedLineIds),
        currentSelectedPointId: get(this.selectedPointId),
        currentSelectedLineId: get(this.selectedLineId),
        isModifierKey,
      });

      applySelectionState(nextSelection, {
        selectedPointId: this.selectedPointId,
        selectedLineId: this.selectedLineId,
        multiSelectedPointIds: this.multiSelectedPointIds,
        multiSelectedLineIds: this.multiSelectedLineIds,
      });

      const shapes = get(this.shapesStore);
      if (isObstacleLocked(this.currentElem, shapes)) {
        this.isDown = false;
        this.isDraggingStore.set(false);
        this.currentElem = null;
        return;
      }

      const rectForMouse = two.renderer.domElement.getBoundingClientRect();
      const transformedForMouse = getTransformedCoordinates(
        evt.clientX,
        evt.clientY,
        rectForMouse,
        settings.fieldRotation || 0,
      );
      const mouseX = x.invert(transformedForMouse.x);
      const mouseY = y.invert(transformedForMouse.y);
      const startPoint = get(this.startPointStore);
      const sequence = get(this.sequenceStore);

      this.multiDragOffsets = computeMultiDragOffsets(
        get(this.multiSelectedPointIds),
        mouseX,
        mouseY,
        { lines, shapes, startPoint, sequence },
      );
    } else if (!settings.lockFieldView) {
      this.isPanning = true;
      this.startPan = { x: evt.clientX, y: evt.clientY };
      this.domElement.style.cursor = "grabbing";
    }
  }

  private handleMouseUp(): void {
    this.options.onSnapGuidesChange?.([]);
    const two = this.options.getTwo();

    if (this.isBoxSelecting) {
      this.isBoxSelecting = false;
      if (this.boxSelectElement) {
        this.boxSelectElement.remove();
        this.boxSelectElement = null;
        two?.update();
      }

      if (this.boxSelectStart && this.boxSelectCurrent) {
        const bounds = calculateBoxBounds(
          this.boxSelectStart,
          this.boxSelectCurrent,
        );
        if (bounds.hasArea) {
          const startPoint = get(this.startPointStore);
          const lines = get(this.linesStore);
          const shapes = get(this.shapesStore);
          const newSelections = findPointsInBox(
            startPoint,
            lines,
            shapes,
            bounds.minX,
            bounds.maxX,
            bounds.minY,
            bounds.maxY,
          );
          applyBoxSelections({
            newSelections,
            lines,
            multiSelectedPointIds: this.multiSelectedPointIds,
            selectedLineId: this.selectedLineId,
            notification: this.notification,
          });
        }
      }
      this.boxSelectStart = null;
      this.boxSelectCurrent = null;
      return;
    }

    if (get(this.isDrawingMode) && this.isDrawing) {
      this.isDrawing = false;
      const startPoint = get(this.startPointStore);
      const lines = get(this.linesStore);
      const sequence = get(this.sequenceStore);
      const settings = this.options.getSettings();

      const result = completeDrawingStroke(
        this.drawPoints,
        startPoint,
        lines,
        sequence,
        settings,
      );
      if (result) {
        this.startPointStore.set(result.startPoint);
        this.linesStore.set(result.lines);
        this.sequenceStore.set(result.sequence);
        this.options.onRecordChange("Draw Path");
      }
      this.drawPoints = [];
      this.options.onDrawingChange?.({
        isDrawing: false,
        points: [],
      });
      return;
    }

    if (this.isDown) {
      const action = inferDragAction(this.currentElem);
      this.options.onRecordChange(action);
    }

    this.isDown = false;
    this.isDraggingStore.set(false);
    this.isPanning = false;
    this.multiDragOffsets.clear();
    this.domElement.style.cursor = "grab";
  }

  private handleDoubleClick(evt: MouseEvent): void {
    const two = this.options.getTwo();
    if (!two?.renderer?.domElement) return;

    const settings = this.options.getSettings();
    const { fieldW, fieldH } = this.options.getFieldDimensions();
    const { x, y } = this.options.getScales();

    const newLine = tryCreatePathFromDoubleClick({
      targetId: (evt.target as Element)?.id,
      clientX: evt.clientX,
      clientY: evt.clientY,
      domRect: two.renderer.domElement.getBoundingClientRect(),
      fieldRotation: settings.fieldRotation || 0,
      xInvert: x.invert,
      yInvert: y.invert,
      snapToGrid: get(this.snapToGrid),
      showGrid: get(this.showGrid),
      gridSize: get(this.gridSize),
      restrictDraggingToField: settings.restrictDraggingToField !== false,
      fieldW,
      fieldH,
      existingLines: get(this.linesStore),
    });

    if (!newLine) return;

    this.linesStore.update((l) => [...l, newLine]);
    this.sequenceStore.update((s) => [
      ...s,
      { kind: "path", lineId: newLine.id! },
    ]);

    this.selectedLineId.set(newLine.id!);
    const newIdx = get(this.linesStore).length - 1;
    this.selectedPointId.set(`point-${newIdx + 1}-0`);

    this.options.onRecordChange("Add Path");
  }
}
