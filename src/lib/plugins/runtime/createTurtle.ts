// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Builds the `turtle` object a plugin's main script uses (api/turtle.ts).
// It runs in the plugin's sandbox. Registrations keep their functions here
// and send the app plain data plus the names of the functions it may call
// back ("run", "code.sequential", ...).
import type {
  Disposable,
  FormValues,
  Layer,
  LayerDefinition,
  ProjectSnapshot,
  TurtleAPI,
  TurtleEvents,
} from "../api";
import type { Rpc } from "../protocol/rpc";
import type { ContributionKind, RuntimeInit } from "../protocol/runtime";

type Listener = (payload: any) => void;

/**
 * Splits a definition into the data the app gets and the paths of the
 * functions in it. Only plain objects are searched for functions.
 */
export function splitDefinition(definition: object): {
  data: Record<string, unknown>;
  callbacks: string[];
} {
  const callbacks: string[] = [];
  const walk = (value: Record<string, unknown>, prefix: string) => {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === "function") {
        callbacks.push(prefix + key);
      } else if (
        item !== null &&
        typeof item === "object" &&
        Object.getPrototypeOf(item) === Object.prototype
      ) {
        out[key] = walk(item as Record<string, unknown>, `${prefix}${key}.`);
      } else {
        out[key] = item;
      }
    }
    return out;
  };
  return { data: walk(definition as Record<string, unknown>, ""), callbacks };
}

