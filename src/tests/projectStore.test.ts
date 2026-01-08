// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  normalizeLines,
  sanitizeSequence,
  renumberDefaultPathNames,
} from "../lib/projectStore";
import type { Line, SequenceItem, SequencePathItem } from "../types";

describe("projectStore Utilities", () => {
  describe("normalizeLines", () => {
    it("should assign IDs if missing", () => {
      const input: Partial<Line>[] = [{ name: "Test" }];
      const output = normalizeLines(input as Line[]);
      expect(output[0].id).toBeDefined();
      expect(output[0].name).toBe("Test");
    });

    it("should initialize default properties", () => {
      const input: Partial<Line>[] = [{ id: "1" }];
      const output = normalizeLines(input as Line[]);
      expect(output[0].controlPoints).toEqual([]);
      expect(output[0].eventMarkers).toEqual([]);
      expect(output[0].color).toBeDefined();
    });

    it("should handle wait times", () => {
      const input: any[] = [
        { id: "1", waitBeforeMs: 100, waitAfterMs: 200 },
        {
          id: "2",
          waitBefore: { durationMs: 300 },
          waitAfter: { durationMs: 400 },
        },
      ];
      const output = normalizeLines(input);
      expect(output[0].waitBeforeMs).toBe(100);
      expect(output[0].waitAfterMs).toBe(200);
      expect(output[1].waitBeforeMs).toBe(300);
      expect(output[1].waitAfterMs).toBe(400);
    });
  });

  describe("sanitizeSequence", () => {
    const lines: Line[] = [
      { id: "l1", name: "Line 1" } as Line,
      { id: "l2", name: "Line 2" } as Line,
    ];

    it("should remove sequence items referring to non-existent lines", () => {
      const seq: SequenceItem[] = [
        { kind: "path", lineId: "l1" },
        { kind: "path", lineId: "missing" } as any,
      ];
      const result = sanitizeSequence(lines, seq);
      expect(result).toHaveLength(2); // l1 is kept, missing is removed, but then l2 is appended because it's missing from sequence
      // Wait, let's trace logic:
      // pruned = [l1]
      // missing = [l2]
      // result = [l1, l2]

      const ids = result.map((s: any) => s.lineId);
      expect(ids).toContain("l1");
      expect(ids).toContain("l2");
      expect(ids).not.toContain("missing");
    });

    it("should append missing lines to sequence", () => {
      const seq: SequenceItem[] = [{ kind: "path", lineId: "l1" }];
      const result = sanitizeSequence(lines, seq);
      expect(result).toHaveLength(2);
      expect((result[1] as SequencePathItem).lineId).toBe("l2");
    });

    it("should preserve wait items", () => {
      const seq: SequenceItem[] = [
        { kind: "path", lineId: "l1" },
        { kind: "wait", durationMs: 1000 } as any,
      ];
      const result = sanitizeSequence(lines, seq);
      // pruned = [l1, wait]
      // missing = [l2]
      // result = [l1, wait, l2]
      expect(result).toHaveLength(3);
      expect(result[1].kind).toBe("wait");
    });
  });

  describe("renumberDefaultPathNames", () => {
    it("should renumber 'Path N' names", () => {
      const lines: Line[] = [
        { name: "Path 1" } as Line,
        { name: "Custom" } as Line,
        { name: "Path 5" } as Line,
      ];
      const result = renumberDefaultPathNames(lines);
      expect(result[0].name).toBe("Path 1");
      expect(result[1].name).toBe("Custom");
      expect(result[2].name).toBe("Path 3"); // Should be renumbered based on index + 1
    });

    it("should ignore custom names", () => {
      const lines: Line[] = [
        { name: "Start" } as Line,
        { name: "End" } as Line,
      ];
      const result = renumberDefaultPathNames(lines);
      expect(result[0].name).toBe("Start");
      expect(result[1].name).toBe("End");
    });
  });
});
