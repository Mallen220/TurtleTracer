// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi } from "vitest";
import {
  walkAST,
  findFirst,
  findAll,
  extractTokens,
} from "../../../utils/javaImporter/visitor";

describe("AST Visitor", () => {
  describe("walkAST", () => {
    it("should do nothing if node is null", () => {
      const visitors = { test: vi.fn() };
      walkAST(null, visitors);
      expect(visitors.test).not.toHaveBeenCalled();
    });

    it("should visit matching nodes", () => {
      const visitors = {
        NodeA: vi.fn(),
        NodeB: vi.fn(),
      };

      const ast = {
        name: "Root",
        children: {
          child1: { name: "NodeA", children: {} },
          child2: [
            { name: "NodeB", children: {} },
            { name: "NodeC", children: {} },
          ],
        },
      };

      walkAST(ast, visitors);

      expect(visitors.NodeA).toHaveBeenCalled();
      expect(visitors.NodeB).toHaveBeenCalled();
    });
  });

  describe("findFirst", () => {
    it("should return null if not found", () => {
      const ast = { name: "Root", children: { child1: { name: "A" } } };
      expect(findFirst(ast, (n) => n.name === "B")).toBeNull();
    });

    it("should find the first matching node", () => {
      const target = { name: "Target", val: 42 };
      const ast = {
        name: "Root",
        children: {
          c1: { name: "A" },
          c2: [{ name: "B" }, target],
        },
      };

      const result = findFirst(ast, (n) => n.name === "Target");
      expect(result).toBe(target);
    });
  });

  describe("findAll", () => {
    it("should return empty array if node is null", () => {
      expect(findAll(null, () => true)).toEqual([]);
    });

    it("should return all matching nodes", () => {
      const ast = {
        name: "Target",
        val: 1,
        children: {
          c1: { name: "Other" },
          c2: [
            { name: "Target", val: 2 },
            { name: "Other2", children: { c3: { name: "Target", val: 3 } } },
          ],
        },
      };

      const result = findAll(ast, (n) => n.name === "Target");
      expect(result.length).toBe(3);
      expect(result.map((n) => n.val)).toEqual([1, 2, 3]);
    });
  });

  describe("extractTokens", () => {
    it("should return empty array if node is null", () => {
      expect(extractTokens(null)).toEqual([]);
    });

    it("should extract all images in order", () => {
      const ast = {
        name: "Root",
        image: "root",
        children: {
          c1: { name: "A", image: "A" },
          c2: [
            { name: "B", image: "B" },
            { name: "C", children: { c3: { name: "D", image: "D" } } },
          ],
        },
      };

      const result = extractTokens(ast);
      expect(result).toEqual(["root", "A", "B", "D"]);
    });
  });
});
