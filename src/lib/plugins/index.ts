// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// What the rest of the app uses to run plugins. Plugins are a desktop-only
// feature used by a few people, so the host (and zod with it) is loaded only
// once a plugin is turned on or the plugin manager is opened.
import { getElectronAPI } from "../../utils/platform";
import { setAppBridge, type AppBridge } from "./bridge";

export type { AppBridge } from "./bridge";

/** Whether this build can run plugins (the desktop app can; browsers can't). */
export function pluginsSupported(): boolean {
  return Boolean(getElectronAPI({ allowVirtual: false })?.plugins);
}

/** Loads the plugin host. */
export async function loadPluginHost() {
  const { pluginHost } = await import("./host/PluginHost");
  return pluginHost;
}

/**
 * Called once by App at startup. Starts the plugins that are on; with none
 * on, nothing more is loaded.
 */
export async function startPlugins(bridge: AppBridge) {
  setAppBridge(bridge);
  const plugins = getElectronAPI({ allowVirtual: false })?.plugins;
  if (!plugins) return;
  try {
    if (!(await plugins.anyEnabled())) return;
    await (await loadPluginHost()).startEnabled();
  } catch (error) {
    console.error("Couldn't start plugins:", error);
  }
}
