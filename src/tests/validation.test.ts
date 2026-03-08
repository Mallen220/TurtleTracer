// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { validatePath } from "../utils/validation";
import type {
  Line,
  Point,
  SequenceItem,
  Settings,
  Shape,
  CollisionMarker,
} from "../types";

// Hoist mocks to be accessible inside vi.mock factory
const mocks = vi.hoisted(() => ({
  getCollisions: vi.fn(() => [] as CollisionMarker[]),
  collisionMarkersSet: vi.fn(),
  notificationSet: vi.fn(),
}));

// Mock PathOptimizer as a class
vi.mock("../utils/pathOptimizer", () => {
  return {
    PathOptimizer: class {
      constructor() {}
      getCollisions() {
        return mocks.getCollisions();
      }
    },
  };
});

// Mock stores
vi.mock("../stores", () => ({
  collisionMarkers: {
    set: mocks.collisionMarkersSet,
  },
  notification: {
    set: mocks.notificationSet,
  },
}));

describe("Validation Utils", () => {
  const dummySettings = {} as Settings;
  const dummySequence = [] as SequenceItem[];
  const dummyShapes = [] as Shape[];

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCollisions.mockReturnValue([]);
  });

  it("should report success when no collisions or issues are found", () => {
    const startPoint: Point = {
      x: 0,
      y: 0,
      heading: "tangential",
      reverse: false,
    };
    const lines: Line[] = [
      {
        id: "1",
        name: "L1",
        color: "black",
        endPoint: { x: 10, y: 10, heading: "tangential", reverse: false },
        controlPoints: [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
      },
    ];

    validatePath(startPoint, lines, dummySettings, dummySequence, dummyShapes);

    expect(mocks.collisionMarkersSet).toHaveBeenCalledWith([]);
    expect(mocks.notificationSet).toHaveBeenCalledWith({
      message: "Path is valid! No collisions detected.",
      type: "success",
      timeout: 3000,
    });
  });

  it("should detect zero-length segments", () => {
    const startPoint: Point = {
      x: 0,
      y: 0,
      heading: "tangential",
      reverse: false,
    };
    const lines: Line[] = [
      {
        id: "1",
        name: "L1",
        color: "black",
        endPoint: { x: 0, y: 0, heading: "tangential", reverse: false }, // Same as start
        controlPoints: [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
      },
    ];

    validatePath(startPoint, lines, dummySettings, dummySequence, dummyShapes);

    expect(mocks.collisionMarkersSet).toHaveBeenCalledWith([
      expect.objectContaining({ type: "zero-length" }),
    ]);
    expect(mocks.notificationSet).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("1 zero-length"),
        type: "error",
      }),
    );
  });

  it("should report obstacles from PathOptimizer", () => {
    const startPoint: Point = {
      x: 0,
      y: 0,
      heading: "tangential",
      reverse: false,
    };
    const lines: Line[] = [
      {
        id: "1",
        name: "L1",
        color: "black",
        endPoint: { x: 10, y: 10, heading: "tangential", reverse: false },
        controlPoints: [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
      },
    ];

    mocks.getCollisions.mockReturnValue([
      { x: 5, y: 5, time: 1, segmentIndex: 0, type: "obstacle" },
    ]);

    validatePath(startPoint, lines, dummySettings, dummySequence, dummyShapes);

    expect(mocks.collisionMarkersSet).toHaveBeenCalledWith([
      expect.objectContaining({ type: "obstacle" }),
    ]);
    expect(mocks.notificationSet).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("1 obstacle"),
      }),
    );
  });

  it("should report boundary violations from PathOptimizer", () => {
    const startPoint: Point = {
      x: 0,
      y: 0,
      heading: "tangential",
      reverse: false,
    };
    const lines: Line[] = [
      {
        id: "1",
        name: "L1",
        color: "black",
        endPoint: { x: 10, y: 10, heading: "tangential", reverse: false },
        controlPoints: [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
      },
    ];

    mocks.getCollisions.mockReturnValue([
      { x: 5, y: 5, time: 1, segmentIndex: 0, type: "boundary" },
    ]);

    validatePath(startPoint, lines, dummySettings, dummySequence, dummyShapes);

    expect(mocks.collisionMarkersSet).toHaveBeenCalledWith([
      expect.objectContaining({ type: "boundary" }),
    ]);
    expect(mocks.notificationSet).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("1 boundary"),
      }),
    );
  });

  it("should combine multiple issue types in the message", () => {
    const startPoint: Point = {
      x: 0,
      y: 0,
      heading: "tangential",
      reverse: false,
    };
    const lines: Line[] = [
      {
        id: "1",
        name: "L1",
        color: "black",
        endPoint: { x: 0, y: 0, heading: "tangential", reverse: false }, // Zero length
        controlPoints: [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
      },
    ];

    mocks.getCollisions.mockReturnValue([
      { x: 5, y: 5, time: 1, segmentIndex: 0, type: "obstacle" },
    ]);

    validatePath(startPoint, lines, dummySettings, dummySequence, dummyShapes);

    // Should have 1 zero-length (from internal check) and 1 obstacle (from mock)
    expect(mocks.collisionMarkersSet).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ type: "zero-length" }),
        expect.objectContaining({ type: "obstacle" }),
      ]),
    );

    // We expect the message to contain "1 obstacle" and "1 zero-length"
    const expectedMessageParts = ["1 obstacle", "1 zero-length"];
    const lastCall = mocks.notificationSet.mock.calls[0][0];

    expectedMessageParts.forEach((part) => {
      expect(lastCall.message).toContain(part);
    });
  });

  it("should report range markers correctly", () => {
    const startPoint: Point = {
      x: 0,
      y: 0,
      heading: "tangential",
      reverse: false,
    };
    const lines: Line[] = [
      {
        id: "1",
        name: "L1",
        color: "black",
        endPoint: { x: 10, y: 10, heading: "tangential", reverse: false },
        controlPoints: [],
      },
    ];

    mocks.getCollisions.mockReturnValue([
      {
        x: 5,
        y: 5,
        time: 1,
        segmentIndex: 0,
        type: "obstacle",
        endTime: 2,
        endX: 8,
        endY: 8,
      },
    ]);

    validatePath(startPoint, lines, dummySettings, dummySequence, dummyShapes);

    expect(mocks.collisionMarkersSet).toHaveBeenCalledWith([
      expect.objectContaining({ type: "obstacle", endTime: 2 }),
    ]);
    expect(mocks.notificationSet).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("1 obstacle"),
      }),
    );
  });
});
