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
