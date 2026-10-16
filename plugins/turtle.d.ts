/* eslint-disable */
// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
/**
 * Types for Turtle Tracer plugins. Reference this file from your plugin's
 * scripts:
 *
 *   /// <reference path="../turtle.d.ts" />
 *
 * Your main script then gets the global `turtle` (Turtle.TurtleAPI), and a
 * view's scripts can `import { connect } from "turtle:view"`.
 *
 * AUTO-GENERATED from src/lib/plugins/api by scripts/generate-plugin-types.js.
 * Don't edit it by hand: it's replaced whenever Turtle Tracer updates.
 */

declare namespace Turtle {
  // The plugin API's view of a project. Plugins never see the app's internal
  // objects; the host copies the parts below out of them. Distances are field
  // inches, headings are degrees counter-clockwise from +x (Pedro's
  // convention), and times are seconds unless a name says otherwise.

  /** Anything that can be saved as JSON. */
  type JsonValue =
    | string
    | number
    | boolean
    | null
    | JsonValue[]
    | { [key: string]: JsonValue };

  /** A point on the field, in inches. */
  interface FieldPoint {
    x: number;
    y: number;
  }

  /** Where the robot is and which way it faces. */
  interface Pose {
    x: number;
    y: number;
    /** Degrees, counter-clockwise from +x. */
    heading: number;
  }

  /**
   * Poses over time, as parallel arrays of the same length. `t` is in seconds
   * and never decreases.
   */
  interface PoseTrack {
    t: number[];
    x: number[];
    y: number[];
    heading: number[];
  }

  /** How a path decides which way the robot faces. */
  type HeadingInfo =
    | { mode: "tangential"; reverse: boolean }
    | { mode: "constant"; degrees: number }
    | { mode: "linear"; startDegrees: number; endDegrees: number }
    | { mode: "facingPoint"; x: number; y: number }
    | { mode: "piecewise" };

  interface PathInfo {
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
  type StepInfo =
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

  interface ShapeInfo {
    id: string;
    name: string;
    /** Obstacles must be avoided; keep-in zones must not be left. */
    kind: "obstacle" | "keep-in";
    vertices: FieldPoint[];
    color: string;
  }

  interface RobotInfo {
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
  interface ProjectSnapshot {
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
  interface PlanStep {
    id: string;
    kind: StepInfo["kind"];
    start: number;
    end: number;
  }

  /** What the robot is planned to do, timed the way Turtle Tracer times it. */
  interface Plan {
    /** Seconds from start to finish. */
    duration: number;
    /** The robot's pose every 20 ms. */
    poses: PoseTrack;
    steps: PlanStep[];
    /** Each path as a line of points along its curve, for drawing. */
    paths: { id: string; color: string; points: FieldPoint[] }[];
  }

  /** A step to add with `project.edit`. */
  type NewStep =
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
  type EditOp =
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
  interface PickedProject {
    /** The file's name, without its folder. */
    name: string;
    /** The file's contents, as saved. */
    contents: JsonValue;
  }

  /** Another project, read and timed by Turtle Tracer. */
  interface AnalyzedProject {
    project: ProjectSnapshot;
    plan: Plan;
  }

  // Forms are described as data and drawn by Turtle Tracer, so a plugin's
  // settings, dialogs and action rows look like the rest of the app (themes
  // included) without the plugin shipping any UI.

  interface FieldBase {
    /** The name the value is stored under. */
    key: string;
    label: string;
    /** A short explanation shown under the field. */
    help?: string;
  }

  interface NumberField extends FieldBase {
    type: "number";
    default?: number;
    min?: number;
    max?: number;
    step?: number;
    /**
     * What the number measures. Values are always stored in inches, degrees,
     * seconds and inches per second; the form shows them in the user's units.
     */
    unit?: "distance" | "angle" | "time" | "speed";
  }

  interface TextField extends FieldBase {
    type: "text";
    default?: string;
    placeholder?: string;
    /** A box with several lines instead of one. */
    multiline?: boolean;
  }

  interface ToggleField extends FieldBase {
    type: "toggle";
    default?: boolean;
  }

  interface SelectField extends FieldBase {
    type: "select";
    options: { value: string; label: string }[];
    default?: string;
  }

  interface ColorField extends FieldBase {
    type: "color";
    /** A hex colour such as `#22c55e`. */
    default?: string;
  }

  type FormField =
    | NumberField
    | TextField
    | ToggleField
    | SelectField
    | ColorField;

