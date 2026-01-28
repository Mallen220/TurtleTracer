// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { componentRegistry } from "./registries";
import Navbar from "./Navbar.svelte";
import FieldRenderer from "./components/FieldRenderer.svelte";
import ControlTab, { registerDefaultControlTabs } from "./ControlTab.svelte";
import { actionRegistry } from "./actionRegistry";
import { WaitAction } from "./actions/WaitAction";
import { RotateAction } from "./actions/RotateAction";
import { MacroAction } from "./actions/MacroAction";
import { PathAction } from "./actions/PathAction";

// Registers built-in components and tabs. Safe to call multiple times; registries dedupe by id.
export const registerCoreUI = () => {
  componentRegistry.register("Navbar", Navbar);
  componentRegistry.register("FieldRenderer", FieldRenderer);
  componentRegistry.register("ControlTab", ControlTab);

  // Tabs live inside ControlTab; ensure defaults are present after registry resets.
  registerDefaultControlTabs();

  // Register Core Actions
  actionRegistry.register(PathAction);
  actionRegistry.register(WaitAction);
  actionRegistry.register(RotateAction);
  actionRegistry.register(MacroAction);
};
