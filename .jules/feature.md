# Project Journal

## 2024-05-22 - Initial Journal Creation

**Learning:** This journal tracks critical codebase learnings, constraints, and failed ideas to guide future feature development.
**Action:** Consult this file before starting new features to avoid repeating past mistakes.

## 2024-05-22 - Command Palette Integration

**Learning:** Adding a command palette is a highly extensible pattern for this application. Since `KeyboardShortcuts.svelte` already acts as a central hub for actions and keybindings, linking it to a visual palette in `App.svelte` was straightforward. However, duplicate keybindings in `defaults.ts` need careful management to avoid conflicts.
**Action:** When adding future features, consider exposing them via the Command Palette by adding an entry to the `commands` array in `App.svelte` and potentially a keybinding in `defaults.ts`.