  /** A form's values, by field key. */
  type FormValues = Record<string, string | number | boolean>;

  // Shapes a plugin can draw on the field. Positions and sizes are field
  // inches; line widths and text sizes are inches too, but they stay the same
  // size on screen when the field is zoomed, like the app's own markers.

  interface PrimitiveBase {
    /** Give a shape an id to hear about clicks on it (`LayerDefinition.onClick`). */
    id?: string;
    /** 0 (invisible) to 1. */
    opacity?: number;
    /**
     * `"field"` (the default) draws at field coordinates. `"robot"` draws
     * relative to the robot as it moves: x forward, y to its left, in inches
     * from its centre.
     */
    space?: "field" | "robot";
  }

  /** Colours are any CSS colour; `"none"` leaves out a fill or outline. */
  interface Paint {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
  }

  interface CirclePrimitive extends PrimitiveBase, Paint {
    type: "circle";
    x: number;
    y: number;
    radius: number;
  }

  /** A rectangle centred on `x`, `y`. */
  interface RectPrimitive extends PrimitiveBase, Paint {
    type: "rect";
    x: number;
    y: number;
    width: number;
    height: number;
    /** Degrees counter-clockwise. */
    rotation?: number;
  }

  /** A line through `points`, or a polygon when `closed`. */
  interface LinePrimitive extends PrimitiveBase, Paint {
    type: "line";
    points: FieldPoint[];
    closed?: boolean;
    /** Dash and gap lengths in inches, e.g. `[2, 1]`. */
    dash?: number[];
  }

  interface TextPrimitive extends PrimitiveBase {
    type: "text";
    x: number;
    y: number;
    text: string;
    /** Text height in inches. */
    size?: number;
    color?: string;
    align?: "left" | "center" | "right";
    bold?: boolean;
  }

  interface ArrowPrimitive extends PrimitiveBase {
    type: "arrow";
    from: FieldPoint;
    to: FieldPoint;
    color?: string;
    strokeWidth?: number;
  }

  /**
   * A robot outline with a heading mark: at a fixed pose, or following one of
   * the layer's tracks during playback (see `Layer.setTrack`). Its size is the
   * project's robot unless given.
   */
  interface RobotPrimitive extends PrimitiveBase {
    type: "robot";
    x?: number;
    y?: number;
    heading?: number;
    /** The name of a track set with `Layer.setTrack`. */
    track?: string;
    color?: string;
    length?: number;
    width?: number;
  }

  type FieldPrimitive =
    | CirclePrimitive
    | RectPrimitive
    | LinePrimitive
    | TextPrimitive
    | ArrowPrimitive
    | RobotPrimitive;

  // `turtle`, the global object a plugin's main script uses. The script runs
  // in its own worker: it has no DOM and no network, and everything it does
  // goes through this object.

  /** Returned by everything that adds something; call `dispose` to take it away again. */
  interface Disposable {
    dispose(): void;
  }

  // --- Commands ---

  interface CommandDefinition {
    /** Unique within the plugin. */
    id: string;
    label: string;
    /**
     * Runs the command. `at` is the point the user right-clicked when it's
     * run from the field's menu.
     */
    run(context: { at?: FieldPoint }): void | Promise<void>;
  }

  // --- Field layers ---

  interface LayerDefinition {
    /** What to draw. Called when the layer is added, and again as `redrawOn` says. */
    draw(): FieldPrimitive[];
    /** A shape with an `id` was clicked. */
    onClick?(id: string, at: FieldPoint): void;
    /**
     * When to call `draw` again by itself: whenever the project changes (on
     * by default) and on playback frames (off by default; at most 30 times a
     * second). Call `Layer.redraw` for anything else.
     */
    redrawOn?: { project?: boolean; playback?: boolean };
  }

  interface Layer extends Disposable {
    /** Calls `draw` again. */
    redraw(): void;
    /**
     * Gives the layer a track that robot shapes can follow (`track: name`).
     * The robot moves along it during playback without any more calls.
     * Pass `null` to remove it.
     */
    setTrack(name: string, track: PoseTrack | null): void;
  }

  // --- Action types (new kinds of step) ---

  /** A step of one of this plugin's action types. */
  interface PluginStep {
    id: string;
    type: string;
    name: string;
    data: FormValues;
  }

  /** How long an action takes, from `ActionTypeDefinition.time`. */
  interface ActionTiming {
    seconds: number;
    /** The heading the robot ends at, if the action turns it. */
    endHeading?: number;
    /**
     * Where the robot goes during the action, if it moves. Times start at 0.
     * The robot ends the action at the last pose.
     */
    poses?: PoseTrack;
  }

