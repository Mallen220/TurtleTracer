import { describe, it, expect, vi, beforeEach } from "vitest";
import { generatePathElements } from "./PathGenerator";
import { generatePreviewPathElements } from "./PreviewPathGenerator";
import type { Line, Point } from "../../../types";
import { createPathAnchors } from "./GeneratorUtils";
import Two from "two.js";

vi.mock("../../../utils/math", async () => {
  const actual = await vi.importActual("../../../utils/math");
  return {
    ...(actual as any),
  };
});

describe("Generator Utilities", () => {
  const startPoint: Point = { x: 0, y: 0 } as Point;
  const endPoint: Point = { x: 10, y: 10 } as Point;

  let mockCtx: any;

  beforeEach(() => {
    mockCtx = {
      x: (val: number) => val * 10,
      y: (val: number) => val * 10,
      uiLength: (val: number) => val,
      settings: { showVelocityHeatmap: false, maxVelocity: 100 },
      timePrediction: null,
      percentStore: 0,
      dimmedIds: [],
      multiSelectedPointIds: [],
    };
  });

  describe("createPathAnchors", () => {
    it("should handle 0 control points (straight line)", () => {
      const line: Line = { endPoint, controlPoints: [], color: "red" };
      const anchors = createPathAnchors(line, startPoint, mockCtx);
      expect(anchors).toHaveLength(2);
      expect(anchors[0].command).toBe(Two.Commands.move);
      expect(anchors[1].command).toBe(Two.Commands.line);
    });

    it("should handle 1 control point", () => {
      const line: Line = { endPoint, controlPoints: [{ x: 5, y: 0 }], color: "red" };
      const anchors = createPathAnchors(line, startPoint, mockCtx);
      expect(anchors).toHaveLength(2);
      expect(anchors[1].command).toBe(Two.Commands.curve);
    });

    it("should handle 2 control points", () => {
      const line: Line = { endPoint, controlPoints: [{ x: 3, y: 0 }, { x: 7, y: 0 }], color: "red" };
      const anchors = createPathAnchors(line, startPoint, mockCtx);
      expect(anchors).toHaveLength(2);
      expect(anchors[1].command).toBe(Two.Commands.curve);
    });

    it("should handle 3+ control points", () => {
      const line: Line = { endPoint, controlPoints: [{ x: 2, y: 0 }, { x: 5, y: 5 }, { x: 8, y: 0 }], color: "red" };
      const anchors = createPathAnchors(line, startPoint, mockCtx);
      expect(anchors).toHaveLength(101);
      expect(anchors[1].command).toBe(Two.Commands.line);
    });
  });

  describe("generatePathElements", () => {
    it("should render standard line and handle states", () => {
      mockCtx.dimmedIds = ["line-dimmed"];
      const lines: Line[] = [
        { id: "line-normal", endPoint, controlPoints: [], color: "#ff0000" },
        { id: "line-dimmed", endPoint: { x: 20, y: 20 } as Point, controlPoints: [], color: "#00ff00" },
        { id: "line-locked", endPoint: { x: 30, y: 30 } as Point, controlPoints: [], color: "#0000ff", locked: true },
        { id: "line-hidden", endPoint: { x: 40, y: 40 } as Point, controlPoints: [], color: "#ffff00", hidden: true },
      ];
      const elements = generatePathElements(lines, startPoint, (l) => l.color, (l) => 2, "test-prefix", mockCtx, false);
      expect(elements).toHaveLength(3);
      expect(elements[0].id).toBe("test-prefix-line-1");
      expect(elements[1].id).toBe("test-prefix-line-2");
      expect(elements[2].id).toBe("test-prefix-line-3");
    });

    it("should render heatmap segments", () => {
      mockCtx.settings.showVelocityHeatmap = true;
      mockCtx.timePrediction = { timeline: [{ type: "travel", lineIndex: 0, velocityProfile: [0, 50, 100, 50, 0] }] };
      const lines: Line[] = [{ id: "line-heatmap", endPoint, controlPoints: [], color: "#ff0000" }];
      const elements = generatePathElements(lines, startPoint, (l) => l.color, (l) => 2, "test-prefix", mockCtx, true);
      expect(elements.length).toBeGreaterThan(1);
    });
  });

  describe("generatePreviewPathElements", () => {
    it("should render preview paths correctly", () => {
      mockCtx.uiLength = (val: number) => val * 2;
      const lines: Line[] = [
        { endPoint: { x: 10, y: 10 } as Point, controlPoints: [], color: "#ff0000" },
        { endPoint: { x: 20, y: 20 } as Point, controlPoints: [], color: "#00ff00" },
      ];
      const elements = generatePreviewPathElements(lines, startPoint, mockCtx);
      expect(elements).toHaveLength(2);
      expect(elements[0].id).toBe("preview-line-1");
    });

    it("should handle null inputs", () => {
        const elements = generatePreviewPathElements(null as unknown as Line[], startPoint, mockCtx);
        expect(elements).toEqual([]);
    });
  });
});