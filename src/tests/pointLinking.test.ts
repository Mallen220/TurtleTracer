// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  updateLinkedWaypoints,
  handleWaypointRename,
  updateLinkedWaits,
  handleWaitRename,
  isLineLinked,
  isWaitLinked,
} from "../utils/pointLinking";
import type { Line, SequenceItem, SequenceWaitItem } from "../types";

// Helper to create a dummy line
const createLine = (id: string, name: string, x: number, y: number): Line => ({
  id,
  name,
  color: "black",
  endPoint: { heading: "tangential", x, y, reverse: false },
  controlPoints: [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ],
});

// Helper to create a dummy wait item
const createWait = (
  id: string,
  name: string,
  durationMs: number,
): SequenceWaitItem => ({
  kind: "wait",
  id,
  name,
  durationMs,
});

describe("Point Linking Utils", () => {
  describe("Waypoints", () => {
    it("updateLinkedWaypoints should sync positions for same-named lines", () => {
      const lines = [
        createLine("1", "Point A", 10, 10),
        createLine("2", "Point A", 20, 20), // Should be synced to "1" if "1" changes
        createLine("3", "Point B", 30, 30),
      ];

      // Simulate Line 1 moving to 50,50
      lines[0].endPoint.x = 50;
      lines[0].endPoint.y = 50;

      const result = updateLinkedWaypoints(lines, "1");

      expect(result[1].endPoint.x).toBe(50);
      expect(result[1].endPoint.y).toBe(50);
      expect(result[2].endPoint.x).toBe(30); // Unchanged
    });

    it("updateLinkedWaypoints should do nothing if name is empty", () => {
      const lines = [createLine("1", "", 10, 10), createLine("2", "", 20, 20)];
      lines[0].endPoint.x = 50;

      const result = updateLinkedWaypoints(lines, "1");
      expect(result[1].endPoint.x).toBe(20);
    });

    it("handleWaypointRename should adopt position of existing group", () => {
      const lines = [
        createLine("1", "Old Name", 10, 10),
        createLine("2", "New Group", 50, 50),
      ];

      const result = handleWaypointRename(lines, "1", "New Group");

      expect(result[0].name).toBe("New Group");
      expect(result[0].endPoint.x).toBe(50);
      expect(result[0].endPoint.y).toBe(50);
    });

    it("handleWaypointRename should just rename if unique", () => {
      const lines = [createLine("1", "Old Name", 10, 10)];
      const result = handleWaypointRename(lines, "1", "Unique Name");
      expect(result[0].name).toBe("Unique Name");
      expect(result[0].endPoint.x).toBe(10);
    });

    it("isLineLinked returns true only if another line shares the name", () => {
      const lines = [
        createLine("1", "Shared", 0, 0),
        createLine("2", "Shared", 0, 0),
        createLine("3", "Unique", 0, 0),
      ];
      expect(isLineLinked(lines, "1")).toBe(true);
      expect(isLineLinked(lines, "3")).toBe(false);
    });
  });

  describe("Waits", () => {
    it("updateLinkedWaits should sync durations", () => {
      const sequence: SequenceItem[] = [
        createWait("1", "Wait A", 1000),
        createWait("2", "Wait A", 2000), // Should sync to 1
        createWait("3", "Wait B", 3000),
      ];

      // Simulate Wait 1 changing to 5000
      (sequence[0] as SequenceWaitItem).durationMs = 5000;

      const result = updateLinkedWaits(sequence, "1");
      expect((result[1] as SequenceWaitItem).durationMs).toBe(5000);
      expect((result[2] as SequenceWaitItem).durationMs).toBe(3000);
    });

    it("handleWaitRename should adopt duration of existing group", () => {
      const sequence: SequenceItem[] = [
        createWait("1", "Old", 1000),
        createWait("2", "New Group", 5000),
      ];

      const result = handleWaitRename(sequence, "1", "New Group");
      expect((result[0] as SequenceWaitItem).name).toBe("New Group");
      expect((result[0] as SequenceWaitItem).durationMs).toBe(5000);
    });

    it("isWaitLinked returns true only if another wait shares the name", () => {
      const sequence: SequenceItem[] = [
        createWait("1", "Shared", 100),
        createWait("2", "Shared", 100),
        createWait("3", "Unique", 100),
      ];
      expect(isWaitLinked(sequence, "1")).toBe(true);
      expect(isWaitLinked(sequence, "3")).toBe(false);
    });
  });
});