/** Finds `path` ("code.sequential") in a definition. */
function memberAt(definition: object, path: string): unknown {
  let value: unknown = definition;
  for (const key of path.split(".")) {
    if (value === null || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

export interface Runtime {
  turtle: TurtleAPI;
  /** Answers the app's calls. */
  handleCall(method: string, args: unknown[]): unknown;
  /** Handles the app's notifications. */
  handleNotify(method: string, args: unknown[]): void;
}

export function createRuntime(rpc: Rpc, init: RuntimeInit): Runtime {
  let project: ProjectSnapshot = init.project;
  let settings: FormValues = init.settings;
  let nextId = 0;
  const registrations = new Map<string, object>();
  const listeners = new Map<string, Set<Listener>>();
  const layers = new Map<
    string,
    { definition: LayerDefinition; draw(): void }
  >();
  const viewListeners = new Set<(message: any, view: string) => void>();

  function reportError(error: unknown) {
    const text =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    rpc.notify("error", [text]);
  }

  function emit(event: string, payload: unknown) {
    for (const listener of listeners.get(event) ?? []) {
      try {
        listener(payload);
      } catch (error) {
        reportError(error);
      }
    }
  }

  function register(
    kind: ContributionKind,
    definition: object,
  ): Disposable & { id: string } {
    if (definition === null || typeof definition !== "object") {
      throw new TypeError(`A ${kind} must be an object.`);
    }
    const id = `${kind}:${++nextId}`;
    const { data, callbacks } = splitDefinition(definition);
    registrations.set(id, definition);
    try {
      rpc.notify("register", [kind, id, data, callbacks]);
    } catch (error) {
      registrations.delete(id);
      throw new TypeError(
        `This ${kind} contains something that can't be sent to Turtle Tracer (only plain data and functions can be): ${error}`,
      );
    }
    return {
      id,
      dispose() {
        if (!registrations.delete(id)) return;
        layers.delete(id);
        rpc.notify("unregister", [id]);
      },
    };
  }

  function addLayer(definition: LayerDefinition): Layer {
    if (typeof definition?.draw !== "function") {
      throw new TypeError("A layer needs a draw() function.");
    }
    const { id, dispose } = register("layer", definition);
    const layer = {
      definition,
      draw() {
        let primitives: unknown;
        try {
          primitives = definition.draw();
        } catch (error) {
          reportError(error);
          return;
        }
        rpc.notify("layer.draw", [id, primitives]);
      },
    };
    layers.set(id, layer);
    layer.draw();
    return {
      redraw: () => layers.get(id)?.draw(),
      setTrack(name, track) {
        if (layers.has(id)) rpc.notify("layer.track", [id, name, track]);
      },
      dispose,
    };
  }

  function redrawLayers(reason: "project" | "playback") {
    for (const { definition, draw } of layers.values()) {
      const redrawOn = definition.redrawOn ?? {};
      const wanted =
        reason === "project"
          ? redrawOn.project !== false
          : redrawOn.playback === true;
      if (wanted) draw();
    }
  }

  function wantsPlayback() {
    return (
      (listeners.get("playback")?.size ?? 0) > 0 ||
      [...layers.values()].some((l) => l.definition.redrawOn?.playback)
    );
  }

  function on(event: string, listener: Listener): Disposable {
    if (typeof listener !== "function") {
      throw new TypeError("events.on needs a listener function.");
    }
    const set = listeners.get(event) ?? new Set<Listener>();
    listeners.set(event, set);
    set.add(listener);
    if (event === "playback") rpc.notify("subscribe", ["playback", true]);
    return {
      dispose() {
        set.delete(listener);
        if (event === "playback" && !wantsPlayback()) {
          rpc.notify("subscribe", ["playback", false]);
        }
      },
    };
  }

  const turtle: TurtleAPI = {
    plugin: Object.freeze({ ...init.plugin }),
    commands: {
      register: (command) => publicOnly(register("command", command)),
    },
    ui: {
      toast: (message, tone = "info") =>
        rpc.notify("ui.toast", [String(message), tone]),
      confirm: (options) =>
        rpc.call("ui.confirm", [options]) as Promise<boolean>,
      prompt: (options) =>
        rpc.call("ui.prompt", [options]) as Promise<string | null>,
      form: (options) =>
        rpc.call("ui.form", [options]) as Promise<FormValues | null>,
      addNavbarButton: (button) => publicOnly(register("navbarButton", button)),
      addContextMenuItem: (item) =>
        publicOnly(register("contextMenuItem", item)),
    },
    settings: {
      get: () => ({ ...settings }),
    },
    storage: {
      get: (key) => rpc.call("storage.get", [key]) as Promise<any>,
      set: (key, value) =>
        rpc.call("storage.set", [key, value]) as Promise<void>,
      delete: (key) =>
        rpc.call("storage.set", [key, undefined]) as Promise<void>,
    },
    project: {
      get: () => project,
      plan: () => rpc.call("project.plan") as Promise<any>,
      setData: (data) => rpc.call("project.setData", [data]) as Promise<void>,
      edit: (label, ops) =>
        rpc.call("project.edit", [label, ops]) as Promise<void>,
    },
    playback: {
      seek: (time) => rpc.notify("playback.seek", [time]),
      play: () => rpc.notify("playback.play"),
      pause: () => rpc.notify("playback.pause"),
    },
    events: {
      on: <E extends keyof TurtleEvents>(
        event: E,
        listener: (payload: TurtleEvents[E]) => void,
      ) => on(event, listener),
    },
    field: { addLayer },
    views: {
      post: (view, message) => rpc.notify("views.post", [view, message]),
      onMessage(listener) {
        viewListeners.add(listener);
        return { dispose: () => void viewListeners.delete(listener) };
      },
    },
    actions: { register: (action) => publicOnly(register("action", action)) },
    markers: { register: (marker) => publicOnly(register("marker", marker)) },
    exporters: {
      register: (exporter) => publicOnly(register("exporter", exporter)),
    },
    simulators: {
      register: (simulator) => publicOnly(register("simulator", simulator)),
    },
    files: {
      pickProjects: (options) =>
        rpc.call("files.pickProjects", [options ?? {}]) as Promise<any>,
    },
    projects: {
      analyze: (file) => rpc.call("projects.analyze", [file]) as Promise<any>,
    },
  };

  return {
    turtle: deepFreeze(turtle),

    async handleCall(method, args) {
      if (method === "ping") return "pong";
      if (method !== "invoke") throw new Error(`Unknown call "${method}"`);
      const [id, path, ...rest] = args as [string, string, ...unknown[]];
      const definition = registrations.get(id);
      const member = definition && memberAt(definition, path);
      if (typeof member !== "function") {
        throw new Error(`Nothing to call at ${id} ${path}`);
      }
      return await member(...rest);
    },

    handleNotify(method, args) {
      switch (method) {
        case "project":
          project = args[0] as ProjectSnapshot;
          redrawLayers("project");
          emit("projectChanged", project);
          break;
        case "event": {
          const [event, payload] = args as [string, unknown];
          if (event === "projectLoaded" || event === "projectSaved") {
            project = payload as ProjectSnapshot;
          }
          if (event === "playback") redrawLayers("playback");
          emit(event, payload);
          break;
        }
        case "settings":
          settings = args[0] as FormValues;
          emit("settingsChanged", { ...settings });
          break;
        case "views.message": {
          const [view, message] = args as [string, unknown];
          for (const listener of viewListeners) {
            try {
              listener(message, view);
            } catch (error) {
              reportError(error);
            }
          }
          break;
        }
      }
    },
  };
}

/** What plugins get back from a registration: just `dispose`. */
function publicOnly({ dispose }: Disposable): Disposable {
  return { dispose };
}

function deepFreeze<T extends object>(value: T): T {
  for (const item of Object.values(value)) {
    if (item && typeof item === "object" && !Object.isFrozen(item)) {
      deepFreeze(item);
    }
  }
  return Object.freeze(value);
}
