// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.

/**
 * Type definitions for Pedro Pathing Visualizer Plugins.
 * These types are automatically available in your .ts plugins.
 */

export interface BasePoint {
  x: number;
  y: number;
  locked?: boolean;
}

export type Point = BasePoint &
  (
    | {
        heading: "linear";
        startDeg: number;
        endDeg: number;
        degrees?: never;
        reverse?: never;
      }
    | {
        heading: "constant";
        degrees: number;
        startDeg?: never;
        endDeg?: never;
        reverse?: never;
      }
    | {
        heading: "tangential";
        degrees?: never;
        startDeg?: never;
        endDeg?: never;
        reverse: boolean;
      }
  );

export type ControlPoint = BasePoint;

export interface EventMarker {
  id: string;
  name: string;
  position: number; // 0-1 within the path segment
  lineIndex?: number;
  waitId?: string;
  rotateId?: string;
  parameters?: Record<string, any>;
}

export interface WaitSegment {
  name?: string;
  durationMs: number;
  position?: "before" | "after";
}

export interface Line {
  id?: string;
  endPoint: Point;
  controlPoints: ControlPoint[];
  color: string;
  name?: string;
  eventMarkers?: EventMarker[];
  locked?: boolean;
  waitBefore?: WaitSegment;
  waitAfter?: WaitSegment;
  waitBeforeMs?: number;
  waitAfterMs?: number;
  waitBeforeName?: string;
  waitAfterName?: string;
  _linkedName?: string;
}

export type SequencePathItem = {
  kind: "path";
  lineId: string;
};

export type SequenceWaitItem = {
  kind: "wait";
  id: string;
  name: string;
  durationMs: number;
  locked?: boolean;
  eventMarkers?: EventMarker[];
  _linkedName?: string;
};

export type SequenceRotateItem = {
  kind: "rotate";
  id: string;
  name: string;
  degrees: number;
  locked?: boolean;
  eventMarkers?: EventMarker[];
  _linkedName?: string;
};

export type SequenceItem =
  | SequencePathItem
  | SequenceWaitItem
  | SequenceRotateItem;

export interface Shape {
  id: string;
  name?: string;
  vertices: BasePoint[];
  color: string;
  fillColor: string;
  locked?: boolean;
  type?: "obstacle" | "keep-in";
  visible?: boolean;
}

export interface PedroData {
  startPoint: Point;
  lines: Line[];
  shapes: Shape[];
  sequence: SequenceItem[];
}

// Registry Interfaces
export interface Registry<T> {
  subscribe: (run: (value: any) => void) => () => void;
  register: (item: T) => void;
  unregister?: (id: string) => void;
  get?: (name: string) => any;
  reset: () => void;
}

export interface ComponentRegistryState {
  [key: string]: any;
}

export interface TabDefinition {
  id: string;
  label: string;
  component: any;
  icon?: string;
  order?: number;
}

export interface NavbarAction {
  id: string;
  icon: string;
  title?: string;
  onClick: () => void;
  location?: "left" | "right" | "center";
  order?: number;
}

export type HookCallback = (...args: any[]) => void | Promise<void>;

export interface HookRegistry {
  register: (hookName: string, callback: HookCallback) => void;
  run: (hookName: string, ...args: any[]) => Promise<void>;
  clear: () => void;
}

// Writable Store Interface (simplified from Svelte)
export interface Writable<T> {
  set: (value: T) => void;
  update: (updater: (value: T) => T) => void;
  subscribe: (run: (value: T) => void) => () => void;
}

// Project Store Interface
export interface ProjectStore {
  startPointStore: Writable<Point>;
  linesStore: Writable<Line[]>;
  shapesStore: Writable<Shape[]>;
  sequenceStore: Writable<SequenceItem[]>;
  settingsStore: Writable<any>; // Using any for Settings to avoid circular or huge types for now
  // ... other stores
}

export interface PedroAPI {
  /**
   * Register a custom code exporter.
   * @param name The display name of the exporter.
   * @param handler A function that takes the current project data and returns a string (code).
   */
  registerExporter(name: string, handler: (data: PedroData) => string): void;

  /**
   * Register a custom theme.
   * @param name The name of the theme.
   * @param css The CSS string for the theme.
   */
  registerTheme(name: string, css: string): void;

  /**
   * Get the current snapshot of the project data.
   */
  getData(): PedroData;

  /**
   * Access internal registries to extend the UI.
   */
  registries: {
    components: any; // ComponentRegistry
    tabs: Registry<TabDefinition>;
    navbarActions: Registry<NavbarAction>;
    hooks: HookRegistry;
  };

  /**
   * Access internal Svelte stores.
   */
  stores: {
    project: ProjectStore;
    app: any; // App stores
    get: (store: Writable<any>) => any;
  };
}

// Global variable exposed to plugins
declare global {
  const pedro: PedroAPI;
}
