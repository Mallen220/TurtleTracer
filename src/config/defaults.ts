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
    key: "w",
    description: "Add new path",
    action: "addNewLine",
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
    id: "toggle-snap",
    key: "n",
    description: "Toggle snap to grid",
    action: "toggleSnap",
  },
  {
    id: "toggle-protractor",
    key: "p",
    description: "Toggle protractor",
    action: "toggleProtractor",
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
  optimizationIterations: 100,
  optimizationPopulationSize: 50,
  optimizationMutationRate: 0.4,
  optimizationMutationStrength: 6.0,
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
