// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { writable, get } from "svelte/store";
import type { ActionDefinition, SequenceItem } from "../types";
import { missingPluginAction } from "./actions/PluginStepAction";

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
    /** Removes the action types a plugin added. */
    removeOwner: (owner: string) => {
      update((state) =>
        Object.fromEntries(
          Object.entries(state).filter(([, a]) => a.owner !== owner),
        ),
      );
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

/** The registry key for an item: its kind, or a plugin step's type. */
export function actionKey(item: SequenceItem): string {
  return item.kind === "plugin" ? item.type : item.kind;
}

/**
 * The definition for a step. A plugin step whose plugin isn't installed (or
 * is off) gets a stand-in that keeps the step and its data as they are.
 */
export function actionFor(
  item: SequenceItem,
  registry: Record<string, ActionDefinition> = get(actionRegistry),
): ActionDefinition | undefined {
  const action = registry[actionKey(item)];
  if (!action && item.kind === "plugin") return missingPluginAction;
  return action;
}

export {
  type FieldRenderContext,
  type JavaCodeResult,
  type CodeExportContext,
  type TimeCalculationResult,
  type TimeCalculationContext,
  type InsertionContext,
  type ActionDefinition,
} from "../types";
