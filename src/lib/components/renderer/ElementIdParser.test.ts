// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  parseElementId,
  normalizeEventElementId,
  resolveHoveredMarkerId,
} from "./ElementIdParser";

describe("ElementIdParser", () => {
  it("returns null for null, undefined, or empty string", () => {
    expect(parseElementId(null)).toBeNull();
    expect(parseElementId(undefined)).toBeNull();
    expect(parseElementId("")).toBeNull();
  });

  it("parses point IDs correctly", () => {
    // Start point
    expect(parseElementId("point-0-0")).toEqual({
      type: "point",
      lineIndex: -1,
      pointIndex: 0,
    });
    // First line end point
    expect(parseElementId("point-1-0")).toEqual({
      type: "point",
      lineIndex: 0,
      pointIndex: 0,
    });
    // First line control point 1
    expect(parseElementId("point-1-1")).toEqual({
      type: "point",
      lineIndex: 0,
      pointIndex: 1,
    });
    // Invalid numbers
    expect(parseElementId("point-abc-0")).toBeNull();
    expect(parseElementId("point-1-xyz")).toBeNull();
  });

  it("parses obstacle IDs correctly", () => {
    expect(parseElementId("obstacle-2-3")).toEqual({
      type: "obstacle",
      shapeIndex: 2,
      vertexIndex: 3,
    });
    expect(parseElementId("obstacle-foo-1")).toBeNull();
    expect(parseElementId("obstacle-0-bar")).toBeNull();
  });

  it("parses event IDs correctly", () => {
    expect(parseElementId("event-1-2")).toEqual({
      type: "event",
      lineIndex: 1,
      eventIndex: 2,
    });
    expect(parseElementId("event-bad-0")).toBeNull();
    expect(parseElementId("event-0-bad")).toBeNull();
  });

  it("parses wait-event IDs correctly", () => {
    expect(parseElementId("wait-event-wait123-1")).toEqual({
      type: "wait-event",
      waitId: "wait123",
      eventIndex: 1,
    });
  });

  it("parses rotate-event IDs correctly", () => {
    expect(parseElementId("rotate-event-rotate456-2")).toEqual({
      type: "rotate-event",
      rotateId: "rotate456",
      eventIndex: 2,
    });
  });

  it("returns unknown for unhandled types", () => {
    expect(parseElementId("random-element-id")).toEqual({
      type: "unknown",
      originalId: "random-element-id",
    });
  });

  describe("normalizeEventElementId", () => {
    it("normalizes wait event elements with extra prefixes", () => {
      expect(normalizeEventElementId("wait-event-flag-w1-2")).toBe(
        "wait-event-w1-2",
      );
      expect(normalizeEventElementId("wait-event-w1-2")).toBe(
        "wait-event-w1-2",
      );
    });

    it("normalizes rotate event elements", () => {
      expect(normalizeEventElementId("rotate-event-arrow-r1-0")).toBe(
        "rotate-event-r1-0",
      );
      expect(normalizeEventElementId("rotate-event-r1-0")).toBe(
        "rotate-event-r1-0",
      );
    });

    it("normalizes line event elements", () => {
      expect(normalizeEventElementId("event-circle-1-0")).toBe("event-1-0");
      expect(normalizeEventElementId("event-1-0")).toBe("event-1-0");
    });
  });

  describe("resolveHoveredMarkerId", () => {
    const lines = [
      { eventMarkers: [{ id: "em-0-0" }, { id: "em-0-1" }] },
      { eventMarkers: [{ id: "em-1-0" }] },
    ];
    const sequence = [
      { kind: "wait", id: "w1", eventMarkers: [{ id: "wait-em-1" }] },
      { kind: "rotate", id: "r1", eventMarkers: [{ id: "rot-em-1" }] },
    ];

    it("resolves line event marker id", () => {
      expect(resolveHoveredMarkerId("event-0-1", lines, sequence)).toBe(
        "em-0-1",
      );
      expect(resolveHoveredMarkerId("event-1-0", lines, sequence)).toBe(
        "em-1-0",
      );
      expect(resolveHoveredMarkerId("event-5-0", lines, sequence)).toBeNull();
    });

    it("resolves wait event marker id", () => {
      expect(resolveHoveredMarkerId("wait-event-w1-0", lines, sequence)).toBe(
        "wait-em-1",
      );
      expect(
        resolveHoveredMarkerId("wait-event-nonexistent-0", lines, sequence),
      ).toBeNull();
    });

    it("resolves rotate event marker id", () => {
      expect(resolveHoveredMarkerId("rotate-event-r1-0", lines, sequence)).toBe(
        "rot-em-1",
      );
    });

    it("resolves diff event marker id", () => {
      expect(
        resolveHoveredMarkerId("diff-event-marker123-circle", lines, sequence),
      ).toBe("marker123");
    });
  });
});
