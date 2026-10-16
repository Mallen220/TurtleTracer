// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// The open project, as the plugin host reads and changes it.
import { derived, get, type Readable } from "svelte/store";
import type { JsonValue, Plan } from "../api";
import {
  extraDataStore,
  linesStore,
  sequenceStore,
  settingsStore,
  shapesStore,
  startPointStore,
  timePredictionStore,
} from "../../projectStore";
import { currentFilePath } from "../../../stores";
import type { EditableProject } from "./edits";
import { buildPlan, type ProjectState } from "./snapshot";

export function readProjectState(): ProjectState {
  return {
    startPoint: get(startPointStore),
    lines: get(linesStore),
    shapes: get(shapesStore),
    sequence: get(sequenceStore),
    settings: get(settingsStore),
    extraData: get(extraDataStore),
    filePath: get(currentFilePath),
  };
}

/** Changes whenever anything a plugin can see in the project changes. */
export const projectChanges: Readable<unknown> = derived(
  [
    startPointStore,
    linesStore,
    shapesStore,
    sequenceStore,
    settingsStore,
    extraDataStore,
    currentFilePath,
  ],
  (values) => values,
);

let cachedPlan: { prediction: unknown; plan: Plan } | null = null;

/** The current plan, worked out again only when the timing changes. */
export function currentPlan(): Plan {
  const prediction = get(timePredictionStore);
  if (cachedPlan?.prediction !== prediction) {
    cachedPlan = {
      prediction,
      plan: buildPlan(readProjectState(), prediction),
    };
  }
  return cachedPlan.plan;
}

/** Puts an edited project back into the stores. */
export function writeProject(project: EditableProject) {
  startPointStore.set(project.startPoint);
  linesStore.set(project.lines);
  shapesStore.set(project.shapes);
  sequenceStore.set(project.sequence);
}

/** Saves a plugin's own data in the project (extraData.plugins[id]). */
export function writePluginData(pluginId: string, data: JsonValue) {
  extraDataStore.update((extra) => ({
    ...extra,
    plugins: { ...extra?.plugins, [pluginId]: data },
  }));
}
