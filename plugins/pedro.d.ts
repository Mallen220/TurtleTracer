// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.

/**
 * Type definitions for Pedro Pathing Plus Visualizer Plugins.
 * These types are automatically available in your .ts plugins.
 *
 * AUTO-GENERATED - DO NOT EDIT MANUALLY
 */

// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Exported type definitions for use in Svelte and TS modules

interface BasePoint {
  x: number;
  y: number;
  locked?: boolean;
  isMacroElement?: boolean;
  macroId?: string;
  originalId?: string;
}

type Point = BasePoint &
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

type ControlPoint = BasePoint;

interface EventMarker {
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

interface WaitSegment {
  name?: string;
  durationMs: number;
  position?: "before" | "after";
}

interface Line {
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

type SequencePathItem = {
  kind: "path";
  lineId: string;
};

type SequenceWaitItem = {
  kind: "wait";
  id: string;
  name: string;
  durationMs: number;
  locked?: boolean;
  eventMarkers?: EventMarker[];
  _linkedName?: string; // Metadata for linked names
};

type SequenceRotateItem = {
  kind: "rotate";
  id: string;
  name: string;
  degrees: number;
  locked?: boolean;
  eventMarkers?: EventMarker[];
  _linkedName?: string; // Metadata for linked names
};

interface Transformation {
  type: "translate" | "rotate" | "flip";
  // Translate
  dx?: number;
  dy?: number;
  // Rotate
  degrees?: number;
  pivot?: "origin" | "center" | { x: number; y: number };
  // Flip
  axis?: "horizontal" | "vertical";
}

type SequenceMacroItem = {
  kind: "macro";
  id: string; // Unique instance ID
  filePath: string; // The macro file path
  name: string;
  locked?: boolean;
  eventMarkers?: EventMarker[]; // Maybe macros can have markers too?
  sequence?: SequenceItem[]; // The expanded sequence for this macro instance
  transformations?: Transformation[];
};

type SequenceItem =
  | SequencePathItem
  | SequenceWaitItem
  | SequenceRotateItem
  | SequenceMacroItem;

interface KeyBinding {
  id: string;
  key: string;
  description: string;
  action: string; // Identifier for the action
  category?: string;
}

interface CustomFieldConfig {
  id: string;
  name: string;
  imageData: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Settings {
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
  programFontSize?: number; // Scaling factor for the program font size (percentage)
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
  smartSnapping?: boolean; // Snap points to align with other waypoints
  customMaps?: CustomFieldConfig[];
  keyBindings?: KeyBinding[];
  recentFiles?: string[];
  fileManagerSortMode?: "name" | "date"; // File manager sort preference
  lastSeenVersion?: string; // Version of the app the user last saw (for What's New dialog)
  hasSeenOnboarding?: boolean; // Whether the user has seen the onboarding tutorial
  gitIntegration?: boolean; // Enable/Disable Git integration
  obstaclePresets?: ObstaclePreset[]; // User-saved obstacle presets
  showDebugSequence?: boolean; // Developer/debugging aids
  // Auto Export Settings
  autoExportCode?: boolean;
  autoExportPath?: string;
  autoExportPathMode?: "relative" | "absolute";
  autoExportFormat?: "java" | "sequential" | "points" | "json";
  autoExportTargetLibrary?: "SolversLib" | "NextFTC";
  autoExportFullClass?: boolean;
  telemetryImplementation?: "Standard" | "Dashboard" | "Panels" | "None";
  followRobot?: boolean;
}

interface RobotProfile {
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

interface Shape {
  id: string;
  name?: string;
  vertices: BasePoint[];
  color: string;
  fillColor: string;
  locked?: boolean;
  type?: "obstacle" | "keep-in";
  visible?: boolean;
}

interface ObstaclePreset {
  id: string;
  name: string;
  shapes: Shape[];
}

type TimelineEventType = "travel" | "wait" | "macro";

interface TimelineEvent {
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

interface TimePrediction {
  totalTime: number;
  segmentTimes: number[];
  totalDistance: number;
  timeline: TimelineEvent[];
}

interface DirectorySettings {
  autoPathsDirectory: string;
}

interface FileInfo {
  name: string;
  path: string;
  size: number;
  modified: Date;
  error?: string;
  gitStatus?: "modified" | "staged" | "untracked" | "ignored" | "clean";
}

interface CollisionMarker {
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

interface Notification {
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

interface PedroData {
  startPoint: Point;
  lines: Line[];
  shapes: Shape[];
  sequence: SequenceItem[];
  extraData?: Record<string, any>;
}

// Registry Interfaces
interface Registry<T> {
  subscribe: (run: (value: any) => void) => () => void;
  register: (item: T) => void;
  unregister?: (id: string) => void;
  get?: (name: string) => any;
  reset: () => void;
}

interface ComponentRegistryState {
  [key: string]: any;
}

interface TabDefinition {
  id: string;
  label: string;
  component: any;
  icon?: string;
  order?: number;
}

interface NavbarAction {
  id: string;
  icon: string; // SVG string
  title?: string;
  onClick: () => void;
  location?: "left" | "right" | "center"; // Where to place it (default right)
  order?: number;
}

type HookCallback = (...args: any[]) => void | Promise<void>;

interface HookRegistry {
  register: (hookName: string, callback: HookCallback) => void;
  run: (hookName: string, ...args: any[]) => Promise<void>;
  clear: () => void;
}

interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string; // SVG string
  onClick: (args: { x: number; y: number }) => void;
  condition?: (args: { x: number; y: number }) => boolean;
}

// Writable Store Interface (simplified from Svelte)
interface Writable<T> {
  set: (value: T) => void;
  update: (updater: (value: T) => T) => void;
  subscribe: (run: (value: T) => void) => () => void;
}

// Project Store Interface
interface ProjectStore {
  startPointStore: Writable<Point>;
  linesStore: Writable<Line[]>;
  shapesStore: Writable<Shape[]>;
  sequenceStore: Writable<SequenceItem[]>;
  settingsStore: Writable<any>; // Using any for Settings to avoid circular or huge types for now
  extraDataStore: Writable<Record<string, any>>;
}

type ScaleFunction = ((val: number) => number) & {
  invert?: (val: number) => number;
};

interface FieldView {
  xScale: ScaleFunction;
  yScale: ScaleFunction;
  width: number;
  height: number;
}

interface AppStore {
  fieldViewStore: Writable<FieldView>;
}

interface DialogDefinition {
  id: string;
  component: any;
  props?: any;
}

interface PluginGraphicsOptions {
  x: number;
  y: number;
  // Common visual properties
  color?: string;
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  opacity?: number;
  // Shape specific
  width?: number; // Rect
  height?: number; // Rect
  radius?: number; // Circle
  text?: string; // Text
  fontSize?: number; // Text
  align?: "left" | "center" | "right"; // Text
  // Path specific
  points?: { x: number; y: number }[]; // Path/Line
  closed?: boolean; // Path
}

interface PluginGraphicsContext {
  two: any; // Raw Two instance
  width: number; // Viewport width
  height: number; // Viewport height

