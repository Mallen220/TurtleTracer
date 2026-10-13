// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { ActionDefinition } from "../actionRegistry";
import MacroTableRow from "../components/table/MacroTableRow.svelte";
import MacroSection from "../components/sections/MacroSection.svelte";

// Tailwind Safelist for dynamic classes:
// bg-teal-500 hover:bg-teal-600 dark:bg-teal-600 dark:hover:bg-teal-500 focus:ring-teal-200 dark:focus:ring-teal-500
// bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-900/30 border-teal-200 dark:border-teal-800/30

export const MacroAction: ActionDefinition = {
  kind: "macro",
  label: "Macro",
  buttonColor: "teal",
  isMacro: true,
  color: "#14b8a6", // Teal-500
  showInToolbar: false, // Macros are dragged in, not added via button
  component: MacroTableRow,
  sectionComponent: MacroSection,
  // renderField: Handled by line renderer (expanded lines) or other items inside macro
  // toJavaCode: Handled by flattener in codeExporter which expands macros
};
