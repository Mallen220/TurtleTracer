// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// `turtle`, the global object a plugin's main script uses. The script runs
// in its own worker: it has no DOM and no network, and everything it does
// goes through this object.
import type {
  AnalyzedProject,
  EditOp,
  FieldPoint,
  JsonValue,
  PickedProject,
  Plan,
  PlanStep,
  Pose,
  PoseTrack,
  ProjectSnapshot,
} from "./data";
import type { FieldPrimitive } from "./field";
import type { FormField, FormValues } from "./forms";

/** Returned by everything that adds something; call `dispose` to take it away again. */
export interface Disposable {
  dispose(): void;
}

// --- Commands ---

export interface CommandDefinition {
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

export interface LayerDefinition {
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

export interface Layer extends Disposable {
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
export interface PluginStep {
  id: string;
  type: string;
  name: string;
  data: FormValues;
}

/** How long an action takes, from `ActionTypeDefinition.time`. */
export interface ActionTiming {
  seconds: number;
  /** The heading the robot ends at, if the action turns it. */
  endHeading?: number;
  /**
   * Where the robot goes during the action, if it moves. Times start at 0.
   * The robot ends the action at the last pose.
   */
  poses?: PoseTrack;
}

export interface ActionTypeDefinition {
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

export interface MarkerTypeDefinition {
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

export interface ExporterDefinition {
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

export interface SimulationResult {
  /** Where the simulated robot goes, from time 0. */
  poses: PoseTrack;
  /** Things worth pointing out, shown in the simulation menu. */
  notes?: { time: number; text: string; level?: "info" | "warning" }[];
}

export interface SimulatorDefinition {
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

export interface PlaybackState {
  /** Seconds into the routine. */
  time: number;
  duration: number;
  playing: boolean;
}

export interface TurtleEvents {
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

export interface TurtleAPI {
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
    onMessage(listener: (message: JsonValue, view: string) => void): Disposable;
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
