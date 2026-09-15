// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Point, Line, Shape, Settings } from "../types";
import { DEFAULT_KEY_BINDINGS } from "./keybindings";

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
// DEPRECATED: use settingsStore.fieldWidth / fieldHeight instead
export const FIELD_SIZE = 144;

/**
 * Available field maps
 */
export const AVAILABLE_FIELD_MAPS = [
  { value: "biobuzz.webp", label: "BioBuzz Field (2026-2027)" },
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
  fieldWidth: 144,
  fieldHeight: 144,
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
  fieldMap: "biobuzz.webp",
  fieldRotation: 0,
  // use no-image by default; users can opt in to the lightweight
  // legacy robot.png graphic via the settings panel if desired.
  robotImage: "none",
  robotDriveType: "holonomic",
  showRobotArrows: true,
  showFakeHeadingArrow: false,
  fakeHeadingArrowColor: "#ef4444",
  robotFeatures: [],
  javaPackageName: "org.firstinspires.ftc.teamcode.Commands.AutoCommands",
  theme: "auto",
  programFontSize: 100,
  autosaveMode: "never",
  autosaveInterval: 5,
  showVelocityHeatmap: false,
  showVelocityTooltip: false,
  showOnionLayers: false,
  onionSkinCurrentPathOnly: false,
  onionLayerSpacing: 6, // inches between each robot body trace
  optimizationIterations: 300,
  optimizationPopulationSize: 100,
  optimizationMutationRate: 0.4,
  optimizationMutationStrength: 6,
  drawToolTolerance: 5,
  drawToolTension: 0.38,
  validationDisabled: false,
  validateFieldBoundaries: true,
  continuousValidation: false,
  restrictDraggingToField: true,
  smartSnapping: true,
  customMaps: [],
  keyBindings: DEFAULT_KEY_BINDINGS,
  recentFiles: [],
  lastSeenVersion: "",
  totalUsageTime: 0,
  lastFeedbackSubmit: "",
  submittedRatings: {},
  dismissedRatings: {},
  hasSeenOnboarding: false,
  gitIntegration: true,
  lockFieldView: false,
  obstaclePresets: [
    {
      id: "preset-biobuzz-2026",
      name: "BioBuzz Field (2026-2027)",
      shapes: [
        {
          id: "biobuzz-hive-red",
          name: "HiveRedSide",
          vertices: [
            { x: 46.5, y: 92 },
            { x: 46.5, y: 52 },
            { x: 49, y: 52 },
            { x: 49, y: 92 },
          ],
          color: "#3f3f3f",
          fillColor: "#fca5a5",
          type: "obstacle",
        },
        {
          id: "biobuzz-hive-blue",
          name: "HiveBlueSide",
          vertices: [
            { x: 95, y: 92 },
            { x: 95, y: 52 },
            { x: 97.5, y: 52 },
            { x: 97.5, y: 92 },
          ],
          color: "#3f3f3f",
          fillColor: "#fca5a5",
          type: "obstacle",
        },
      ],
    },
    {
      id: "preset-decode-2025",
      name: "DECODE Field (2025-2026)",
      shapes: [
        {
          id: "triangle-1",
          name: "Red Goal",
          vertices: [
            { x: 143, y: 69.5 },
            { x: 143, y: 143 },
            { x: 118.5, y: 143 },
            { x: 136.5, y: 118.5 },
            { x: 136.5, y: 69.5 },
          ],
          color: "#dc2626",
          fillColor: "#fca5a5",
          type: "obstacle",
        },
        {
          id: "triangle-2",
          name: "Blue Goal",
          vertices: [
            { x: 7.5, y: 118.5 },
            { x: 25.5, y: 143 },
            { x: 1.25, y: 143 },
            { x: 1.25, y: 69.5 },
            { x: 7.5, y: 69.5 },
          ],
          color: "#0b08d9",
          fillColor: "#fca5a5",
          type: "obstacle",
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
  ],
  // Developer/debugging aids
  showDebugSequence: false,
  // Auto Export
  autoExportCode: false,
  autoExportPath: "GeneratedCode",
  autoExportFormat: "java",
  autoExportTargetLibrary: "SolversLib",
  autoExportFullClass: true,
  autoExportEmbedPoseData: false,
  telemetryImplementation: "Panels",
  followRobot: false,
  coordinateSystem: "Pedro",
  visualizerUnits: "imperial",
  codeUnits: "imperial",
  showTelemetryTab: false,
  sidebarItems: [
    "fileManager",
    "separator",
    "undo",
    "history",
    "redo",
    "separator",
    "ruler",
    "protractor",
    "grid",
    "onionSkin",
    "velocityHeatmap",
    "separator",
    "drawPath",
    "newPath",
    "spacer",
    "separator",
    "settings",
    "feedback",
    "discord",
  ],
  customSidebarItems: [],
  sidebarExpanded: false,
  sidebarWidth: 240,
  sidebarIconSize: 20,
};

/**
 * Get default starting point
 */
export function getDefaultStartPoint(): Point {
  return {
    x: 9,
    y: 25,
    heading: "constant",
    degrees: 0,
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
      name: "DriveToShoot",
      endPoint: {
        x: 60,
        y: 25,
        heading: "linear",
        startDeg: 0,
        endDeg: 90,
      },
      controlPoints: [],
      color: "#8CD6B8",
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
  const biobuzzPreset = DEFAULT_SETTINGS.obstaclePresets?.find(
    (p) => p.id === "preset-biobuzz-2026",
  );
  if (biobuzzPreset) {
    // Return copies so mutations don't affect the preset
    return biobuzzPreset.shapes.map((s) => ({
      ...s,
      vertices: s.vertices.map((v) => ({ ...v })),
    }));
  }
  return [];
}

export { DEFAULT_KEY_BINDINGS } from "./keybindings";
