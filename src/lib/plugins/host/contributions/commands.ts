// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Commands, and the buttons and menu items that run them.
import {
  commandRegistry,
  fieldContextMenuRegistry,
  navbarActionRegistry,
} from "../../../registries";
import { sanitizeSvg } from "../sanitize";
import {
  check,
  commandSchema,
  contextMenuItemSchema,
  navbarButtonSchema,
} from "../schemas";
import type { ContributionFactory } from "./types";

/** Commands can run for this long before they count as stuck. */
export const COMMAND_TIMEOUT_MS = 5 * 60_000;

/**
 * Remembers which registration each of a plugin's commands came from, so
 * buttons can name commands by the plugin's own ids.
 */
export function createCommandTable() {
  const table = new Map<string, { registrationId: string; label: string }>();
  return {
    set: (id: string, registrationId: string, label: string) =>
      table.set(id, { registrationId, label }),
    get: (id: string) => table.get(id),
    delete: (id: string, registrationId: string) => {
      if (table.get(id)?.registrationId === registrationId) table.delete(id);
    },
  };
}

export type CommandTable = ReturnType<typeof createCommandTable>;

export const commandFactory =
  (commands: CommandTable): ContributionFactory =>
  (plugin, registrationId, definition) => {
    const command = check(commandSchema, definition, "command");
    commands.set(command.id, registrationId, command.label);
    const entryId = `plugin:${plugin.id}:${command.id}`;
    commandRegistry.register({
      id: entryId,
      label: command.label,
      category: plugin.manifest.name,
      owner: plugin.id,
      run: () => plugin.runCommand(command.id),
    });
    return {
      dispose() {
        commands.delete(command.id, registrationId);
        commandRegistry.unregister(entryId);
      },
    };
  };

export const navbarButtonFactory =
  (commands: CommandTable): ContributionFactory =>
  (plugin, registrationId, definition) => {
    const button = check(navbarButtonSchema, definition, "navbar button");
    const entryId = `plugin:${plugin.id}:${registrationId}`;
    navbarActionRegistry.register({
      id: entryId,
      owner: plugin.id,
      icon: sanitizeSvg(button.icon),
      title:
        button.title ??
        commands.get(button.command)?.label ??
        plugin.manifest.name,
      location: "right",
      onClick: () => plugin.runCommand(button.command),
    });
    return { dispose: () => navbarActionRegistry.unregister(entryId) };
  };

export const contextMenuItemFactory =
  (commands: CommandTable): ContributionFactory =>
  (plugin, registrationId, definition) => {
    const item = check(contextMenuItemSchema, definition, "context menu item");
    const entryId = `plugin:${plugin.id}:${registrationId}`;
    fieldContextMenuRegistry.register({
      id: entryId,
      owner: plugin.id,
      label: item.label ?? commands.get(item.command)?.label ?? item.command,
      icon: item.icon === undefined ? undefined : sanitizeSvg(item.icon),
      onClick: (at) => plugin.runCommand(item.command, { at }),
    });
    return { dispose: () => fieldContextMenuRegistry.unregister(entryId) };
  };