  interface ActionTypeDefinition {
    /** Lower-case letters, digits and dashes. Saved as `<plugin id>.<name>`. */
    name: string;
    label: string;
    /** Hex colour for the step's button, row and marker. */
    color?: string;
    /** An SVG icon. */
    icon?: string;
    /** The settings each step has; edited in the step's row. */
    fields?: FormField[];
    /**
     * How long the action takes, worked out by Turtle Tracer: a fixed number
     * of seconds, or the value of one of the fields (a `number` field with
     * `unit: "time"`). Leave out for an instant action, or use `time`.
     */
    timing?: { seconds: number } | { secondsFrom: string };
    /** Works out the timing yourself, for actions that move or turn the robot. */
    time?(context: {
      step: PluginStep;
      start: Pose;
      project: ProjectSnapshot;
    }): ActionTiming | Promise<ActionTiming>;
    /** The code exported for a step. */
    code?: {
      /** A command for the command-based exporter, e.g. `new IntakeCommand(0.8)`. */
      sequential?(context: {
        step: PluginStep;
        library: "SolversLib" | "NextFTC" | "Ivy";
      }): string | Promise<string>;
      /**
       * `case` blocks for the state-machine exporter, starting at `state`.
       * Return how many states they use.
       */
      java?(context: {
        step: PluginStep;
        state: number;
      }):
        | { code: string; states: number }
        | Promise<{ code: string; states: number }>;
    };
  }

  // --- Event marker types ---

  interface MarkerTypeDefinition {
    /** Lower-case letters, digits and dashes. Saved as `<plugin id>.<name>`. */
    name: string;
    label: string;
    fields?: FormField[];
    /**
     * When the marker fires, in seconds after its step starts, or `null` to
     * leave it where it is. The answer is saved with the marker, so exports
     * (and people without the plugin) treat it like an ordinary marker.
     */
    resolve(context: {
      marker: { id: string; name: string; values: FormValues };
      step: PlanStep;
      plan: Plan;
      project: ProjectSnapshot;
    }): number | null | Promise<number | null>;
  }

  // --- Exporters ---

  interface ExporterDefinition {
    /** Lower-case letters, digits and dashes. */
    name: string;
    label: string;
    /** The file extension to save as, without the dot. */
    extension?: string;
    /** How to highlight the output. */
    language?: "java" | "json" | "plaintext";
    export(context: {
      project: ProjectSnapshot;
      plan: Plan;
    }): string | Promise<string>;
  }

  // --- Simulators ---

  interface SimulationResult {
    /** Where the simulated robot goes, from time 0. */
    poses: PoseTrack;
    /** Things worth pointing out, shown in the simulation menu. */
    notes?: { time: number; text: string; level?: "info" | "warning" }[];
  }

  interface SimulatorDefinition {
    /** Lower-case letters, digits and dashes. */
    name: string;
    label: string;
    /**
     * Works out what a real robot would do. Called again (after a short
     * pause) whenever the project changes, while the simulator is selected.
     */
    simulate(context: {
      project: ProjectSnapshot;
      plan: Plan;
    }): SimulationResult | Promise<SimulationResult>;
  }

  // --- Events ---

  interface PlaybackState {
    /** Seconds into the routine. */
    time: number;
    duration: number;
    playing: boolean;
  }

  interface TurtleEvents {
    projectChanged: ProjectSnapshot;
    projectLoaded: ProjectSnapshot;
    projectSaved: ProjectSnapshot;
    /** This plugin's settings (from its manifest) were changed by the user. */
    settingsChanged: FormValues;
    /** At most 30 times a second while something is listening. */
    playback: PlaybackState;
    selectionChanged: { pathId: string | null; stepId: string | null };
  }

  // --- The API ---

  interface TurtleAPI {
    /** This plugin, from its manifest. */
    readonly plugin: { id: string; name: string; version: string };

    readonly commands: {
      /** Adds a command. It shows in the command palette under the plugin's name. */
      register(command: CommandDefinition): Disposable;
    };

