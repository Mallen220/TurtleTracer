// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
export type CoordinateSystem = "Pedro" | "FTC";

export function toUser(
  point: { x: number; y: number },
  system: CoordinateSystem = "Pedro",
): { x: number; y: number } {
  if (system === "FTC") {
    // User X = 72 - Field Y
    // User Y = Field X - 72
    return {
      x: 72 - point.y,
      y: point.x - 72,
    };
  }
  return { x: point.x, y: point.y };
}

export function toField(
  point: { x: number; y: number },
  system: CoordinateSystem = "Pedro",
): { x: number; y: number } {
  if (system === "FTC") {
    // Field X = User Y + 72
    // Field Y = 72 - User X
    return {
      x: point.y + 72,
      y: 72 - point.x,
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

// Deprecated single-value functions (wrappers for compatibility if needed temporarily, but we should migrate)
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
  fractionDigits: number = 3,
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
