// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Steps of action types that plugins add (kind "plugin"). The plugin host
// registers a definition for each type; this file has the parts every such
// type shares, and the stand-in for steps whose plugin isn't there, which
// keeps them (and their data) in the project untouched.
import type {
  ActionDefinition,
  FormField,
  SequenceItem,
  SequencePluginItem,
} from "../../types";
import PluginStepRow from "../components/table/PluginStepRow.svelte";
import PluginStepSection from "../components/sections/PluginStepSection.svelte";
import { libraryForContext } from "../exporters/commandLibraries";

/** The plugin a step type belongs to: `intake-action.intake` → `intake-action`. */
export const pluginOfType = (type: string) => type.split(".")[0];

/** A step's starting data: each field's default. */
export function defaultsFor(fields: readonly FormField[] = []) {
  const data: Record<string, string | number | boolean> = {};
  for (const field of fields) {
    if (field.default !== undefined) data[field.key] = field.default;
    else if (field.type === "number") data[field.key] = field.min ?? 0;
    else if (field.type === "toggle") data[field.key] = false;
    else if (field.type === "select")
      data[field.key] = field.options[0]?.value ?? "";
    else if (field.type === "color") data[field.key] = "#22c55e";
    else data[field.key] = "";
  }
  return data;
}

/** Text explaining why a step was left out of exported code. */
export function skippedStepNote(item: SequencePluginItem) {
  const name = item.name ? `"${item.name}"` : "a step";
  return `Skipped ${name}: it needs the ${pluginOfType(item.type)} plugin.`;
}

/** Shared by every plugin action type, installed or not. */
export const pluginStepBase = {
  component: PluginStepRow,
  sectionComponent: PluginStepSection,
} satisfies Partial<ActionDefinition>;

/** Stands in for a step whose plugin isn't installed or is turned off. */
export const missingPluginAction: ActionDefinition = {
  ...pluginStepBase,
  kind: "plugin",
  label: "Plugin step",
  color: "#737373",
  missing: true,
  showInToolbar: false,

  // It takes no time and draws nothing, but stays in the sequence.
  calculateTime: () => ({ events: [], duration: 0 }),

  toJavaCode: (item: SequenceItem) => ({
    code: `
        // ${skippedStepNote(item as SequencePluginItem)}`,
    stepsUsed: 0,
  }),

  toSequentialCommand: (item: SequenceItem, context) =>
    libraryForContext(context).commands.instant(
      `{ /* ${skippedStepNote(item as SequencePluginItem)} */ }`,
    ),
};
