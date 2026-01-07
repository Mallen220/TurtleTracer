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
};

export type SequenceItem = SequencePathItem | SequenceWaitItem;

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
  fieldMap: string;
  fieldRotation?: number; // 0, 90, 180, 270
  robotImage?: string;
  javaPackageName?: string;
  theme: "light" | "dark" | "auto";
  showGhostPaths?: boolean; // Show collision overlays via ghost paths
  showOnionLayers?: boolean; // Show robot body at intervals along the path
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
}

export interface Shape {
  id: string;
  name?: string;
  vertices: BasePoint[];
  color: string;
  fillColor: string;
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
