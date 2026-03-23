// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { registerAppHandlers } from "./appHandlers.js";
import { registerDirectoryHandlers } from "./directoryHandlers.js";
import { registerFileHandlers } from "./fileHandlers.js";
import { registerGitHandlers } from "./gitHandlers.js";
import { registerPluginHandlers } from "./pluginHandlers.js";
import { registerTelemetryHandlers } from "./telemetryHandlers.js";

export function registerIpcHandlers(state) {
  registerAppHandlers(state);
  registerDirectoryHandlers();
  registerFileHandlers();
  registerGitHandlers();
  registerPluginHandlers();
  registerTelemetryHandlers();
}
