// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
// Exported type definitions for use in Svelte and TS modules

export interface BasePoint {
  x: number;
  y: number;
  locked?: boolean;
  isMacroElement?: boolean;
  macroId?: string;
  originalId?: string;
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
  // For path-based markers, the index of the line in `lines`
  lineIndex?: number;
  // For wait-based markers, the id of the wait in `sequence`
  waitId?: string;
  // For rotate-based markers, the id of the rotate in `sequence`
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
  startPoint?: Point; // Optional start point for synthetic lines (bridge)
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
  _linkedName?: string; // Metadata for linked names
  isMacroElement?: boolean;
  macroId?: string;
  originalId?: string;
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
  _linkedName?: string; // Metadata for linked names
};

export type SequenceRotateItem = {
  kind: "rotate";
  id: string;
  name: string;
  degrees: number;
  locked?: boolean;
  eventMarkers?: EventMarker[];
  _linkedName?: string; // Metadata for linked names
};

export type SequenceMacroItem = {
  kind: "macro";
  id: string; // Unique instance ID
  filePath: string; // The macro file path
  name: string;
  locked?: boolean;
  eventMarkers?: EventMarker[]; // Maybe macros can have markers too?
  sequence?: SequenceItem[]; // The expanded sequence for this macro instance
};

export type SequenceItem =
  | SequencePathItem
  | SequenceWaitItem
  | SequenceRotateItem
  | SequenceMacroItem;

export interface KeyBinding {
  id: string;
  key: string;
  description: string;
  action: string; // Identifier for the action
  category?: string;
}

export interface CustomFieldConfig {
  id: string;
  name: string;
  imageData: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Settings {
  xVelocity: number;
  yVelocity: number;
  aVelocity: number;
  kFriction: number;
  rLength: number;
  rWidth: number;
  safetyMargin: number;
  maxVelocity: number; // inches/sec
  maxAcceleration: number; // inches/sec²
  maxDeceleration?: number; // inches/sec²
  maxAngularAcceleration?: number; // rad/sec²
  fieldMap: string;
  fieldRotation?: number; // 0, 90, 180, 270
  robotImage?: string;
  javaPackageName?: string;
  theme: "light" | "dark" | "auto" | string;
  autosaveMode?: "time" | "change" | "close" | "never";
  autosaveInterval?: number; // minutes
  showVelocityHeatmap?: boolean; // Show velocity heatmap overlay
  showOnionLayers?: boolean; // Show robot body at intervals along the path
  onionSkinCurrentPathOnly?: boolean; // Show onion layers only on the current path
  onionLayerSpacing?: number; // Distance in inches between onion layers
  optimizationIterations?: number; // Number of optimization generations
  optimizationPopulationSize?: number; // Population size for optimizer
  optimizationMutationRate?: number; // Mutation rate for optimizer
  optimizationMutationStrength?: number; // Mutation strength for optimizer
  validateFieldBoundaries?: boolean; // Check if robot goes out of bounds
  continuousValidation?: boolean; // Run validation continuously
  restrictDraggingToField?: boolean; // Restrict dragging to field bounds
  customMaps?: CustomFieldConfig[];
  keyBindings?: KeyBinding[];
  recentFiles?: string[];
  fileManagerSortMode?: "name" | "date"; // File manager sort preference
  lastSeenVersion?: string; // Version of the app the user last saw (for What's New dialog)
  hasSeenOnboarding?: boolean; // Whether the user has seen the onboarding tutorial
  gitIntegration?: boolean; // Enable/Disable Git integration
  obstaclePresets?: ObstaclePreset[]; // User-saved obstacle presets
}

export interface RobotProfile {
  id: string;
  name: string;
  rLength: number;
  rWidth: number;
  maxVelocity: number;
  maxAcceleration: number;
  maxDeceleration: number;
  kFriction: number;
  aVelocity: number; // angular velocity
  xVelocity: number;
  yVelocity: number;
  robotImage?: string;
}

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


export interface ObstaclePreset {
  id: string;
  name: string;
  shapes: Shape[];
}

export type TimelineEventType = "travel" | "wait" | "macro";

export interface TimelineEvent {
  type: TimelineEventType;
  duration: number;
  startTime: number;
  endTime: number;
  name?: string;
  waitPosition?: "before" | "after";
  lineIndex?: number; // for travel
  line?: Line; // The line object itself (useful for macros)
  prevPoint?: Point; // The point before this line
  // If this wait came from a sequence wait item, reference it here
  waitId?: string;
  startHeading?: number;
  targetHeading?: number;
  atPoint?: BasePoint;
  // Detailed motion profile for travel events: maps step index to cumulative time
  motionProfile?: number[];
  // Detailed velocity profile for travel events: maps step index to velocity
  velocityProfile?: number[];
  // Detailed heading profile for travel events: maps step index to unwrapped heading
  headingProfile?: number[];
}

export interface TimePrediction {
  totalTime: number;
  segmentTimes: number[];
  totalDistance: number;
  timeline: TimelineEvent[];
}

export interface DirectorySettings {
  autoPathsDirectory: string;
}

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  modified: Date;
  error?: string;
  gitStatus?: "modified" | "staged" | "untracked" | "ignored" | "clean";
}

export interface CollisionMarker {
  x: number;
  y: number;
  time: number;
  segmentIndex?: number;
  type?: "obstacle" | "boundary" | "zero-length" | "keep-in";
  // Range properties
  endTime?: number;
  endX?: number;
  endY?: number;
  segmentEndIndex?: number;
}

export interface Notification {
  message: string;
  type: "success" | "warning" | "error" | "info";
  timeout?: number; // milliseconds
  // Optional action button (e.g. Undo)
  actionLabel?: string;
  action?: () => void;
}

// ------------------------------------------------------------------
// Plugin System Interfaces
// ------------------------------------------------------------------

export interface PedroData {
  startPoint: Point;
  lines: Line[];
  shapes: Shape[];
  sequence: SequenceItem[];
  extraData?: Record<string, any>;
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
  icon: string; // SVG string
  title?: string;
  onClick: () => void;
  location?: "left" | "right" | "center"; // Where to place it (default right)
  order?: number;
}

export type HookCallback = (...args: any[]) => void | Promise<void>;

export interface HookRegistry {
  register: (hookName: string, callback: HookCallback) => void;
  run: (hookName: string, ...args: any[]) => Promise<void>;
  clear: () => void;
}

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string; // SVG string
  onClick: (args: { x: number; y: number }) => void;
  condition?: (args: { x: number; y: number }) => boolean;
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
  extraDataStore: Writable<Record<string, any>>;
}

export type ScaleFunction = ((val: number) => number) & {
  invert?: (val: number) => number;
};

export interface FieldView {
  xScale: ScaleFunction;
  yScale: ScaleFunction;
  width: number;
  height: number;
}

export interface AppStore {
  fieldViewStore: Writable<FieldView>;
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
    contextMenuItems: Registry<ContextMenuItem>;
  };

  /**
   * Access internal Svelte stores.
   */
  stores: {
    project: ProjectStore;
    app: AppStore;
    get: (store: Writable<any>) => any;
  };
}
