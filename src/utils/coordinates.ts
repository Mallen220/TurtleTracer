// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
export type CoordinateSystem = "Pedro" | "FTC";

export function toUser(
  point: { x: number; y: number },
  system: CoordinateSystem = "Pedro",
  fieldWidth: number = 144,
  fieldHeight: number = 144,
): { x: number; y: number } {
  if (system === "FTC") {
    // User X = fieldHeight/2 - Field Y
    // User Y = Field X - fieldWidth/2
    return {
      x: fieldHeight / 2 - point.y,
      y: point.x - fieldWidth / 2,
    };
  }
  return { x: point.x, y: point.y };
}

export function toField(
  point: { x: number; y: number },
  system: CoordinateSystem = "Pedro",
  fieldWidth: number = 144,
  fieldHeight: number = 144,
): { x: number; y: number } {
  if (system === "FTC") {
    // Field X = User Y + fieldWidth/2
    // Field Y = fieldHeight/2 - User X
    return {
      x: point.y + fieldWidth / 2,
      y: fieldHeight / 2 - point.x,
    };
  }
  return { x: point.x, y: point.y };
}

export function toUserHeading(
  fieldHeading: number, // degrees
  system: CoordinateSystem = "Pedro",
): number {
  // Both systems use Right = 0, Up = 90 (Unit Circle)
  return fieldHeading;
}

export function toFieldHeading(
  userHeading: number, // degrees
  system: CoordinateSystem = "Pedro",
): number {
  // Both systems use Right = 0, Up = 90 (Unit Circle)
  return userHeading;
}

export function toUserCoordinate(
  val: number,
  system: CoordinateSystem,
): number {
  return val; // Placeholder, not safe for FTC
}

export function toFieldCoordinate(
  val: number,
  system: CoordinateSystem,
): number {
  return val; // Placeholder
}

/**
 * Converts inches to centimeters.
 */
export function inchToCm(inches: number): number {
  return inches * 2.54;
}

/**
 * Converts centimeters to inches.
 */
export function cmToInch(cm: number): number {
  return cm / 2.54;
}

/**
 * Formats a coordinate value for display based on the visualizer units setting.
 */
export function formatDisplayCoordinate(
  val: number,
  settings: { visualizerUnits?: "imperial" | "metric" },
  fractionDigits: number = 2,
): string {
  if (settings?.visualizerUnits === "metric") {
    return inchToCm(val).toFixed(fractionDigits);
  }
  return val.toFixed(fractionDigits);
}

/**
 * Formats a distance value with its unit label based on the visualizer units setting.
 */
export function formatDisplayDistance(
  val: number,
  settings: { visualizerUnits?: "imperial" | "metric" },
  fractionDigits: number = 2,
): string {
  if (settings?.visualizerUnits === "metric") {
    return `${inchToCm(val).toFixed(fractionDigits)} cm`;
  }
  return `${val.toFixed(fractionDigits)} in`;
}
