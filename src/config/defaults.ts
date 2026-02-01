// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import type { Point, Line, Shape, Settings } from "../types";
import { getRandomColor } from "../utils";
import { DEFAULT_KEY_BINDINGS } from "./keybindings";

export { DEFAULT_KEY_BINDINGS };

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

export const SETTINGS_TAB_ORDER = [
  "general",
  "robot",
  "motion",
  "interface",
  "code-export",
  "advanced",
  "about",
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
  programFontSize: 100,
  autosaveMode: "never",
  autosaveInterval: 5,
  showVelocityHeatmap: false,
  showOnionLayers: false,
  onionSkinCurrentPathOnly: false,
  onionLayerSpacing: 6, // inches between each robot body trace
  optimizationIterations: 300,
  optimizationPopulationSize: 100,
  optimizationMutationRate: 0.4,
  optimizationMutationStrength: 6.0,
  validateFieldBoundaries: true,
  continuousValidation: false,
  restrictDraggingToField: true,
  customMaps: [],
  keyBindings: DEFAULT_KEY_BINDINGS,
  recentFiles: [],
  lastSeenVersion: "",
  hasSeenOnboarding: false,
  gitIntegration: true,
  obstaclePresets: [
    {
      id: "preset-decode-2025",
      name: "DECODE Field (2025-2026)",
      shapes: [
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
          type: "obstacle",
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
          type: "obstacle",
        },
      ],
    },
    {
      id: "preset-centerstage-2023",
      name: "Centerstage (2023-2024)",
      shapes: [
        {
          id: "cs-scoring-1",
          name: "Scoring 1",
          vertices: [
            { x: 48, y: 132 },
            { x: 48, y: 144 },
            { x: 24, y: 144 },
            { x: 24, y: 132 },
          ],
          color: "#1c1c1c",
          fillColor: "#fca5a5",
          type: "obstacle",
        },
        {
          id: "cs-scoring-2",
          name: "Scoring 2",
          vertices: [
            { x: 120, y: 144 },
            { x: 96, y: 144 },
            { x: 96, y: 132 },
            { x: 120, y: 132 },
          ],
          color: "#1c1c1c",
          fillColor: "#fca5a5",
          locked: false,
          type: "obstacle",
          visible: true,
        },
      ],
    },
    {
      id: "preset-intothedeep-2024",
      name: "Into The Deep Field (2024-2025)",
      shapes: [
        {
          id: "itd-red-goal",
          name: "Center Structure",
          vertices: [
            { x: 96, y: 57 },
            { x: 96, y: 87 },
            { x: 48, y: 87 },
            { x: 48, y: 57 },
          ],
          color: "#fbf42d",
          fillColor: "#fca5a5",
          type: "obstacle",
        },
      ],
    },
  ],
  // Developer/debugging aids
  showDebugSequence: false,
  // Auto Export
  autoExportCode: false,
  autoExportPath: "GeneratedCode",
  autoExportFormat: "java",
  autoExportTargetLibrary: "SolversLib",
  autoExportFullClass: true,
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