  // Helpers
  drawRect(options: PluginGraphicsOptions): any; // Returns Two.Rectangle
  drawCircle(options: PluginGraphicsOptions): any; // Returns Two.Circle
  drawLine(options: PluginGraphicsOptions): any; // Returns Two.Line or Path
  drawText(options: PluginGraphicsOptions): any; // Returns Two.Text
}

interface PluginFeature {
  name: string;
  navbar?: {
    icon: string;
    onClick: () => void;
    title?: string;
    location?: "left" | "right" | "center";
  };
  contextMenu?: {
    id?: string;
    label: string;
    icon?: string;
    onClick: (args: { x: number; y: number }) => void;
    condition?: (args: { x: number; y: number }) => boolean;
  };
  render?: (ctx: PluginGraphicsContext) => void;
}

interface PedroAPI {
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
   * Register a plugin feature (unified registration).
   * @param feature The feature definition.
   */
  registerFeature(feature: PluginFeature): void;

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
    actions: Registry<ActionDefinition>;
  };

  /**
   * Access internal Svelte stores.
   */
  stores: {
    project: ProjectStore;
    app: AppStore;
    get: (store: Writable<any>) => any;
  };

  /**
   * UI utilities.
   */
  ui: {
    prompt: (options: {
      title: string;
      message: string;
      defaultText?: string;
    }) => Promise<string | null>;
    confirm: (options: {
      title: string;
      message: string;
      confirmText?: string;
      cancelText?: string;
    }) => Promise<boolean>;
    toast: (
      message: string,
      type?: "success" | "warning" | "error" | "info",
      timeout?: number,
    ) => void;
  };

  /**
   * Graphics utilities.
   */
  graphics: {
    requestRedraw: () => void;
  };
}

interface FieldRenderContext {
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

interface CodeExportContext {
  stateStep?: number; // For state machine generation
  indent?: string;
  variableName?: string;
  isNextFTC?: boolean; // For sequential generation target
  targetLibrary?: "SolversLib" | "NextFTC";
}

interface JavaCodeResult {
  code: string;
  stepsUsed: number;
}

interface TimeCalculationContext {
  currentTime: number;
  currentHeading: number;
  lastPoint: Point;
  settings: any;
  lines: Line[];
}

interface TimeCalculationResult {
  events: TimelineEvent[];
  duration: number;
  endHeading?: number; // If changed
  endPoint?: Point; // If changed
}

interface InsertionContext {
  index: number;
  sequence: SequenceItem[];
  lines: Line[];
  startPoint: Point;
  triggerReactivity: () => void; // Call to update stores/UI
}

interface ActionDefinition {
  kind: string;
  label: string;
  icon?: string; // SVG string
  description?: string;

  // UI Configuration
  buttonColor?: string; // e.g. "amber", "pink", "indigo"
  buttonFilledIcon?: string; // Optional filled icon for buttons
  // Optional raw color hex for renderers and other quick references
  color?: string;

  // Toolbar/Button affordances
  showInToolbar?: boolean;
  button?: {
    label?: string;
    icon?: string;
  };

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

export {};

// Global variable exposed to plugins
declare global {
  const pedro: PedroAPI;
}
