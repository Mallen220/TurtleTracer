// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import type { Point, Line, Shape, Settings, KeyBinding } from "../types";
import { getRandomColor } from "../utils";

/**
 * Default robot dimensions
 */
export const DEFAULT_ROBOT_LENGTH = 16;
export const DEFAULT_ROBOT_WIDTH = 16;

/**
 * Default canvas drawing settings
 */
export const POINT_RADIUS = 1.15;
export const LINE_WIDTH = 0.57;
export const FIELD_SIZE = 144;

/**
 * Available field maps
 */
export const AVAILABLE_FIELD_MAPS = [
  { value: "decode.webp", label: "DECODE Field (2025-2026)" },
  { value: "intothedeep.webp", label: "Into The Deep Field (2024-2025)" },
  { value: "centerstage.webp", label: "Centerstage (2023-2024)" },
];

/**
 * Default settings
 */
export const DEFAULT_KEY_BINDINGS: KeyBinding[] = [
  // File
  {
    id: "save-project",
    key: "cmd+s, ctrl+s",
    description: "Save project",
    action: "saveProject",
    category: "File",
  },
  {
    id: "save-file-as",
    key: "cmd+shift+s, ctrl+shift+s",
    description: "Save As (download trajectory)",
    action: "saveFileAs",
    category: "File",
  },
  {
    id: "export-gif",
    key: "cmd+shift+e, ctrl+shift+e",
    description: "Export Animated Image",
    action: "exportGif",
    category: "File",
  },

  // Editing
  {
    id: "add-path",
    key: "p",
    description: "Add new path",
    action: "addNewLine",
    category: "Editing",
  },
  {
    id: "add-wait",
    key: "w",
    description: "Add wait",
    action: "addWait",
    category: "Editing",
  },
  {
    id: "add-rotate",
    key: "t",
    description: "Add rotate event",
    action: "addRotate",
    category: "Editing",
  },
  {
    id: "add-event-marker",
    key: "e",
    description: "Add event marker",
    action: "addEventMarker",
    category: "Editing",
  },
  {
    id: "add-control-point",
    key: "a",
    description: "Add control point",
    action: "addControlPoint",
    category: "Editing",
  },
  {
    id: "remove-control-point",
    key: "d",
    description: "Remove control point",
    action: "removeControlPoint",
    category: "Editing",
  },
  {
    id: "duplicate",
    key: "shift+d, cmd+d",
    description: "Duplicate selected item",
    action: "duplicate",
    category: "Editing",
  },
  {
    id: "remove-selected",
    key: "backspace, delete",
    description: "Remove selected point or wait",
    action: "removeSelected",
    category: "Editing",
  },
  {
    id: "undo",
    key: "cmd+z, ctrl+z",
    description: "Undo",
    action: "undo",
    category: "Editing",
  },
  {
    id: "redo",
    key: "cmd+shift+z, ctrl+shift+z, ctrl+y",
    description: "Redo",
    action: "redo",
    category: "Editing",
  },
  {
    id: "move-point-up",
    key: "i, up",
    description: "Move selected point up",
    action: "movePointUp",
    category: "Editing",
  },
  {
    id: "move-point-down",
    key: "k, down",
    description: "Move selected point down",
    action: "movePointDown",
    category: "Editing",
  },
  {
    id: "move-point-left",
    key: "j, left",
    description: "Move selected point left",
    action: "movePointLeft",
    category: "Editing",
  },
  {
    id: "move-point-right",
    key: "l, right",
    description: "Move selected point right",
    action: "movePointRight",
    category: "Editing",
  },
  {
    id: "increase-val",
    key: "=",
    description: "Increase value (wait/rotate)",
    action: "increaseValue",
    category: "Editing",
  },
  {
    id: "decrease-val",
    key: "-",
    description: "Decrease value (wait/rotate)",
    action: "decreaseValue",
    category: "Editing",
  },
  {
    id: "add-obstacle",
    key: "shift+o",
    description: "Add new obstacle",
    action: "addObstacle",
    category: "Editing",
  },
  {
    id: "focus-name",
    key: "f2, enter",
    description: "Rename selected item",
    action: "focusName",
    category: "Editing",
  },
  {
    id: "deselect-all",
    key: "escape",
    description: "Deselect all",
    action: "deselectAll",
    category: "Navigation",
  },
  {
    id: "toggle-heading-mode",
    key: "shift+h",
    description: "Toggle Heading Mode",
    action: "toggleHeadingMode",
    category: "Editing",
  },
  {
    id: "toggle-reverse",
    key: "shift+r",
    description: "Toggle Reverse",
    action: "toggleReverse",
    category: "Editing",
  },
  {
    id: "toggle-lock",
    key: "shift+l",
    description: "Toggle Locked State",
    action: "toggleLock",
    category: "Editing",
  },

  // Playback
  {
    id: "play-pause",
    key: "space",
    description: "Play / Pause",
    action: "togglePlay",
    category: "Playback",
  },
  {
    id: "increase-speed",
    key: "shift+up",
    description: "Increase playback speed",
    action: "increasePlaybackSpeed",
    category: "Playback",
  },
  {
    id: "decrease-speed",
    key: "shift+down",
    description: "Decrease playback speed",
    action: "decreasePlaybackSpeed",
    category: "Playback",
  },
  {
    id: "reset-playback-speed",
    key: "1",
    description: "Reset playback speed",
    action: "resetPlaybackSpeed",
    category: "Playback",
  },
  {
    id: "step-back",
    key: "shift+left",
    description: "Step animation backward",
    action: "stepBackward",
    category: "Playback",
  },
  {
    id: "step-forward",
    key: "shift+right",
    description: "Step animation forward",
    action: "stepForward",
    category: "Playback",
  },
  {
    id: "reset-animation",
    key: "r",
    description: "Reset animation",
    action: "resetAnimation",
    category: "Playback",
  },

  // View
  {
    id: "toggle-onion",
    key: "o",
    description: "Toggle onion layers",
    action: "toggleOnion",
    category: "View",
  },
  {
    id: "toggle-grid",
    key: "g",
    description: "Toggle grid",
    action: "toggleGrid",
    category: "View",
  },
  {
    id: "cycle-grid-size",
    key: "]",
    description: "Cycle grid spacing",
    action: "cycleGridSize",
    category: "View",
  },
  {
    id: "cycle-grid-size-prev",
    key: "[",
    description: "Cycle grid spacing backward",
    action: "cycleGridSizeReverse",
    category: "View",
  },
  {
    id: "toggle-snap",
    key: "n",
    description: "Toggle snap to grid",
    action: "toggleSnap",
    category: "View",
  },
  {
    id: "toggle-protractor",
    key: "shift+p",
    description: "Toggle protractor",
    action: "toggleProtractor",
    category: "View",
  },
  {
    id: "zoom-in",
    key: "cmd+=, ctrl+=, cmd+shift+=, ctrl+shift+=, cmd+num_add, ctrl+num_add",
    description: "Zoom In",
    action: "zoomIn",
    category: "View",
  },
  {
    id: "zoom-out",
    key: "cmd+-, ctrl+-, cmd+num_subtract, ctrl+num_subtract",
    description: "Zoom Out",
    action: "zoomOut",
    category: "View",
  },
  {
    id: "zoom-reset",
    key: "cmd+0, ctrl+0, cmd+num_0, ctrl+num_0",
    description: "Reset Zoom",
    action: "zoomReset",
    category: "View",
  },
  {
    id: "toggle-collapse-all",
    key: "shift+c",
    description: "Toggle collapse/expand all",
    action: "toggleCollapseAll",
    category: "View",
  },
  {
    id: "toggle-sidebar",
    key: "b",
    description: "Toggle sidebar / control tab",
    action: "toggleSidebar",
    category: "View",
  },
  {
    id: "toggle-velocity-heatmap",
    key: "v",
    description: "Toggle Velocity Heatmap",
    action: "toggleVelocityHeatmap",
    category: "View",
  },

  // Navigation
  {
    id: "select-next",
    key: "tab",
    description: "Select next item",
    action: "selectNext",
    category: "Navigation",
  },
  {
    id: "select-prev",
    key: "shift+tab",
    description: "Select previous item",
    action: "selectPrev",
    category: "Navigation",
  },
  {
    id: "select-paths-tab",
    key: "alt+1",
    description: "Switch to Paths tab",
    action: "selectTabPaths",
    category: "Navigation",
  },
  {
    id: "select-field-tab",
    key: "alt+2",
    description: "Switch to Field & Tools tab",
    action: "selectTabField",
    category: "Navigation",
  },
  {
    id: "select-table-tab",
    key: "alt+3",
    description: "Switch to Table tab",
    action: "selectTabTable",
    category: "Navigation",
  },
  {
    id: "cycle-tabs-next",
    key: "ctrl+tab",
    description: "Cycle tabs forward",
    action: "cycleTabNext",
    category: "Navigation",
  },
  {
    id: "cycle-tabs-prev",
    key: "ctrl+shift+tab",
    description: "Cycle tabs backward",
    action: "cycleTabPrev",
    category: "Navigation",
  },

  // Tools
  {
    id: "optimize-start",
    key: "ctrl+shift+o",
    description: "Start optimization",
    action: "optimizeStart",
    category: "Optimization",
  },
  {
    id: "optimize-stop",
    key: "ctrl+.",
    description: "Stop optimization",
    action: "optimizeStop",
    category: "Optimization",
  },
  {
    id: "optimize-apply",
    key: "ctrl+enter",
    description: "Apply optimized path",
    action: "optimizeApply",
    category: "Optimization",
  },
  {
    id: "optimize-discard",
    key: "ctrl+backspace",
    description: "Discard optimization",
    action: "optimizeDiscard",
    category: "Optimization",
  },
  {
    id: "optimize-retry",
    key: "ctrl+shift+r",
    description: "Retry optimization",
    action: "optimizeRetry",
    category: "Optimization",
  },
  {
    id: "open-settings",
    key: "cmd+, ctrl+,",
    description: "Open Settings",
    action: "openSettings",
    category: "Settings",
  },
  {
    id: "show-help",
    key: "shift+/",
    description: "Show keyboard shortcuts",
    action: "showHelp",
    category: "Settings",
  },
  {
    id: "toggle-stats",
    key: "s",
    description: "Toggle Path Statistics",
    action: "toggleStats",
    category: "View",
  },
  {
    id: "focus-x",
    key: "x",
    description: "Focus X Input",
    action: "focusX",
    category: "Editing",
  },
  {
    id: "focus-y",
    key: "y",
    description: "Focus Y Input",
    action: "focusY",
    category: "Editing",
  },
  {
    id: "focus-heading",
    key: "h",
    description: "Focus Heading Input",
    action: "focusHeading",
    category: "Editing",
  },
  {
    id: "open-whats-new",
    key: "shift+n",
    description: "Open What's New",
    action: "openWhatsNew",
    category: "Settings",
  },
  {
    id: "toggle-command-palette",
    key: "cmd+p, ctrl+p",
    description: "Toggle Command Palette",
    action: "toggleCommandPalette",
    category: "View",
  },
  {
    id: "open-file",
    key: "cmd+o, ctrl+o",
    description: "Open File",
    action: "openFile",
    category: "File",
  },
  {
    id: "new-file",
    key: "cmd+n, ctrl+n, cmd+r, ctrl+r",
    description: "New Project / Reset Path",
    action: "newProject",
    category: "File",
  },
  {
    id: "toggle-file-manager",
    key: "cmd+shift+m, ctrl+shift+m",
    description: "Toggle File Manager",
    action: "toggleFileManager",
    category: "File",
  },
  {
    id: "export-java",
    key: "cmd+shift+j, ctrl+shift+j",
    description: "Export Java Code",
    action: "exportJava",
    category: "Export",
  },
  {
    id: "export-points",
    key: "cmd+shift+k, ctrl+shift+k",
    description: "Export Points Array",
    action: "exportPoints",
    category: "Export",
  },
  {
    id: "export-sequential",
    key: "cmd+shift+u, ctrl+shift+u",
    description: "Export Sequential Command",
    action: "exportSequential",
    category: "Export",
  },
  {
    id: "export-pp",
    key: "cmd+shift+x, ctrl+shift+x",
    description: "Export .pp (JSON)",
    action: "exportPP",
    category: "Export",
  },
];

