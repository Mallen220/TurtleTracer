import type { Point, Line, Shape, Settings, KeyBinding } from "../types";
import { getRandomColor } from "../utils";

/**
 * Default robot dimensions
 */
export const DEFAULT_ROBOT_WIDTH = 16;
export const DEFAULT_ROBOT_HEIGHT = 16;

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
  {
    id: "add-path",
    key: "p",
    description: "Add new path",
    action: "addNewLine",
  },
  {
    id: "add-wait",
    key: "w",
    description: "Add wait",
    action: "addWait",
  },
  {
    id: "add-event-marker",
    key: "e",
    description: "Add event marker",
    action: "addEventMarker",
  },
  {
    id: "add-control-point",
    key: "a",
    description: "Add control point",
    action: "addControlPoint",
  },
  {
    id: "remove-control-point",
    key: "s",
    description: "Remove control point",
    action: "removeControlPoint",
  },
  {
    id: "remove-selected",
    key: "backspace, delete",
    description: "Remove selected point or wait",
    action: "removeSelected",
  },
  {
    id: "save-project",
    key: "cmd+s, ctrl+s",
    description: "Save project",
    action: "saveProject",
  },
  {
    id: "play-pause",
    key: "space",
    description: "Play / Pause",
    action: "togglePlay",
  },
  {
    id: "increase-speed",
    key: "up",
    description: "Increase playback speed by 0.25x",
    action: "increasePlaybackSpeed",
  },
  {
    id: "decrease-speed",
    key: "down",
    description: "Decrease playback speed by 0.25x",
    action: "decreasePlaybackSpeed",
  },
  {
    id: "reset-playback-speed",
    key: "1",
    description: "Reset playback speed to 1x",
    action: "resetPlaybackSpeed",
  },
  { id: "undo", key: "cmd+z, ctrl+z", description: "Undo", action: "undo" },
  {
    id: "redo",
    key: "cmd+shift+z, ctrl+shift+z, ctrl+y",
    description: "Redo",
    action: "redo",
  },
  {
    id: "save-file-as",
    key: "cmd+shift+s, ctrl+shift+s",
    description: "Save As (download trajectory)",
    action: "saveFileAs",
  },
  {
    id: "export-gif",
    key: "cmd+shift+e, ctrl+shift+e",
    description: "Export GIF",
    action: "exportGif",
  },
  {
    id: "reset-animation",
    key: "r",
    description: "Reset animation",
    action: "resetAnimation",
  },
  {
    id: "step-back",
    key: "left",
    description: "Step animation backward",
    action: "stepBackward",
  },
  {
    id: "step-forward",
    key: "right",
    description: "Step animation forward",
    action: "stepForward",
  },
  {
    id: "move-point-up",
    key: "i",
    description: "Move selected point up",
    action: "movePointUp",
  },
  {
    id: "move-point-down",
    key: "k",
    description: "Move selected point down",
    action: "movePointDown",
  },
  {
    id: "move-point-left",
    key: "j",
    description: "Move selected point left",
    action: "movePointLeft",
  },
  {
    id: "move-point-right",
    key: "l",
    description: "Move selected point right",
    action: "movePointRight",
  },
  {
    id: "select-next",
    key: "tab",
    description: "Select next item",
    action: "selectNext",
  },
  {
    id: "select-prev",
    key: "shift+tab",
    description: "Select previous item",
    action: "selectPrev",
  },
  {
    id: "increase-val",
    key: "=",
    description: "Increase value (e.g. wait time)",
    action: "increaseValue",
  },
  {
    id: "decrease-val",
    key: "-",
    description: "Decrease value (e.g. wait time)",
    action: "decreaseValue",
  },
  {
    id: "toggle-onion",
    key: "o",
    description: "Toggle onion layers",
    action: "toggleOnion",
  },
  {
    id: "toggle-grid",
    key: "g",
    description: "Toggle grid",
    action: "toggleGrid",
  },
  {
    id: "cycle-grid-size",
    key: "]",
    description: "Cycle grid spacing",
    action: "cycleGridSize",
  },
  {
    id: "cycle-grid-size-prev",
    key: "[",
    description: "Cycle grid spacing backward",
    action: "cycleGridSizeReverse",
  },
  {
    id: "toggle-snap",
    key: "n",
    description: "Toggle snap to grid",
    action: "toggleSnap",
  },
  {
    id: "toggle-protractor",
    key: "shift+p",
    description: "Toggle protractor",
    action: "toggleProtractor",
  },
  {
    id: "toggle-collapse-all",
    key: "shift+c",
    description: "Toggle collapse/expand all",
    action: "toggleCollapseAll",
  },
  {
    id: "toggle-sidebar",
    key: "b",
    description: "Toggle sidebar / control tab",
    action: "toggleSidebar",
  },
  {
    id: "select-paths-tab",
    key: "alt+1",
    description: "Switch to Paths tab",
    action: "selectTabPaths",
  },
  {
    id: "select-field-tab",
    key: "alt+2",
    description: "Switch to Field & Tools tab",
    action: "selectTabField",
  },
  {
    id: "select-table-tab",
    key: "alt+3",
    description: "Switch to Table tab",
    action: "selectTabTable",
  },
  {
    id: "optimize-start",
    key: "ctrl+shift+o",
    description: "Open optimization panel and start optimization",
    action: "optimizeStart",
  },
  {
    id: "optimize-stop",
    key: "ctrl+.",
    description: "Stop running optimization",
    action: "optimizeStop",
  },
  {
    id: "optimize-apply",
    key: "ctrl+enter",
    description: "Apply optimized path",
    action: "optimizeApply",
  },
  {
    id: "optimize-discard",
    key: "ctrl+backspace",
    description: "Discard optimization results",
    action: "optimizeDiscard",
  },
  {
    id: "optimize-retry",
    key: "ctrl+shift+r",
    description: "Retry optimization",
    action: "optimizeRetry",
  },
  {
    id: "cycle-tabs-next",
    key: "ctrl+tab",
    description: "Cycle tabs forward",
    action: "cycleTabNext",
  },
  {
    id: "cycle-tabs-prev",
    key: "ctrl+shift+tab",
    description: "Cycle tabs backward",
    action: "cycleTabPrev",
  },
  {
    id: "show-help",
    key: "shift+/",
    description: "Show keyboard shortcuts",
    action: "showHelp",
  },
];

export const DEFAULT_SETTINGS: Settings = {
  xVelocity: 30,
  yVelocity: 30,
  aVelocity: Math.PI,
  kFriction: 0.4,
  rWidth: DEFAULT_ROBOT_WIDTH,
  rHeight: DEFAULT_ROBOT_HEIGHT,
  safetyMargin: 1,
  maxVelocity: 40,
  maxAcceleration: 30,
  maxDeceleration: 30,
  fieldMap: "decode.webp",
  fieldRotation: 0,
  robotImage: "/robot.png",
  theme: "auto",
  showGhostPaths: false,
  showOnionLayers: false,
  onionLayerSpacing: 6, // inches between each robot body trace
  optimizationIterations: 300,
  optimizationPopulationSize: 100,
  optimizationMutationRate: 0.4,
  optimizationMutationStrength: 3.0,
  keyBindings: DEFAULT_KEY_BINDINGS,
  recentFiles: [],
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
      name: "Path 1",
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
