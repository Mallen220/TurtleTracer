// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { writable, get } from "svelte/store";
import type { TurtleData } from "../../types/index";

export interface Exporter {
  id: string; // The unique id used for the format (e.g., 'java', 'sequential', 'points')
  name: string; // Display name
  description?: string; // Description of the export format
  exportCode: (data: TurtleData, settings: any) => Promise<string> | string; // Generation function
  /** The plugin that added it; built-in exporters have none. */
  owner?: string;
  /** File extension to save as, without the dot. Defaults to txt. */
  extension?: string;
  /** How to highlight the output. Defaults to plain text. */
  language?: "java" | "json" | "plaintext";
}

const createExporterRegistry = () => {
  const { subscribe, update, set } = writable<Record<string, Exporter>>({});

  return {
    subscribe,
    register: (exporter: Exporter) => {
      update((state) => ({ ...state, [exporter.id]: exporter }));
    },
    unregister: (id: string) => {
      update((state) => {
        const newState = { ...state };
        delete newState[id];
        return newState;
      });
    },
    get: (id: string): Exporter | undefined => {
      const state = get({ subscribe });
      return state[id];
    },
    getAll: (): Exporter[] => {
      const state = get({ subscribe });
      return Object.values(state);
    },
    removeOwner: (owner: string) => {
      update((state) =>
        Object.fromEntries(
          Object.entries(state).filter(([, e]) => e.owner !== owner),
        ),
      );
    },
    reset: () => set({}),
  };
};

export const exporterRegistry = createExporterRegistry();
