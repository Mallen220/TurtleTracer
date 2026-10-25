// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Exported type definitions for use in Svelte and TS modules
import type { Component } from "svelte";

export interface BasePoint {
  x: number;
  y: number;
  locked?: boolean;
  isMacroElement?: boolean;
  macroId?: string;
  originalId?: string;
}

export type PiecewiseSegment = {
  tStart: number;
  tEnd: number;
} & (
  | {
      heading: "linear";
      startDeg: number;
      endDeg: number;
      degrees?: undefined;
      targetX?: undefined;
      targetY?: undefined;
    }
  | {
      heading: "constant";
      degrees: number;
      startDeg?: undefined;
      endDeg?: undefined;
      targetX?: undefined;
      targetY?: undefined;
    }
  | {
      heading: "tangential";
      degrees?: undefined;
      startDeg?: undefined;
      endDeg?: undefined;
      targetX?: undefined;
      targetY?: undefined;
    }
  | {
      heading: "facingPoint";
      targetX: number;
      targetY: number;
      degrees?: undefined;
      startDeg?: undefined;
      endDeg?: undefined;
    }
) & {
    reverse?: boolean;
  };

export type Point = BasePoint &
  (
    | {
        heading: "linear";
        startDeg: number;
        endDeg: number;
        degrees?: undefined;
        targetX?: undefined;
        targetY?: undefined;
        segments?: undefined;
      }
    | {
        heading: "constant";
        degrees: number;
        startDeg?: undefined;
        endDeg?: undefined;
        targetX?: undefined;
        targetY?: undefined;
        segments?: undefined;
      }
    | {
        heading: "tangential";
        degrees?: undefined;
        startDeg?: undefined;
        endDeg?: undefined;
        targetX?: undefined;
        targetY?: undefined;
        segments?: undefined;
      }
    | {
        heading: "facingPoint";
        targetX: number;
        targetY: number;
        degrees?: undefined;
        startDeg?: undefined;
        endDeg?: undefined;
        segments?: undefined;
      }
    | {
        heading: "piecewise";
        segments: PiecewiseSegment[];
        degrees?: undefined;
        startDeg?: undefined;
        endDeg?: undefined;
        targetX?: undefined;
        targetY?: undefined;
      }
  ) & {
    reverse?: boolean;
  };

export type ControlPoint = BasePoint;

export type EventMarkerType = "parametric" | "temporal" | "pose";

export interface EventMarker {
  id: string;
  name: string;
  type?: EventMarkerType; // Defaults to "parametric" if missing
  position: number; // 0-1 within the path segment (for parametric)
  time?: number; // milliseconds (for temporal, legacy)
  endTime?: number; // milliseconds (for temporal, absolute time from start)
  poseX?: number; // for pose
  poseY?: number; // for pose
  poseHeading?: number; // degrees, for pose
  poseGuess?: number; // 0-1, initial guess for parametric t-value of closest point (for pose)

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
  hidden?: boolean;
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
  isChain?: boolean;
  /**
   * The fastest this path is driven, in inches per second. Exported as a
   * Pedro `maxVelocityConstraint` on the path, so it takes the place of the
   * chain's cap (see `chainMaxSpeed`) rather than being limited by it. The
   * robot's own Max Velocity setting is the most a path can go either way.
   */
  maxSpeed?: number;
  /** For the first path of a chain: the fastest every path in the chain is driven, in inches per second, unless it has a `maxSpeed` of its own. */
  chainMaxSpeed?: number;
  globalHeading?: Point["heading"] | "none"; // Used when isChain is true, acts as a global override
  globalDegrees?: number;
  globalStartDeg?: number;
  globalEndDeg?: number;
  globalTargetX?: number;
  globalTargetY?: number;
  globalReverse?: boolean;
  globalSegments?: PiecewiseSegment[];
}

export type SequencePathItem = {
  kind: "path";
  lineId: string;
  hidden?: boolean;
  isChain?: boolean;
};

export type SequenceWaitItem = {
  kind: "wait";
  id: string;
  name: string;
  durationMs: number;
  locked?: boolean;
  hidden?: boolean;
  eventMarkers?: EventMarker[];
  _linkedName?: string; // Metadata for linked names
};

export type SequenceRotateItem = {
  kind: "rotate";
  id: string;
  name: string;
  degrees: number;
  locked?: boolean;
  hidden?: boolean;
  eventMarkers?: EventMarker[];
  _linkedName?: string; // Metadata for linked names
};