export const DEFAULT_SETTINGS: Settings = {
  xVelocity: 30,
  yVelocity: 30,
  aVelocity: Math.PI / 2, // 90 deg/s
  kFriction: 0.4,
  rLength: DEFAULT_ROBOT_LENGTH,
  rWidth: DEFAULT_ROBOT_WIDTH,
  safetyMargin: 6,
  maxVelocity: 40,
  maxAcceleration: 30,
  maxDeceleration: 30,
  maxAngularAcceleration: 0, // 0 = Auto-calculate from linear acceleration
  fieldMap: "decode.webp",
  fieldRotation: 0,
  robotImage: "/robot.png",
  javaPackageName: "org.firstinspires.ftc.teamcode.Commands.AutoCommands",
  theme: "auto",
  autosaveMode: "never",
  autosaveInterval: 5,
  showVelocityHeatmap: false,
  showGhostPaths: false,
  showOnionLayers: false,
  onionSkinCurrentPathOnly: false,
  onionLayerSpacing: 6, // inches between each robot body trace
  optimizationIterations: 300,
  optimizationPopulationSize: 100,
  optimizationMutationRate: 0.4,
  optimizationMutationStrength: 6.0,
  validateFieldBoundaries: true,
  restrictDraggingToField: true,
  keyBindings: DEFAULT_KEY_BINDINGS,
  recentFiles: [],
  lastSeenVersion: "",
  // Developer/debugging aids
  // @ts-ignore
  showDebugSequence: false,
};

