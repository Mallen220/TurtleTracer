// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
export type SidebarItemType = "system" | "setting" | "separator" | "spacer";

import {
  StarIcon,
  FolderIcon,
  PlusIcon,
  WrenchIcon,
  UndoIcon,
  RedoIcon,
  HistoryIcon,
  RulerIcon,
  ProtractorIcon,
  GridIcon,
  OnionSkinIcon,
  VelocityHeatmapIcon,
  FeedbackIcon,
  GithubIcon,
  ShowRobotIcon,
  ShowRobotArrowsIcon,
  ShowFakeHeadingArrowIcon,
  ValidateFieldBoundariesIcon,
  ContinuousValidationIcon,
  RestrictDraggingToFieldIcon,
  SmartSnappingIcon,
  ShowDebugSequenceIcon,
  AutoExportCodeIcon,
  FollowRobotIcon,
  ShowTelemetryTabIcon,
  PresentationModeIcon,
  PluginManagerIcon,
  RestartTutorialIcon,
  ExportImageIcon,
  ExportGifIcon,
} from "../lib/components/icons";

export interface SidebarItemConfig {
  id: string;
  label: string;
  type: SidebarItemType;
  settingKey?: string; // e.g. "showRobotArrows"
  iconSvg?: string; // For auto-rendered 'setting' types (SVG markup)
  iconComponent?: any; // Svelte component constructor for imported icons
  shortcutKey?: string; // to look up in keybindings
}

export const SIDEBAR_ITEMS: SidebarItemConfig[] = [
  // System items (rendered with custom logic in LeftSidebar)
  {
    id: "fileManager",
    label: "File Manager",
    type: "system",
    shortcutKey: "toggle-file-manager",
    iconComponent: FolderIcon,
  },
  {
    id: "undo",
    label: "Undo",
    type: "system",
    shortcutKey: "undo",
    iconComponent: UndoIcon,
  },
  {
    id: "history",
    label: "History",
    type: "system",
    shortcutKey: "toggle-history",
    iconComponent: HistoryIcon,
  },
  {
    id: "redo",
    label: "Redo",
    type: "system",
    shortcutKey: "redo",
    iconComponent: RedoIcon,
  },
  {
    id: "ruler",
    label: "Ruler",
    type: "system",
    shortcutKey: "toggle-ruler",
    iconComponent: RulerIcon,
  },
  {
    id: "protractor",
    label: "Protractor",
    type: "system",
    shortcutKey: "toggle-protractor",
    iconComponent: ProtractorIcon,
  },
  {
    id: "grid",
    label: "Grid & Snap",
    type: "system",
    shortcutKey: "toggle-grid",
    iconComponent: GridIcon,
  },
  {
    id: "onionSkin",
    label: "Onion Skin",
    type: "system",
    shortcutKey: "toggle-onion",
    iconComponent: OnionSkinIcon,
  },
  {
    id: "velocityHeatmap",
    label: "Velocity Heatmap",
    type: "system",
    iconComponent: VelocityHeatmapIcon,
  },
  {
    id: "newPath",
    label: "New Path",
    type: "system",
    shortcutKey: "new-file",
    iconComponent: PlusIcon,
  },
  {
    id: "settings",
    label: "Settings Menu",
    type: "system",
    shortcutKey: "open-settings",
    iconComponent: WrenchIcon,
  },
  {
    id: "feedback",
    label: "Feedback",
    type: "system",
    iconComponent: FeedbackIcon,
  },
  {
    id: "github",
    label: "GitHub Repo",
    type: "system",
    iconComponent: GithubIcon,
  },

  // Structural items
  { id: "separator", label: "Separator", type: "separator" },
  { id: "spacer", label: "Spacer (Flexible Space)", type: "spacer" },

  // Setting Toggles (Rendered generically)
  {
    id: "showRobotArrows",
    label: "Show Robot Arrows",
    type: "setting",
    settingKey: "showRobotArrows",
    iconComponent: ShowRobotArrowsIcon,
  },
  {
    id: "showFakeHeadingArrow",
    label: "Show Fake Heading Arrow",
    type: "setting",
    settingKey: "showFakeHeadingArrow",
    iconComponent: ShowFakeHeadingArrowIcon,
  },
  {
    id: "validateFieldBoundaries",
    label: "Validate Field Boundaries",
    type: "setting",
    settingKey: "validateFieldBoundaries",
    iconComponent: ValidateFieldBoundariesIcon,
  },
  {
    id: "continuousValidation",
    label: "Continuous Validation",
    type: "setting",
    settingKey: "continuousValidation",
    iconComponent: ContinuousValidationIcon,
  },
  {
    id: "restrictDraggingToField",
    label: "Restrict Dragging To Field",
    type: "setting",
    settingKey: "restrictDraggingToField",
    iconComponent: RestrictDraggingToFieldIcon,
  },
  {
    id: "smartSnapping",
    label: "Smart Snapping",
    type: "setting",
    settingKey: "smartSnapping",
    iconComponent: SmartSnappingIcon,
  },
  {
    id: "showDebugSequence",
    label: "Show Debug Sequence",
    type: "setting",
    settingKey: "showDebugSequence",
    iconComponent: ShowDebugSequenceIcon,
  },
  {
    id: "autoExportCode",
    label: "Auto Export Code",
    type: "setting",
    settingKey: "autoExportCode",
    iconComponent: AutoExportCodeIcon,
  },
  {
    id: "followRobot",
    label: "Follow Robot",
    type: "setting",
    settingKey: "followRobot",
    iconComponent: FollowRobotIcon,
  },
  {
    id: "showTelemetryTab",
    label: "Show Telemetry Tab",
    type: "setting",
    settingKey: "showTelemetryTab",
    iconComponent: ShowTelemetryTabIcon,
  },
  {
    id: "showRobot",
    label: "Toggle Robot Visibility",
    type: "setting",
    settingKey: "showRobot",
    iconComponent: ShowRobotIcon,
  },
  {
    id: "presentationMode",
    label: "Presentation Mode",
    type: "system",
    iconComponent: PresentationModeIcon,
  },
  {
    id: "pluginManager",
    label: "Plugin Manager",
    type: "system",
    iconComponent: PluginManagerIcon,
  },
  {
    id: "whatsNew",
    label: "What's New & Docs",
    type: "system",
    iconComponent: StarIcon,
  },
  {
    id: "onboarding",
    label: "Restart Tutorial",
    type: "system",
    iconComponent: RestartTutorialIcon,
  },
  {
    id: "exportImage",
    label: "Export as Image",
    type: "system",
    iconComponent: ExportImageIcon,
  },
  {
    id: "exportGif",
    label: "Export as GIF",
    type: "system",
    iconComponent: ExportGifIcon,
  },
];
