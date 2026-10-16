// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { registerDefaultControlTabs } from "./ControlTab.svelte";
import { actionRegistry } from "./actionRegistry";
import { WaitAction } from "./actions/WaitAction";
import { RotateAction } from "./actions/RotateAction";
import { MacroAction } from "./actions/MacroAction";
import { PathAction } from "./actions/PathAction";

// Import built-in exporters to register them
import "./exporters/javaExporter";
import "./exporters/pointsExporter";
import "./exporters/sequentialExporter";

// Registers the built-in tabs and actions. Safe to call more than once;
// registries replace entries with the same id.
export const registerCoreUI = () => {
  registerDefaultControlTabs();

  // Register Core Actions
  actionRegistry.register(PathAction);
  actionRegistry.register(WaitAction);
  actionRegistry.register(RotateAction);
  actionRegistry.register(MacroAction);
};