/**
 * Get default starting point
 */
export function getDefaultStartPoint(): Point {
  return {
    x: 56,
    y: 8,
    heading: "linear",
    startDeg: 90,
    endDeg: 180,
    locked: false,
  };
}

/**
 * Get default initial path lines
 */
export function getDefaultLines(): Line[] {
  return [
    {
      id: `line-${Math.random().toString(36).slice(2)}`,
      name: "",
      endPoint: { x: 56, y: 36, heading: "linear", startDeg: 90, endDeg: 180 },
      controlPoints: [],
      color: getRandomColor(),
      eventMarkers: [],
      locked: false,
      waitBeforeMs: 0,
      waitAfterMs: 0,
      waitBeforeName: "",
      waitAfterName: "",
    },
  ];
}

/**
 * Get default shapes (field obstacles)
 */
export function getDefaultShapes(): Shape[] {
  return [
    {
      id: "triangle-1",
      name: "Red Goal",
      vertices: [
        { x: 144, y: 70 },
        { x: 144, y: 144 },
        { x: 118, y: 144 },
        { x: 138, y: 118 },
        { x: 138, y: 70 },
      ],
      color: "#dc2626",
      fillColor: "#fca5a5",
    },
    {
      id: "triangle-2",
      name: "Blue Goal",
      vertices: [
        { x: 7, y: 118 },
        { x: 26, y: 144 },
        { x: 0, y: 144 },
        { x: 0, y: 70 },
        { x: 7, y: 70 },
      ],
      color: "#0b08d9",
      fillColor: "#fca5a5",
    },
  ];
}