    readonly ui: {
      toast(
        message: string,
        tone?: "info" | "success" | "warning" | "error",
      ): void;
      confirm(options: {
        title: string;
        message: string;
        confirmLabel?: string;
        cancelLabel?: string;
      }): Promise<boolean>;
      /** Asks for a line of text. Resolves to `null` if cancelled. */
      prompt(options: {
        title: string;
        message?: string;
        defaultValue?: string;
        placeholder?: string;
      }): Promise<string | null>;
      /** Shows a form. Resolves to its values, or `null` if cancelled. */
      form(options: {
        title: string;
        fields: FormField[];
        values?: FormValues;
        submitLabel?: string;
      }): Promise<FormValues | null>;
      /** Adds a button to the top bar that runs one of this plugin's commands. */
      addNavbarButton(button: {
        command: string;
        /** An SVG icon. */
        icon: string;
        title?: string;
      }): Disposable;
      /** Adds an item to the field's right-click menu that runs a command. */
      addContextMenuItem(item: {
        command: string;
        label?: string;
        icon?: string;
      }): Disposable;
    };

    readonly settings: {
      /** The values of the settings declared in the manifest. */
      get(): FormValues;
    };

    /** Saved for this plugin on this computer, not in the project. */
    readonly storage: {
      get(key: string): Promise<JsonValue | undefined>;
      set(key: string, value: JsonValue): Promise<void>;
      delete(key: string): Promise<void>;
    };

    readonly project: {
      /** The open project. Cheap: it's kept up to date in the background. */
      get(): ProjectSnapshot;
      /** What the robot is planned to do and when. */
      plan(): Promise<Plan>;
      /** Saves data for this plugin in the project file. */
      setData(data: JsonValue): Promise<void>;
      /**
       * Changes the project. All of `ops` are applied together as one step
       * the user can undo, labelled with `label`.
       */
      edit(label: string, ops: EditOp[]): Promise<void>;
    };

    readonly playback: {
      seek(time: number): void;
      play(): void;
      pause(): void;
    };

    readonly events: {
      on<E extends keyof TurtleEvents>(
        event: E,
        listener: (payload: TurtleEvents[E]) => void,
      ): Disposable;
    };

    readonly field: {
      addLayer(layer: LayerDefinition): Layer;
    };

    /** Talks to this plugin's views (see `views` in the manifest). */
    readonly views: {
      post(view: string, message: JsonValue): void;
      onMessage(
        listener: (message: JsonValue, view: string) => void,
      ): Disposable;
    };

    readonly actions: {
      register(action: ActionTypeDefinition): Disposable;
    };

    readonly markers: {
      register(marker: MarkerTypeDefinition): Disposable;
    };

    readonly exporters: {
      register(exporter: ExporterDefinition): Disposable;
    };

    readonly simulators: {
      register(simulator: SimulatorDefinition): Disposable;
    };

    /** Needs the `files.pick` permission. */
    readonly files: {
      /** Asks the user to choose project files. Resolves to what they chose. */
      pickProjects(options?: { multiple?: boolean }): Promise<PickedProject[]>;
    };

    readonly projects: {
      /** Reads and times another project the way Turtle Tracer would. */
      analyze(file: PickedProject): Promise<AnalyzedProject>;
    };
  }

  // The API a plugin's view gets from `import { connect } from "turtle:view"`.
  // A view is an HTML page shown in a sandboxed frame: it has a DOM, canvas
  // and WebGL, but no network and no access to the rest of the app.

  /** Everything a view needs to draw the field. */
  interface ViewScene {
    project: ProjectSnapshot;
    plan: Plan;
    theme: "light" | "dark";
    /** The field image as a data URL, or null if there isn't one. */
    fieldImage: string | null;
  }

  /** Where the robot is right now. Sent every frame while it moves. */
  interface ViewFrame {
    time: number;
    playing: boolean;
    pose: Pose;
  }

  interface TurtleView {
    /** The view's name, from the manifest. */
    readonly name: string;
    /** The latest scene. */
    readonly scene: ViewScene;
    onScene(listener: (scene: ViewScene) => void): void;
    onFrame(listener: (frame: ViewFrame) => void): void;
    /** Messages from the plugin's main script (`turtle.views.post`). */
    onMessage(listener: (message: JsonValue) => void): void;
    /** Sends a message to the plugin's main script (`turtle.views.onMessage`). */
    post(message: JsonValue): void;
    seek(time: number): void;
    play(): void;
    pause(): void;
  }
}

/** The plugin API, in a plugin's main script. */
declare const turtle: Turtle.TurtleAPI;

declare module "turtle:view" {
  /** Connects a view to Turtle Tracer. Calling it again gives the same connection. */
  export function connect(): Promise<Turtle.TurtleView>;
}
