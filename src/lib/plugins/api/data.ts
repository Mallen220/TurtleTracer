// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// The plugin API's view of a project. Plugins never see the app's internal
// objects; the host copies the parts below out of them. Distances are field
// inches, headings are degrees counter-clockwise from +x (Pedro's
// convention), and times are seconds unless a name says otherwise.

/** Anything that can be saved as JSON. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** A point on the field, in inches. */
export interface FieldPoint {
  x: number;
  y: number;
}

/** Where the robot is and which way it faces. */
export interface Pose {
  x: number;
  y: number;
  /** Degrees, counter-clockwise from +x. */
  heading: number;
}

/**
 * Poses over time, as parallel arrays of the same length. `t` is in seconds
 * and never decreases.
 */
export interface PoseTrack {
  t: number[];
  x: number[];
  y: number[];
  heading: number[];
}

/** How a path decides which way the robot faces. */
export type HeadingInfo =
  | { mode: "tangential"; reverse: boolean }
  | { mode: "constant"; degrees: number }
  | { mode: "linear"; startDegrees: number; endDegrees: number }
  | { mode: "facingPoint"; x: number; y: number }
  | { mode: "piecewise" };

export interface PathInfo {
  id: string;
  name: string;
  color: string;
  from: FieldPoint;
  to: FieldPoint;
  controlPoints: FieldPoint[];
  heading: HeadingInfo;
  /** Driven straight on from the path before it, without stopping. */
  chained: boolean;
  locked: boolean;
  hidden: boolean;
}

/** One step of the routine, in the order the robot does them. */
export type StepInfo =
  | { kind: "path"; id: string; pathId: string }
  | { kind: "wait"; id: string; name: string; durationMs: number }
  | { kind: "rotate"; id: string; name: string; degrees: number }
  | { kind: "macro"; id: string; name: string }
  | {
      kind: "plugin";
      id: string;
      /** `<plugin id>.<action name>`, e.g. `intake-action.intake`. */
      type: string;
      name: string;
      data: Record<string, JsonValue>;
    };

export interface ShapeInfo {
  id: string;
  name: string;
  /** Obstacles must be avoided; keep-in zones must not be left. */
  kind: "obstacle" | "keep-in";
  vertices: FieldPoint[];
  color: string;
}

export interface RobotInfo {
  length: number;
  width: number;
  /** Inches per second. */
  maxVelocity: number;
  /** Inches per second². */
  maxAcceleration: number;
  maxDeceleration: number;
  /** Radians per second. */
  maxAngularVelocity: number;
  driveType: "holonomic" | "swerve";
}

/** A read-only copy of the open project. */
export interface ProjectSnapshot {
  /** The project's file name without its folder, or null if it isn't saved. */
  fileName: string | null;
  start: Pose;
  paths: PathInfo[];
  steps: StepInfo[];
  shapes: ShapeInfo[];
  robot: RobotInfo;
  field: { width: number; height: number };
  /** The units the user sees. Values in the API are always inches. */
  units: "imperial" | "metric";
  /** This plugin's own data saved in the project (see `project.setData`). */
  data: JsonValue | null;
}

/** When one step happens. */
export interface PlanStep {
  id: string;
  kind: StepInfo["kind"];
  start: number;
  end: number;
}

/** What the robot is planned to do, timed the way Turtle Tracer times it. */
export interface Plan {
  /** Seconds from start to finish. */
  duration: number;
  /** The robot's pose every 20 ms. */
  poses: PoseTrack;
  steps: PlanStep[];
  /** Each path as a line of points along its curve, for drawing. */
  paths: { id: string; color: string; points: FieldPoint[] }[];
}

/** A step to add with `project.edit`. */
export type NewStep =
  | {
      kind: "plugin";
      /** One of this plugin's action names, or a full `<plugin>.<name>` type. */
      type: string;
      name?: string;
      data?: Record<string, JsonValue>;
    }
  | { kind: "wait"; name?: string; durationMs: number }
  | { kind: "rotate"; name?: string; degrees: number };

/**
 * One change to the project. Changes to this plugin's own steps are always
 * allowed; anything else needs the `project.write` permission.
 */
export type EditOp =
  | { op: "insertStep"; index: number; step: NewStep }
  | {
      op: "updateStep";
      id: string;
      changes: {
        name?: string;
        data?: Record<string, JsonValue>;
        durationMs?: number;
        degrees?: number;
      };
    }
  | { op: "removeStep"; id: string }
  | {
      op: "addPath";
      to: FieldPoint;
      controlPoints?: FieldPoint[];
      name?: string;
      color?: string;
      /** Where in the steps to put it; the end if left out. */
      index?: number;
    }
  | { op: "removePath"; id: string }
  | {
      op: "movePoint";
      pathId: string;
      /** The path's end point, or the index of one of its control points. */
      point: "end" | number;
      x: number;
      y: number;
    }
  | { op: "moveStart"; x: number; y: number }
  | {
      op: "addShape";
      vertices: FieldPoint[];
      name?: string;
      kind?: "obstacle" | "keep-in";
      color?: string;
    }
  | {
      op: "updateShape";
      id: string;
      changes: { vertices?: FieldPoint[]; name?: string; color?: string };
    }
  | { op: "removeShape"; id: string };

/** A project file the user picked (see `files.pickProjects`). */
export interface PickedProject {
  /** The file's name, without its folder. */
  name: string;
  /** The file's contents, as saved. */
  contents: JsonValue;
}

/** Another project, read and timed by Turtle Tracer. */
export interface AnalyzedProject {
  project: ProjectSnapshot;
  plan: Plan;
}
