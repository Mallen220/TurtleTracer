// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// The calls a plugin can make that need an answer (api/turtle.ts). Each
// checks its arguments and the plugin's permissions before doing anything.
import { z } from "zod";
import { actionRegistry } from "../../actionRegistry";
import { isUnsaved } from "../../../stores";
import { applyEdits } from "./edits";
import { readProjectState, writePluginData, writeProject } from "./project";
import type { RunningPlugin } from "./RunningPlugin";
import {
  check,
  confirmOptionsSchema,
  editOpsSchema,
  formOptionsSchema,
  jsonSchema,
  pickedProjectSchema,
  promptOptionsSchema,
} from "./schemas";
import type { PluginServices } from "./services";

const keySchema = z.string().min(1).max(200);
const labelSchema = z.string().max(120);

/** One dialog per plugin at a time, so a plugin can't bury the user in them. */
const openDialogs = new Set<string>();

async function oneDialog<T>(plugin: RunningPlugin, show: () => Promise<T>) {
  if (openDialogs.has(plugin.id)) {
    throw new Error("This plugin already has a dialog open.");
  }
  openDialogs.add(plugin.id);
  try {
    return await show();
  } finally {
    openDialogs.delete(plugin.id);
  }
}

export async function handleCall(
  plugin: RunningPlugin,
  services: PluginServices,
  method: string,
  args: unknown[],
): Promise<unknown> {
  switch (method) {
    case "ui.confirm": {
      const options = check(confirmOptionsSchema, args[0], "confirm options");
      return oneDialog(plugin, () =>
        services.dialogs(plugin.manifest.name).confirm(options),
      );
    }
    case "ui.prompt": {
      const options = check(promptOptionsSchema, args[0], "prompt options");
      return oneDialog(plugin, () =>
        services.dialogs(plugin.manifest.name).prompt(options),
      );
    }
    case "ui.form": {
      const options = check(formOptionsSchema, args[0], "form options");
      return oneDialog(plugin, () =>
        services.dialogs(plugin.manifest.name).form(options),
      );
    }
    case "storage.get":
      return services.storageGet(plugin.id, check(keySchema, args[0], "key"));
    case "storage.set": {
      const key = check(keySchema, args[0], "key");
      const value =
        args[1] === undefined ? undefined : check(jsonSchema, args[1], "value");
      return services.storageSet(plugin.id, key, value);
    }
    case "project.plan":
      return services.plan();
    case "project.setData": {
      const data = check(jsonSchema, args[0], "project data");
      writePluginData(plugin.id, data);
      // Saved with the project, but not an undo step (like strategy notes).
      isUnsaved.set(true);
      return undefined;
    }
    case "project.edit": {
      const label = check(labelSchema, args[0], "label");
      const ops = check(editOpsSchema, args[1], "edit");
      const edited = applyEdits(readProjectState(), ops, {
        pluginId: plugin.id,
        canWrite: plugin.canWrite,
        actionDefaults: (type) => {
          const step = actionRegistry.get(type)?.createDefault?.();
          return step?.kind === "plugin" ? step.data : null;
        },
      });
      writeProject(edited);
      services
        .bridge()
        .recordChange(
          label ? `${plugin.manifest.name}: ${label}` : plugin.manifest.name,
        );
      return undefined;
    }
    case "files.pickProjects": {
      if (!plugin.manifest.permissions?.includes("files.pick")) {
        throw new Error(
          'Picking files needs the "files.pick" permission in plugin.json.',
        );
      }
      const multiple =
        (args[0] as { multiple?: unknown } | undefined)?.multiple === true;
      return services.pickProjects(multiple);
    }
    case "projects.analyze":
      return services.analyze(check(pickedProjectSchema, args[0], "project"));
    default:
      throw new Error(`Unknown call "${method}".`);
  }
}
