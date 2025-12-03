import type { Point, Line, Shape, FPASettings } from "../types";
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
 * Default FPA settings
 */
export const DEFAULT_FPA_SETTINGS: FPASettings = {
  xVelocity: 30,
  yVelocity: 30,
  aVelocity: Math.PI,
  kFriction: 0.4,
  rWidth: DEFAULT_ROBOT_WIDTH,
  rHeight: DEFAULT_ROBOT_HEIGHT,
  safetyMargin: 1,
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
      name: "Path 1",
      endPoint: { x: 56, y: 36, heading: "linear", startDeg: 90, endDeg: 180 },
      controlPoints: [],
      color: getRandomColor(),
      eventMarkers: [],
      locked: false,
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
