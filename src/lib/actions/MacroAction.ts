// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { ActionDefinition } from "../actionRegistry";
import MacroTableRow from "../components/table/MacroTableRow.svelte";
import MacroSection from "../components/sections/MacroSection.svelte";

// Tailwind Safelist for dynamic classes:
// bg-purple-500 hover:bg-purple-600 dark:bg-purple-600 dark:hover:bg-purple-500 focus:ring-purple-200 dark:focus:ring-purple-500
// bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/30 border-purple-200 dark:border-purple-800/30

export const MacroAction: ActionDefinition = {
  kind: "macro",
  label: "Macro",
  buttonColor: "purple",
  isMacro: true,
  color: "#14b8a6", // Teal-500
  showInToolbar: false, // Macros are dragged in, not added via button
  component: MacroTableRow,
  sectionComponent: MacroSection,
  // renderField: Handled by line renderer (expanded lines) or other items inside macro
  // toJavaCode: Handled by flattener in codeExporter which expands macros
};
