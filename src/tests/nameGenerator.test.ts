// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  makeId,
  renumberDefaultPathNames,
  generateName,
} from "../utils/nameGenerator";
import type { Line } from "../types";

describe("nameGenerator", () => {
  describe("makeId", () => {
    it("should generate a non-empty string", () => {
      const id = makeId();
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    });

    it("should generate unique IDs", () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(makeId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe("renumberDefaultPathNames", () => {
    it("should renumber paths with default names", () => {
      const lines: Line[] = [
        {
          endPoint: { x: 0, y: 0, heading: "constant", degrees: 0 },
          controlPoints: [],
          color: "red",
          name: "Path 100",
        },
        {
          endPoint: { x: 0, y: 0, heading: "constant", degrees: 0 },
          controlPoints: [],
          color: "red",
          name: "Path 5",
        },
      ];
      const result = renumberDefaultPathNames(lines);
      expect(result[0].name).toBe("Path 1");
      expect(result[1].name).toBe("Path 2");
    });

    it("should preserve custom names", () => {
      const lines: Line[] = [
        {
          endPoint: { x: 0, y: 0, heading: "constant", degrees: 0 },
          controlPoints: [],
          color: "red",
          name: "MyPath",
        },
        {
          endPoint: { x: 0, y: 0, heading: "constant", degrees: 0 },
          controlPoints: [],
          color: "red",
          name: "Path 5",
        },
      ];
      const result = renumberDefaultPathNames(lines);
      expect(result[0].name).toBe("MyPath");
      expect(result[1].name).toBe("Path 2"); // Note: it renumbers based on index
    });

    it("should preserve empty names (do not auto-assign 'Path N')", () => {
      const lines: Line[] = [
        {
          endPoint: { x: 0, y: 0, heading: "constant", degrees: 0 },
          controlPoints: [],
          color: "red",
          name: "",
        },
      ];
      const result = renumberDefaultPathNames(lines);
      expect(result[0].name).toBe("");
    });
  });

  describe("generateName", () => {
    it("should return base name if unique", () => {
      const existing = ["Other"];
      expect(generateName("NewName", existing)).toBe("NewName");
    });

    it("should append duplicate if name exists", () => {
      const existing = ["Name"];
      expect(generateName("Name", existing)).toBe("Name duplicate");
    });

    it("should append number if duplicate exists", () => {
      const existing = ["Name", "Name duplicate"];
      expect(generateName("Name", existing)).toBe("Name duplicate 1");
    });

    it("should increment number if duplicate number exists", () => {
      const existing = ["Name", "Name duplicate", "Name duplicate 1"];
      expect(generateName("Name", existing)).toBe("Name duplicate 2");
    });

    it("should handle duplication of a duplicate", () => {
      const existing = ["Name", "Name duplicate"];
      // Duplicating "Name duplicate"
      expect(generateName("Name duplicate", existing)).toBe("Name duplicate 1");
    });

    it("should handle duplication of a numbered duplicate", () => {
      const existing = ["Name", "Name duplicate", "Name duplicate 1"];
      // Duplicating "Name duplicate 1"
      expect(generateName("Name duplicate 1", existing)).toBe(
        "Name duplicate 2",
      );
    });

    it("should find gaps in sequence if logic permitted or just next available", () => {
      // The current implementation just finds the next available suffix starting from count+1
      const existing = ["Name", "Name duplicate", "Name duplicate 2"];
      // Logic check: if "Name duplicate 1" is missing, does it fill it?
      // Code: match " duplicate" -> count 0. loop i=1. "Name duplicate 1" -> not in set -> return it.
      expect(generateName("Name", existing)).toBe("Name duplicate 1");
    });

    it("should be case insensitive for checking existence but preserve case for result", () => {
      const existing = ["name"];
      // "Name" exists as "name". So it should duplicate.
      expect(generateName("Name", existing)).toBe("Name duplicate");
    });

    it("should correctly handle names that already end with numbers (e.g. 'Name 99')", () => {
      const existing = ["Name 99"];
      expect(generateName("Name 99", existing)).toBe("Name 99 duplicate");
    });

    it("should handle conflicting with multiple existing numbered items with gaps", () => {
      const existing = [
        "Name",
        "Name duplicate",
        "Name duplicate 1",
        "Name duplicate 3",
        "Name duplicate 4",
      ];
      // Should find the first gap "Name duplicate 2"
      expect(generateName("Name", existing)).toBe("Name duplicate 2");
    });

    it("should handle conflicting with high numbered items correctly", () => {
      const existing = [
        "Name duplicate 9",
        "Name duplicate 10",
        "Name duplicate 11",
      ];
      // When duplicating "Name duplicate 9", it checks 9+1=10 which exists, then 11 which exists, then 12.
      expect(generateName("Name duplicate 9", existing)).toBe(
        "Name duplicate 12"
      );
    });

    it("should handle empty base name", () => {
      const existing = [""];
      expect(generateName("", existing)).toBe(" duplicate");
      const existing2 = ["", " duplicate"];
      expect(generateName("", existing2)).toBe(" duplicate 1");
    });

    it("should handle extra spaces correctly when checking existence", () => {
      // The implementation normalizes spaces by trimming and lowercasing.
      // So "Name  " is normalized to "name".
      // If we try to duplicate "Name  ", and existing has "Name", "Name" will be matched.
      // Wait, if baseName is "Name  ", it doesn't have " duplicate" in it.
      // It checks existingSet for "name". If it exists, it falls through to append " duplicate" to "Name  ".
      // Result: "Name   duplicate" (note: "Name  " + " duplicate").
      // Wait, the implementation says `if (!existingSet.has(normalize(baseName))) { return baseName; }`
      // So if existing is ["Name"], and baseName is "Name  ", normalize("Name  ") === "name", which IS in existingSet.
      // Then it checks for match " duplicate(?: \\d+)?$" -> no match.
      // It appends " duplicate" to "Name  " -> "Name   duplicate".
      // Let's test this behavior.
      const existing = ["Name"];
      expect(generateName("Name  ", existing)).toBe("Name   duplicate");

      const existing2 = ["Name", "Name   duplicate"];
      expect(generateName("Name  ", existing2)).toBe("Name   duplicate 1");
    });
  });
});
