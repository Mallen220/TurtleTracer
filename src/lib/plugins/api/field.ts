// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Shapes a plugin can draw on the field. Positions and sizes are field
// inches; line widths and text sizes are inches too, but they stay the same
// size on screen when the field is zoomed, like the app's own markers.
import type { FieldPoint } from "./data";

interface PrimitiveBase {
  /** Give a shape an id to hear about clicks on it (`LayerDefinition.onClick`). */
  id?: string;
  /** 0 (invisible) to 1. */
  opacity?: number;
  /**
   * `"field"` (the default) draws at field coordinates. `"robot"` draws
   * relative to the robot as it moves: x forward, y to its left, in inches
   * from its centre.
   */
  space?: "field" | "robot";
}

/** Colours are any CSS colour; `"none"` leaves out a fill or outline. */
interface Paint {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface CirclePrimitive extends PrimitiveBase, Paint {
  type: "circle";
  x: number;
  y: number;
  radius: number;
}

/** A rectangle centred on `x`, `y`. */
export interface RectPrimitive extends PrimitiveBase, Paint {
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees counter-clockwise. */
  rotation?: number;
}

/** A line through `points`, or a polygon when `closed`. */
export interface LinePrimitive extends PrimitiveBase, Paint {
  type: "line";
  points: FieldPoint[];
  closed?: boolean;
  /** Dash and gap lengths in inches, e.g. `[2, 1]`. */
  dash?: number[];
}

export interface TextPrimitive extends PrimitiveBase {
  type: "text";
  x: number;
  y: number;
  text: string;
  /** Text height in inches. */
  size?: number;
  color?: string;
  align?: "left" | "center" | "right";
  bold?: boolean;
}

export interface ArrowPrimitive extends PrimitiveBase {
  type: "arrow";
  from: FieldPoint;
  to: FieldPoint;
  color?: string;
  strokeWidth?: number;
}

/**
 * A robot outline with a heading mark: at a fixed pose, or following one of
 * the layer's tracks during playback (see `Layer.setTrack`). Its size is the
 * project's robot unless given.
 */
export interface RobotPrimitive extends PrimitiveBase {
  type: "robot";
  x?: number;
  y?: number;
  heading?: number;
  /** The name of a track set with `Layer.setTrack`. */
  track?: string;
  color?: string;
  length?: number;
  width?: number;
}

export type FieldPrimitive =
  | CirclePrimitive
  | RectPrimitive
  | LinePrimitive
  | TextPrimitive
  | ArrowPrimitive
  | RobotPrimitive;
