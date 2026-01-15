// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
// Exported type definitions for use in Svelte and TS modules

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

export type SequenceItem =
  | SequencePathItem
  | SequenceWaitItem
  | SequenceRotateItem;

export interface KeyBinding {
  id: string;
  key: string;
  description: string;
  action: string; // Identifier for the action
  category?: string;
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
  theme: "light" | "dark" | "auto";
  autosaveMode?: "time" | "change" | "close" | "never";
  autosaveInterval?: number; // minutes
  showVelocityHeatmap?: boolean; // Show velocity heatmap overlay
  showGhostPaths?: boolean; // Show ghosted previous paths
  showOnionLayers?: boolean; // Show robot body at intervals along the path
  onionSkinCurrentPathOnly?: boolean; // Show onion layers only on the current path
  onionLayerSpacing?: number; // Distance in inches between onion layers
  optimizationIterations?: number; // Number of optimization generations
  optimizationPopulationSize?: number; // Population size for optimizer
  optimizationMutationRate?: number; // Mutation rate for optimizer
  optimizationMutationStrength?: number; // Mutation strength for optimizer
  validateFieldBoundaries?: boolean; // Check if robot goes out of bounds
  restrictDraggingToField?: boolean; // Restrict dragging to field bounds
  keyBindings?: KeyBinding[];
  recentFiles?: string[];
  fileManagerSortMode?: "name" | "date"; // File manager sort preference
  lastSeenVersion?: string; // Version of the app the user last saw (for What's New dialog)
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
}

export type TimelineEventType = "travel" | "wait";

export interface TimelineEvent {
  type: TimelineEventType;
  duration: number;
  startTime: number;
  endTime: number;
  name?: string;
  waitPosition?: "before" | "after";
  lineIndex?: number; // for travel
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
}

export interface CollisionMarker {
  x: number;
  y: number;
  time: number;
  segmentIndex?: number;
  type?: "obstacle" | "boundary" | "zero-length";
}

export interface Notification {
  message: string;
  type: "success" | "warning" | "error" | "info";
  timeout?: number; // milliseconds
  // Optional action button (e.g. Undo)
  actionLabel?: string;
  action?: () => void;
}
