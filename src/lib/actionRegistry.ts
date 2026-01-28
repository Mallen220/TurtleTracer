// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { writable, get } from "svelte/store";
import type { SequenceItem, TimelineEvent, Point, Line } from "../types";

export interface FieldRenderContext {
  x: (val: number) => number;
  y: (val: number) => number;
  uiLength: (inches: number) => number;
  settings: any;
  // Determine hover/select state inside the renderer based on item ID, or pass global state?
  // Ideally, the renderer logic checks if this item is hovered.
  // We can pass the hovered ID and selected ID.
  hoveredId: string | null;
  selectedId: string | null;
  selectedPointId: string | null;

  timePrediction?: any;
}

export interface CodeExportContext {
  stateStep?: number; // For state machine generation
  indent?: string;
  variableName?: string;
  isNextFTC?: boolean; // For sequential generation target
  targetLibrary?: "SolversLib" | "NextFTC";
}

export interface JavaCodeResult {
  code: string;
  stepsUsed: number;
}

export interface TimeCalculationContext {
  currentTime: number;
  currentHeading: number;
  lastPoint: Point;
  settings: any;
  lines: Line[];
}

export interface TimeCalculationResult {
  events: TimelineEvent[];
  duration: number;
  endHeading?: number; // If changed
  endPoint?: Point; // If changed
}

export interface InsertionContext {
    index: number;
    sequence: SequenceItem[];
    lines: Line[];
    startPoint: Point;
    triggerReactivity: () => void; // Call to update stores/UI
}

export interface ActionDefinition {
  kind: string;
  label: string;
  icon?: string; // SVG string
  description?: string;

  // UI Configuration
  buttonColor?: string; // e.g. "amber", "pink", "indigo"
  buttonFilledIcon?: string; // Optional filled icon for buttons

  // Type Flags
  isPath?: boolean;
  isWait?: boolean;
  isRotate?: boolean;
  isMacro?: boolean;

  /**
   * Handler for inserting a new item of this type.
   */
  onInsert?: (context: InsertionContext) => void;

  /**
   * Svelte component to render in the WaypointTable row.
   * Props passed: { item, index, isLocked, isSelected, isHovered, onUpdate, onDelete, onLock, ... }
   */
  component: any;

  /**
   * Svelte component to render in the PathTab section view.
   * Props passed: { [kind]: item, sequence, collapsed, onRemove, onInsertAfter, ... }
   */
  sectionComponent?: any;

  /**
   * Factory function to create a default instance of this action.
   */
  createDefault?: () => SequenceItem;

  /**
   * Function to render the action on the field using Two.js.
   * This is called inside a reactive block in FieldRenderer.
   * It should return an array of Two.js objects (Groups, Shapes, etc.) to be added to the scene.
   */
  renderField?: (item: SequenceItem, context: FieldRenderContext) => any[];

  /**
   * Generate Java code for the OpMode state machine approach.
   * Returns code and number of state steps used.
   */
  toJavaCode?: (
    item: SequenceItem,
    context: CodeExportContext,
  ) => JavaCodeResult;

  /**
   * Generate Java code for the SequentialCommandGroup approach.
   * Returns a string command instantiation.
   */
  toSequentialCommand?: (
    item: SequenceItem,
    context: CodeExportContext,
  ) => string;

  /**
   * Calculate timeline events and duration for this action.
   * Used for time estimation and timeline visualization.
   */
  calculateTime?: (
    item: SequenceItem,
    context: TimeCalculationContext,
  ) => TimeCalculationResult;
}

const createActionRegistry = () => {
  const { subscribe, update, set } = writable<Record<string, ActionDefinition>>(
    {},
  );

  return {
    subscribe,
    register: (action: ActionDefinition) => {
      update((state) => ({ ...state, [action.kind]: action }));
    },
    unregister: (kind: string) => {
      update((state) => {
        const newState = { ...state };
        delete newState[kind];
        return newState;
      });
    },
    get: (kind: string): ActionDefinition | undefined => {
      const state = get({ subscribe });
      return state[kind];
    },
    getAll: (): ActionDefinition[] => {
        const state = get({ subscribe });
        return Object.values(state);
    },
    reset: () => set({}),
  };
};

export const actionRegistry = createActionRegistry();
