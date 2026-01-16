// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { writable } from "svelte/store";
import type { SvelteComponent } from "svelte";

// --- Component Registry ---
// Maps a string key (e.g., "Navbar", "FieldRenderer") to a Svelte component class.
export interface ComponentRegistryState {
  [key: string]: any;
}

const createComponentRegistry = () => {
  const { subscribe, update, set } = writable<ComponentRegistryState>({});

  return {
    subscribe,
    register: (name: string, component: any) => {
      update((state) => ({ ...state, [name]: component }));
    },
    get: (name: string) => {
      let component: any | undefined;
      subscribe((state) => {
        component = state[name];
      })();
      return component;
    },
    reset: () => set({}),
  };
};

export const componentRegistry = createComponentRegistry();

// --- Tab Registry ---
// Manages tabs in the ControlTab component.
export interface TabDefinition {
  id: string;
  label: string;
  component: any;
  icon?: string; // SVG string or image URL
  order?: number;
}

const createTabRegistry = () => {
  const { subscribe, update, set } = writable<TabDefinition[]>([]);

  return {
    subscribe,
    register: (tab: TabDefinition) => {
      update((tabs) => {
        // Remove existing tab with same id if any
        const filtered = tabs.filter((t) => t.id !== tab.id);
        const newTabs = [...filtered, tab];
        // Sort by order if provided, default to 0
        return newTabs.sort((a, b) => (a.order || 0) - (b.order || 0));
      });
    },
    unregister: (id: string) => {
      update((tabs) => tabs.filter((t) => t.id !== id));
    },
    reset: () => set([]),
  };
};

export const tabRegistry = createTabRegistry();

// --- Navbar Action Registry ---
// Manages extra buttons/actions in the Navbar.
export interface NavbarAction {
  id: string;
  icon: string; // SVG string
  title?: string;
  onClick: () => void;
  location?: "left" | "right" | "center"; // Where to place it (default right)
  order?: number;
}

const createNavbarActionRegistry = () => {
  const { subscribe, update, set } = writable<NavbarAction[]>([]);

  return {
    subscribe,
    register: (action: NavbarAction) => {
      update((actions) => {
        const filtered = actions.filter((a) => a.id !== action.id);
        const newActions = [...filtered, action];
        return newActions.sort((a, b) => (a.order || 0) - (b.order || 0));
      });
    },
    unregister: (id: string) => {
      update((actions) => actions.filter((a) => a.id !== id));
    },
    reset: () => set([]),
  };
};

export const navbarActionRegistry = createNavbarActionRegistry();

// --- Hook Registry ---
// Allows registering callbacks for specific named events (hooks).
// e.g., "onSave", "onLoad", "onProjectReset"
export type HookCallback = (...args: any[]) => void | Promise<void>;

const createHookRegistry = () => {
  const hooks = new Map<string, HookCallback[]>();

  return {
    register: (hookName: string, callback: HookCallback) => {
      if (!hooks.has(hookName)) {
        hooks.set(hookName, []);
      }
      hooks.get(hookName)!.push(callback);
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
  };
};

export const hookRegistry = createHookRegistry();
