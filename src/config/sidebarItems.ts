// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.

export type SidebarItemType = 'system' | 'setting' | 'separator' | 'spacer';

export interface SidebarItemConfig {
  id: string;
  label: string;
  type: SidebarItemType;
  settingKey?: string; // e.g. "showRobotArrows"
  iconSvg?: string; // For auto-rendered 'setting' types
  shortcutKey?: string; // to look up in keybindings
}

export const SIDEBAR_ITEMS: SidebarItemConfig[] = [
  // System items (rendered with custom logic in LeftSidebar)
  { id: "fileManager", label: "File Manager", type: "system", shortcutKey: "toggle-file-manager" },
  { id: "undo", label: "Undo", type: "system", shortcutKey: "undo" },
  { id: "history", label: "History", type: "system", shortcutKey: "toggle-history" },
  { id: "redo", label: "Redo", type: "system", shortcutKey: "redo" },
  { id: "ruler", label: "Ruler", type: "system", shortcutKey: "toggle-ruler" },
  { id: "protractor", label: "Protractor", type: "system", shortcutKey: "toggle-protractor" },
  { id: "grid", label: "Grid & Snap", type: "system", shortcutKey: "toggle-grid" },
  { id: "onionSkin", label: "Onion Skin", type: "system", shortcutKey: "toggle-onion" },
  { id: "velocityHeatmap", label: "Velocity Heatmap", type: "system" },
  { id: "newPath", label: "New Path", type: "system", shortcutKey: "new-file" },
  { id: "settings", label: "Settings Menu", type: "system", shortcutKey: "open-settings" },
  { id: "feedback", label: "Feedback", type: "system" },
  { id: "github", label: "GitHub Repo", type: "system" },

  // Structural items
  { id: "separator", label: "Separator", type: "separator" },
  { id: "spacer", label: "Spacer (Flexible Space)", type: "spacer" },

  // Setting Toggles (Rendered generically)
  {
    id: "showRobotArrows",
    label: "Show Robot Arrows",
    type: "setting",
    settingKey: "showRobotArrows",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`
  },
  {
    id: "showFakeHeadingArrow",
    label: "Show Fake Heading Arrow",
    type: "setting",
    settingKey: "showFakeHeadingArrow",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4"><path d="M12 2L2 22h20L12 2z"></path></svg>`
  },
  {
    id: "validateFieldBoundaries",
    label: "Validate Field Boundaries",
    type: "setting",
    settingKey: "validateFieldBoundaries",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`
  },
  {
    id: "continuousValidation",
    label: "Continuous Validation",
    type: "setting",
    settingKey: "continuousValidation",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`
  },
  {
    id: "restrictDraggingToField",
    label: "Restrict Dragging To Field",
    type: "setting",
    settingKey: "restrictDraggingToField",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="12" cy="12" r="3"></circle></svg>`
  },
  {
    id: "smartSnapping",
    label: "Smart Snapping",
    type: "setting",
    settingKey: "smartSnapping",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M12 12v9"></path></svg>`
  },
  {
    id: "showDebugSequence",
    label: "Show Debug Sequence",
    type: "setting",
    settingKey: "showDebugSequence",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path></svg>`
  },
  {
    id: "autoExportCode",
    label: "Auto Export Code",
    type: "setting",
    settingKey: "autoExportCode",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`
  },
  {
    id: "followRobot",
    label: "Follow Robot",
    type: "setting",
    settingKey: "followRobot",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>`
  },
  {
    id: "showTelemetryTab",
    label: "Show Telemetry Tab",
    type: "setting",
    settingKey: "showTelemetryTab",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>`
  }
];
