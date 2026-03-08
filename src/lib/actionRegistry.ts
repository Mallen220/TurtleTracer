// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { writable, get } from "svelte/store";
import type {
  ActionDefinition,
  FieldRenderContext,
  CodeExportContext,
  JavaCodeResult,
  TimeCalculationContext,
  TimeCalculationResult,
  InsertionContext,
} from "../types";

const createActionRegistry = () => {
  const { subscribe, update, set } = writable<Record<string, ActionDefinition>>(
    {},
  );

  return {
    subscribe,
    register: (action: ActionDefinition) => {
      update((state) => ({ ...state, [action.kind]: action }));
    },
    unregister: (kind: string) => {
      update((state) => {
        const newState = { ...state };
        delete newState[kind];
        return newState;
      });
    },
    get: (kind: string): ActionDefinition | undefined => {
      const state = get({ subscribe });
      return state[kind];
    },
    getAll: (): ActionDefinition[] => {
      const state = get({ subscribe });
      return Object.values(state);
    },
    reset: () => set({}),
  };
};

export const actionRegistry = createActionRegistry();

export type {
  ActionDefinition,
  FieldRenderContext,
  CodeExportContext,
  JavaCodeResult,
  TimeCalculationContext,
  TimeCalculationResult,
  InsertionContext,
};
