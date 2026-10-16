// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Lists of things the UI shows that can come from the app or from plugins:
// control tabs, navbar buttons, context menu items, dialogs, commands, field
// layers and views, and themes. Components read them like any other store.
import { writable, get } from "svelte/store";
import type { Component } from "svelte";
import type {
  ContextMenuItem,
  EventMarker,
  FieldPrimitive,
  NavbarAction,
  PoseTrack,
} from "../types";
import type { FormField } from "./plugins/api";

/** Who added an entry: a plugin's id, or nothing for the app itself. */
export interface Owned {
  owner?: string;
}

/**
 * A store holding a list of entries with unique ids. Registering an id again
 * replaces the old entry. `removeOwner` takes out everything one plugin
 * added and leaves the rest alone.
 */
export function createRegistry<T extends { id: string } & Owned>(
  sort?: (a: T, b: T) => number,
) {
  const store = writable<T[]>([]);

  return {
    subscribe: store.subscribe,
    register(entry: T) {
      store.update((entries) => {
        const next = [...entries.filter((e) => e.id !== entry.id), entry];
        return sort ? next.sort(sort) : next;
      });
    },
    unregister(id: string) {
      store.update((entries) => entries.filter((e) => e.id !== id));
    },
    removeOwner(owner: string) {
      store.update((entries) =>
        entries.some((e) => e.owner === owner)
          ? entries.filter((e) => e.owner !== owner)
          : entries,
      );
    },
    getAll: (): T[] => get(store),
    /** Empties the registry. For tests. */
    reset: () => store.set([]),
  };
}

export type Registry<T extends { id: string } & Owned> = ReturnType<
  typeof createRegistry<T>
>;

const byOrder = (a: { order?: number }, b: { order?: number }) =>
  (a.order ?? 0) - (b.order ?? 0);

// --- Control tabs ---
export interface TabDefinition extends Owned {
  id: string;
  label: string;
  component: Component<any>;
  props?: Record<string, unknown>;
  icon?: string; // SVG string or image URL
  iconComponent?: Component<any>;
  order?: number;
}

export const tabRegistry = createRegistry<TabDefinition>(byOrder);

// --- Navbar buttons ---
export const navbarActionRegistry = createRegistry<NavbarAction & Owned>(
  byOrder,
);

// --- Field right-click menu ---
export const fieldContextMenuRegistry = createRegistry<
  ContextMenuItem & Owned
>();

// --- Dialogs shown on top of the app ---
export interface DialogDefinition extends Owned {
  id: string;
  component: Component<any>;
  props?: Record<string, unknown>;
}

export const dialogRegistry = createRegistry<DialogDefinition>();

// --- Commands, for the command palette ---
export interface PaletteCommand extends Owned {
  id: string;
  label: string;
  category?: string;
  run: () => void;
}

export const commandRegistry = createRegistry<PaletteCommand>();

// --- Extra drawings on the field ---
export interface FieldLayerDefinition extends Owned {
  id: string;
  /** What to draw, in field inches. Checked before it gets here. */
  primitives: readonly FieldPrimitive[];
  /** Pose tracks the primitives can follow during playback, by name. */
  tracks: Readonly<Record<string, PoseTrack>>;
  /** Called when one of the primitives with an `id` is clicked. */
  onClick?: (primitiveId: string, field: { x: number; y: number }) => void;
}

export const fieldLayerRegistry = createRegistry<FieldLayerDefinition>();

// --- Other ways of showing the field (a 3D view, say) ---
export interface FieldViewDefinition extends Owned {
  id: string;
  title: string;
  component: Component<any>;
  props?: Record<string, unknown>;
}

export const fieldViewRegistry = createRegistry<FieldViewDefinition>();

// --- Event marker types beyond the built-in ones ---
export interface MarkerTypeDefinition extends Owned {
  /** Saved as the marker's `pluginType`. */
  id: string;
  label: string;
  fields: FormField[];
  /**
   * When the marker fires, in seconds after its step starts, or null to
   * leave it where it is. Asked again when the project or its timing changes.
   */
  resolve: (marker: EventMarker, stepId: string) => Promise<number | null>;
}

export const markerTypeRegistry = createRegistry<MarkerTypeDefinition>();

// --- Simulators: what a real robot would do with the plan ---
export interface SimulationNote {
  time: number;
  text: string;
  level?: "info" | "warning";
}

export interface SimulatorDefinition extends Owned {
  id: string;
  label: string;
  simulate: () => Promise<{ poses: PoseTrack; notes?: SimulationNote[] }>;
}

export const simulatorRegistry = createRegistry<SimulatorDefinition>();

// --- Themes ---
export interface ThemeDefinition extends Owned {
  id: string;
  name: string;
  css: string;
}

export const themeRegistry = createRegistry<ThemeDefinition>();

// --- Hooks ---
// Callbacks for named moments: "onSave" and "onLoad" get the project data.
export type HookCallback = (...args: any[]) => void | Promise<void>;

const createHookRegistry = () => {
  const hooks = new Map<string, HookCallback[]>();

  return {
    register: (hookName: string, callback: HookCallback) => {
      if (!hooks.has(hookName)) {
        hooks.set(hookName, []);
      }
      hooks.get(hookName)!.push(callback);
      return () => {
        const list = hooks.get(hookName);
        if (list)
          hooks.set(
            hookName,
            list.filter((cb) => cb !== callback),
          );
      };
    },
    run: async (hookName: string, ...args: any[]) => {
      const callbacks = hooks.get(hookName);
      if (callbacks) {
        for (const cb of callbacks) {
          try {
            await cb(...args);
          } catch (e) {
            console.error(`Error running hook ${hookName}:`, e);
          }
        }
      }
    },
    clear: () => hooks.clear(),
    reset: () => hooks.clear(), // Alias for consistency
  };
};

export const hookRegistry = createHookRegistry();

export { type ContextMenuItem } from "../types";