export interface Transformation {
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

export type SequenceMacroItem = {
  kind: "macro";
  id: string; // Unique instance ID
  filePath: string; // The macro file path
  name: string;
  locked?: boolean;
  hidden?: boolean;
  eventMarkers?: EventMarker[]; // Macros can have markers too
  sequence?: SequenceItem[]; // The expanded sequence for this macro instance
  transformations?: Transformation[];
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

export interface CommandPaletteCommand {
  id: string;
  label: string;
  shortcut?: string;
  category?: string;
  action: () => void;
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

export interface CustomSidebarItem {
  id: string;
  label: string;
  commandId: string;
  iconSvg: string;
  iconComponent?: Component;
}

export interface Settings {
  fieldWidth?: number;
  fieldHeight?: number;
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
  /**
   * Which Pedro Pathing behaviour to simulate. v3 measures heading progress
   * along a path by distance and hands chained paths over early; v2 measures
   * it by the curve parameter and hands over at the end of the path.
   */
  pedroVersion?: "v3" | "v2";
  /**
   * Pedro's brake model as written in the robot's code (ForesightConfig
   * quadraticBrakeCoefficients and linearBrakeCoefficients, forward and strafe).
   * Pedro uses it to decide when to hand a chained path over to the next one.
   * All 0: the braking settings above are used instead.
   */
  pedroQuadraticBrakeForward?: number;
  pedroQuadraticBrakeStrafe?: number;
  pedroLinearBrakeForward?: number;
  pedroLinearBrakeStrafe?: number;
  /** Seconds the robot holds at the end of a path before the next step starts. */
  pathSettleTime?: number;
  /** Stop to turn in place before a path that starts at a different heading. */
  stopToTurn?: boolean;
  /**
   * The P gain of Pedro's translational PID, which steers the robot back onto
   * the path: motor power per inch of error. A stronger controller swings less
   * wide at a chained corner and gets back onto the path sooner.
   */
  translationalP?: number;
  /** Braking distance (in) is `quadratic * v^2 + linear * v`, with v in in/s. 0 and 0 use max deceleration. */
  brakingQuadratic?: number;
  brakingLinear?: number;
  fieldMap: string;
  fieldRotation?: number; // 0, 90, 180, 270
  robotImage?: string;
  robotDriveType?: "holonomic" | "swerve"; // Drive train type for visualization
  showRobotArrows?: boolean; // Whether to display drive train direction arrows
  showFakeHeadingArrow?: boolean;
  robotFeatures?: RobotFeature[];
  fakeHeadingArrowColor?: string;
  javaPackageName?: string;
  /**
   * The team's Pedro constants class (full name) and the method on it that
   * builds the Follower, for exported code. Empty: found in the robot project.
   */
  pedroConstantsClass?: string;
  pedroFollowerFactory?: string;
  theme: "light" | "dark" | "auto" | string;
  programFontSize?: number; // Scaling factor for the program font size (percentage)
  squaredCorners?: boolean; // Draw the interface with square corners instead of rounded ones
  autosaveMode?: "time" | "change" | "close" | "never";
  autosaveInterval?: number; // minutes
  showVelocityHeatmap?: boolean; // Show velocity heatmap overlay
  showVelocityTooltip?: boolean; // Show velocity tooltip on hover
  showOnionLayers?: boolean; // Show robot body at intervals along the path
  onionSkinCurrentPathOnly?: boolean; // Show onion layers only on the current path
  onionLayerSpacing?: number; // Distance in inches between onion layers
  optimizationIterations?: number; // Number of optimization generations
  optimizationPopulationSize?: number; // Population size for optimizer
  optimizationMutationRate?: number; // Mutation rate for optimizer
  optimizationMutationStrength?: number; // Mutation strength for optimizer
  drawToolTolerance?: number;
  drawToolTension?: number;
  validationDisabled?: boolean; // Completely disable all path validation
  validateFieldBoundaries?: boolean; // Check if robot goes out of bounds
  continuousValidation?: boolean; // Run validation continuously
  restrictDraggingToField?: boolean; // Restrict dragging to field bounds
  smartSnapping?: boolean; // Snap points to align with other waypoints
  customMaps?: CustomFieldConfig[];
  keyBindings?: KeyBinding[];
  recentFiles?: string[];
  fileManagerSortMode?: "name" | "date"; // File manager sort preference
  lastSeenVersion?: string; // Version of the app the user last saw (for What's New dialog)
  lastFeedbackSubmit?: string; // Timestamp of last feedback submission for rate limiting
  submittedRatings?: Record<string, boolean>; // Map of version to whether user has rated it
  dismissedRatings?: Record<string, boolean>; // Map of version to whether user dismissed the rating dialog
  totalUsageTime?: number; // Total usage time in milliseconds
  hasSeenOnboarding?: boolean; // Whether the user has seen the onboarding tutorial
  gitIntegration?: boolean; // Enable/Disable Git integration
  obstaclePresets?: ObstaclePreset[]; // User-saved obstacle presets
  showDebugSequence?: boolean; // Developer/debugging aids
  // Auto Export Settings
  autoExportCode?: boolean;
  autoExportPath?: string;
  autoExportPathMode?: "relative" | "absolute";
  autoExportFormat?: "java" | "sequential" | "points" | "json";
  autoExportTargetLibrary?: CommandLibraryId;
  codeLanguage?: CodeLanguage;
  autoExportFullClass?: boolean;
  autoExportEmbedPoseData?: boolean; // Embed pose data in the generated code
  telemetryImplementation?: "Standard" | "Dashboard" | "Panels" | "None";
  followRobot?: boolean;
  lockFieldView?: boolean;
  coordinateSystem?: "Pedro" | "FTC";
  visualizerUnits?: "imperial" | "metric";
  codeUnits?: "imperial" | "metric";
  showTelemetryTab?: boolean;
  /** Pop up a notice when live telemetry has measured a better motion setting. */
  telemetrySuggestFixes?: boolean;
  /** Start the simulation when the live robot starts its first path. */
  telemetrySyncPlayback?: boolean;
  sidebarItems?: string[];
  customSidebarItems?: CustomSidebarItem[];
  sidebarExpanded?: boolean;
  sidebarWidth?: number;
  sidebarIconSize?: number;
}

export interface RobotFeature {
  id: string;
  name?: string;
  type: "rectangle" | "circle" | "line";
  x: number;
  y: number;
  color: string;
  width?: number;
  height?: number;
  radius?: number;
  length?: number;
  angle?: number;
  thickness?: number;
  filled?: boolean;
  visible?: boolean;
}

export interface RobotProfile {
  id: string;
  name: string;
  rLength: number;
  rWidth: number;
  maxVelocity: number;
  maxAcceleration: number;
  maxDeceleration: number;
  maxAngularAcceleration?: number;
  kFriction: number;
  aVelocity: number; // angular velocity
  xVelocity: number;
  yVelocity: number;
  // How the robot is tuned (profiles saved before these existed don't have them)
  translationalP?: number;
  brakingQuadratic?: number;
  brakingLinear?: number;
  pathSettleTime?: number;
  pedroQuadraticBrakeForward?: number;
  pedroQuadraticBrakeStrafe?: number;
  pedroLinearBrakeForward?: number;
  pedroLinearBrakeStrafe?: number;
  robotImage?: string;
  robotDriveType?: "holonomic" | "swerve"; // Drive train type for visualization
  showRobotArrows?: boolean;
  showFakeHeadingArrow?: boolean;
  fakeHeadingArrowColor?: string;
  robotFeatures?: RobotFeature[];
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

export type TimelineEventType = "travel" | "wait" | "macro" | "recovery";

/** Where a robot goes while it is steered back onto a path. Shared: read only. */
export interface RecoveryTrace {
  /** Seconds from the start of the event. */
  readonly time: readonly number[];
  readonly x: readonly number[];
  readonly y: readonly number[];
  readonly speed: readonly number[];
  /** The robot's heading at each sample, in degrees. */
  readonly heading: readonly number[];
}

/** How a piecewise heading segment falls short of its heading. */
export interface PiecewiseShortfall {
  /** What the segment's heading is. */
  heading: PiecewiseSegment["heading"];
  /** Degrees short of the heading the segment asks for, at its end. */
  degrees: number;
  /** How far the segment asks the robot to turn, from the way it faces where the segment starts. */
  turn: number;
  /** Seconds the robot has between the start and the end of the segment. */
  seconds: number;
  /** The robot's top turn rate, in degrees per second. */
  turnRate: number;
}

/**
 * Where a robot goes when it can't follow a bend in its path at the speed
 * it's going: wide of the path, until it is back on it. Shared: read only.
 */
export interface Excursion {
  /** Seconds from the start of the travel event to when the robot leaves the path. */
  readonly startTime: number;
  readonly duration: number;
  /** Where the robot goes, with time from the start of the excursion. */
  readonly trace: RecoveryTrace;
  /** The part of the line (0 to 1) the robot leaves, and where it is back on it. */
  readonly fromT: number;
  readonly toT: number;
  /** The furthest the robot gets from the path, in inches. */
  readonly maxOffset: number;
  /** The most sideways acceleration the robot would need to stay on the path, in in/s². */
  readonly demand: number;
  /** Whether the robot got back onto the path, rather than running out of time. */
  readonly settled: boolean;
  /** The tightest part of the bend: its radius (inches), where it is, the speed the path had there and when the robot passes it. */
  readonly tightest: {
    readonly radius: number;
    readonly x: number;
    readonly y: number;
    readonly speed: number;
    readonly time: number;
  };
}

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
  /**
   * For a travel event: how much of the line this event drives, as fractions
   * of it (0 to 1). A robot handed over early doesn't drive the end of its
   * line, and one that joins part way along doesn't drive the start. Use
   * `drivenRange` rather than reading these directly.
   */
  drivenFrom?: number;
  drivenTo?: number;
  // Detailed motion profile for travel events: maps step index to cumulative time.
  // The steps outside the driven range are not part of this event: those before
  // it have times just below zero, those after it times past `duration`. Time
  // to position lookups work as usual; use `drivenRange` for anything that
  // counts distance or speed along the whole line.
  motionProfile?: number[];
  // Detailed velocity profile for travel events: maps step index to velocity
  velocityProfile?: number[];
  // Detailed heading profile for travel events: maps step index to unwrapped heading
  headingProfile?: number[];
  /**
   * For a travel event with a piecewise heading: how each segment falls short
   * of its heading, because the robot can't turn fast enough.
   */
  piecewiseShortfalls?: PiecewiseShortfall[];
  /**
   * For a travel event: where the robot leaves its line at a bend it can't
   * follow at that speed. The profiles of the event describe the whole trip,
   * the excursion included; the steps in between get the speed and heading
   * of the robot where it is closest to them.
   */
  excursion?: Excursion;
  /**
   * For a travel event: the most sideways acceleration the path asks of the
   * robot at the speeds it is driven, in in/s². Above what the wheels hold it
   * is a risk of wheel slip, even where the robot stays close enough to the
   * path that it isn't shown running wide.
   */
  peakDemand?: number;
  isGlobalOverride?: boolean;
  rootLine?: Line;
  globalHeading?: Point["heading"];
  /**
   * For a "recovery" event: where the robot goes between a chained path being
   * handed over and the robot being back on the next one.
   */
  trace?: RecoveryTrace;
  /** For a "recovery" event: whether the robot gets back onto the next path. */
  settled?: boolean;
  /** For a "recovery" event: how close the robot gets to the point the paths join at, in inches. */
  missedBy?: number;
  /** For a "recovery" event: how far the robot is from the next path when it is handed over. */
  startOffset?: number;
  /** For a "recovery" event: how far the robot swings past the next path, in inches. */
  overshoot?: number;
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
  isDirectory?: boolean;
}

export interface CollisionMarker {
  x: number;
  y: number;
  time: number;
  segmentIndex?: number;
  type?: "obstacle" | "boundary" | "zero-length" | "keep-in" | "chain-corner";
  /** The collision happens while the robot is off its path at a chained corner. */
  offPath?: boolean;
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

export interface TurtleData {
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

export interface ComponentRegistryState {
  [key: string]: any;
}

export interface TabDefinition {
  id: string;
  label: string;
  component: any;
  icon?: string;
  iconComponent?: any;
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

interface HookRegistry {
  register: (hookName: string, callback: HookCallback) => void;
  run: (hookName: string, ...args: any[]) => Promise<void>;
  clear: () => void;
}

/** One row of a right-click menu (ContextMenu.svelte). */
export interface MenuEntry {
  label?: string;
  /** Passed to the menu's `onaction` when there's no `onClick`. */
  action?: string;
  onClick?: () => void;
  /** A component, or an SVG string from a plugin. */
  icon?: Component<{ class?: string }> | string;
  separator?: boolean;
  danger?: boolean;
  disabled?: boolean;
  shortcut?: string;
}

export interface ContextMenuItem {
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
  settingsStore: Writable<Settings>;
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

interface AppStore {
  fieldViewStore: Writable<FieldView>;
  isUnsaved: Writable<boolean>;
}

export interface DialogDefinition {
  id: string;
  component: any;
  props?: any;
}

interface PluginMetadata {
  description?: string;
  author?: string;
  version?: string;
}

export interface PluginGraphicsOptions {
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

export interface PluginGraphicsContext {
  two: any; // Raw Two instance
  width: number; // Viewport width
  height: number; // Viewport height

  // Helpers
  drawRect(options: PluginGraphicsOptions): any; // Returns Two.Rectangle
  drawCircle(options: PluginGraphicsOptions): any; // Returns Two.Circle
  drawLine(options: PluginGraphicsOptions): any; // Returns Two.Line or Path
  drawText(options: PluginGraphicsOptions): any; // Returns Two.Text
}

export interface PluginFeature {
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

export interface TurtleAPI {
  /**
   * Register a custom code exporter.
   * @param name The display name of the exporter.
   * @param handler A function that takes the current project data and returns a string (code) or a Promise that resolves to a string.
   */
  registerMetadata(meta: PluginMetadata): void;

  registerExporter(
    name: string,
    handler: (data: TurtleData) => string | Promise<string>,
  ): void;

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
  getData(): TurtleData;

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

// Telemetry Types
export interface RobotPose {
  x: number;
  y: number;
  heading: number; // radians
}

export type FieldOperation =
  | {
      type: "circle";
      x: number;
      y: number;
      r: number;
      color: string;
      stroke?: boolean;
    }
  | {
      type: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      color: string;
      strokeWidth?: number;
    }
  | {
      type: "polygon";
      xPoints: number[];
      yPoints: number[];
      color: string;
      fill?: boolean;
      stroke?: boolean;
    }
  | {
      type: "text";
      x: number;
      y: number;
      content: string;
      color: string;
      fontSize?: number;
    };

export interface TelemetryPacket {
  timestamp: number;
  robotPose?: RobotPose;
  data: Record<string, string | number | boolean>;
  fieldOverlay?: FieldOperation | FieldOperation[];
}

export interface FieldRenderContext {
  x: (val: number) => number;
  y: (val: number) => number;
  uiLength: (inches: number) => number;
  settings: Settings;

  hoveredId: string | null;
  selectedId: string | null;
  selectedPointId: string | null;

  timePrediction?: TimePrediction;
}

/** The command-based libraries the sequential exporter can target. */
export type CommandLibraryId = "SolversLib" | "NextFTC" | "Ivy";

export type CodeLanguage = "java" | "kotlin";

export interface CodeExportContext {
  stateStep?: number; // For state machine generation
  indent?: string;
  variableName?: string;
  /** @deprecated Use targetLibrary. Kept so existing plugins keep working. */
  isNextFTC?: boolean;
  targetLibrary?: CommandLibraryId; // For sequential generation target
  language?: CodeLanguage;
}

export interface JavaCodeResult {
  code: string;
  stepsUsed: number;
}

export interface TimeCalculationContext {
  currentTime: number;
  currentHeading: number;
  lastPoint: Point;
  settings: Settings;
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
   * Generate code for the OpMode state machine approach, in the context's
   * `language`. Returns code and number of state steps used.
   */
  toJavaCode?: (
    item: SequenceItem,
    context: CodeExportContext,
  ) => JavaCodeResult;

  /**
   * Generate code for the SequentialCommandGroup approach, in the
   * context's `language`. Returns a string command instantiation.
   */
  toSequentialCommand?: (
    item: SequenceItem,
    context: CodeExportContext,
  ) => string;

  /**
   * Whether toJavaCode and toSequentialCommand write Kotlin when the context
   * asks for it. Kotlin exports leave a TODO comment in place of actions
   * without it.
   */
  supportsKotlin?: boolean;

  /**
   * Calculate timeline events and duration for this action.
   * Used for time estimation and timeline visualization.
   */
  calculateTime?: (
    item: SequenceItem,
    context: TimeCalculationContext,
  ) => TimeCalculationResult;
}

export interface UpdateData {
  version: string;
  releaseNotes: string;
  url: string;
}

export interface ElectronTelemetryAPI {
  connect: (ip: string, port: number, protocol: string) => Promise<any>;
  disconnect: () => Promise<any>;
  /** Both return a function that removes the listener. */
  onData: (callback: (data: any) => void) => (() => void) | void;
  onStatus: (callback: (status: any) => void) => (() => void) | void;
}

/** The parts of Electron's save dialog options the app uses. */
export interface SaveDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
}

export interface ElectronAPI {
  // Utils
  getPathForFile?: (file: File) => string;

  // File system operations
  getAppDataPath?: () => Promise<string>;
  getDirectory?: () => Promise<string | null>;
  setDirectory?: (path?: string) => Promise<string | null>;
  selectDirectory?: () => Promise<string | null>;
  listFiles: (directory: string) => Promise<FileInfo[]>;
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, content: string) => Promise<boolean>;
  deleteFile: (filePath: string) => Promise<boolean>;
  fileExists: (filePath: string) => Promise<boolean>;
  /** Files under `root` whose names end with one of `endings` (desktop only). */
  findFiles?: (
    root: string,
    endings: string[],
    options?: { maxDepth?: number; maxResults?: number },
  ) => Promise<string[]>;
  resolvePath?: (base: string, relative: string) => Promise<string>;
  makeRelativePath?: (base: string, target: string) => Promise<string>;

  // Directory settings operations
  getDirectorySettings?: () => Promise<any>;
  saveDirectorySettings?: (settings: any) => Promise<boolean>;
  getSavedDirectory?: () => Promise<string>;

  // Enhanced file operations
  createDirectory?: (dirPath: string) => Promise<boolean>;
  getDirectoryStats?: (dirPath: string) => Promise<any>;

  // Rename operation
  renameFile?: (
    oldPath: string,
    newPath: string,
  ) => Promise<{ success: boolean; newPath: string }>;

  // Show native save dialog
  showSaveDialog?: (options?: SaveDialogOptions) => Promise<string | null>;

  // Write binary content encoded as base64 to disk
  writeFileBase64?: (
    filePath: string,
    base64Content: string,
  ) => Promise<boolean>;

  // Export legacy .pp convenience wrapper
  exportPP?: (content: string, defaultName?: string) => Promise<any>;

  // File Copy
  copyFile?: (srcPath: string, destPath: string) => Promise<boolean>;

  // Git operations
  gitShow?: (filePath: string) => Promise<string | null>;
  gitStatus?: (directory: string) => Promise<any>;

  // GitHub (desktop): the token stays in the main process, which makes the
  // requests. See electron/ipc/githubHandlers.js.
  githubToken?: {
    status: () => Promise<{
      hasToken: boolean;
      remembered: boolean;
      login: string | null;
    }>;
    set: (
      token: string,
      remember: boolean,
      login: string | null,
    ) => Promise<{ remembered: boolean }>;
    clear: () => Promise<void>;
  };
  githubFetch?: (
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string },
  ) => Promise<{
    status?: number;
    headers?: Record<string, string>;
    body?: string;
    error?: string;
  }>;

  // Following a Java or Kotlin file (desktop): told each time it's saved in an editor.
  chooseJavaFile?: () => Promise<string | null>;
  followJavaFile?: (filePath: string) => Promise<boolean>;
  unfollowJavaFile?: () => Promise<boolean>;
  onJavaFileChanged?: (callback: (filePath: string) => void) => () => void;

  // Renderer ready signal
  rendererReady?: () => Promise<void>;

  // Listeners
  onOpenFilePath?: (callback: (filePath: string) => void) => void;
  onAppCloseRequested?: (callback: () => void) => void;
  sendCloseApproved?: () => Promise<void>;
  onMenuAction?: (callback: (action: string) => void) => void;

  // App version & store
  getAppVersion?: () => Promise<string>;
  isWindowsStore?: () => Promise<boolean>;
  openExternal?: (url: string) => Promise<boolean>;

  // Plugin System
  listPlugins?: () => Promise<any[]>;
  readPlugin?: (filename: string) => Promise<string>;
  deletePlugin?: (filename: string) => Promise<boolean>;
  openPluginsFolder?: () => Promise<void>;
  transpilePlugin?: (code: string) => Promise<string>;

  // Telemetry
  telemetry?: ElectronTelemetryAPI;

  // Updater
  onUpdateAvailable?: (callback: (data: any) => void) => void;
  onStoreUpdateAvailable?: (callback: (data: any) => void) => void;
  downloadUpdate?: (version: string, url: string) => void;
  skipUpdate?: (version: string) => void;
  checkForUpdates?: () => Promise<any>;

  // Virtual / Mock metadata
  isVirtual?: boolean;

  // Fallback compatibility used in web / mock environments
  saveFile?: (
    content: string,
    path?: string,
  ) => Promise<{ success: boolean; filepath: string; error?: string }>;
}
