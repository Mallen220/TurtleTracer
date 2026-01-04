// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { validatePath } from "../utils/validation";
import { collisionMarkers, notification } from "../stores";
import { PathOptimizer } from "../utils/pathOptimizer";
import type { Line, Point, SequenceItem, Shape } from "../types";

// Mock the stores
vi.mock("../stores", () => ({
  collisionMarkers: {
    set: vi.fn(),
  },
  notification: {
    set: vi.fn(),
  },
}));

// Mock PathOptimizer
// We define the mock inside the factory to avoid hoisting issues
vi.mock("../utils/pathOptimizer", () => {
  const MockPathOptimizer = vi.fn();
  MockPathOptimizer.prototype.getCollisions = vi.fn();
  return {
    PathOptimizer: MockPathOptimizer,
  };
});

describe("Validation Utility", () => {
  const mockStartPoint: Point = {
    x: 0,
    y: 0,
    heading: "tangential",
    reverse: false,
  };
  const mockLines: Line[] = [];
  const mockSettings = {
    xVelocity: 0,
    yVelocity: 0,
    aVelocity: 0,
    kFriction: 0,
    rLength: 0,
    rWidth: 0,
    safetyMargin: 0,
    maxVelocity: 0,
    maxAcceleration: 0,
    fieldMap: "",
    theme: "dark" as "dark" | "light" | "auto",
  };
  const mockSequence: SequenceItem[] = [];
  const mockShapes: Shape[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    // Default implementation returns empty array
    // We access the mocked class and its prototype methods via the imported symbol
    (PathOptimizer as any).prototype.getCollisions.mockReturnValue([]);
  });

  it("should detect no collisions and set success notification", () => {
    validatePath(
      mockStartPoint,
      mockLines,
      mockSettings,
      mockSequence,
      mockShapes,
    );

    expect(PathOptimizer).toHaveBeenCalled();
    expect(collisionMarkers.set).toHaveBeenCalledWith([]);
    expect(notification.set).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "success",
        message: expect.stringContaining("valid"),
      }),
    );
  });

  it("should detect collisions and set error notification", () => {
    const mockCollisions = [{ x: 10, y: 10, time: 1.5 }];
    (PathOptimizer as any).prototype.getCollisions.mockReturnValue(
      mockCollisions,
    );

    validatePath(
      mockStartPoint,
      mockLines,
      mockSettings,
      mockSequence,
      mockShapes,
    );

    expect(collisionMarkers.set).toHaveBeenCalledWith(mockCollisions);
    expect(notification.set).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        message: expect.stringContaining("Found 1 collisions"),
      }),
    );
  });

  it("should handle multiple collisions", () => {
    const mockCollisions = [
      { x: 10, y: 10, time: 1.5 },
      { x: 20, y: 20, time: 2.5 },
    ];
    (PathOptimizer as any).prototype.getCollisions.mockReturnValue(
      mockCollisions,
    );

    validatePath(
      mockStartPoint,
      mockLines,
      mockSettings,
      mockSequence,
      mockShapes,
    );

    expect(collisionMarkers.set).toHaveBeenCalledWith(mockCollisions);
    expect(notification.set).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Found 2 collisions"),
      }),
    );
  });
});
