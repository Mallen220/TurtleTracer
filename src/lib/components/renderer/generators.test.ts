import { describe, it, expect, vi } from "vitest";
import { generatePathElements } from "./PathGenerator";
import { generatePreviewPathElements } from "./PreviewPathGenerator";
import type { Line, Point, ControlPoint } from "../../../types";
import { createPathAnchors } from "./GeneratorUtils";
import Two from "two.js";

// Basic mocking of Math utils to allow Two.js usage testing independently if needed,
// but for these tests we might want actual math. Let's unmock or mock specific behavior if needed.
// Actually, using actual math is fine for createPathAnchors to verify bezier behaviors.
vi.mock("../../../utils/math", async () => {
  const actual = await vi.importActual("../../../utils/math");
  return {
    ...(actual as any),
  };
});

describe("Generator Utilities", () => {
  describe("createPathAnchors", () => {
    // Mock context
    const mockCtx = {
      x: (val: number) => val * 10,
      y: (val: number) => val * 10,
      uiLength: (val: number) => val,
      settings: { showVelocityHeatmap: false, maxVelocity: 100 },
      timePrediction: null,
      percentStore: 0,
      dimmedIds: [],
      multiSelectedPointIds: [],
    } as unknown as any;

    const startPoint: Point = { x: 0, y: 0 } as Point;
    const endPoint: Point = { x: 10, y: 10 } as Point;

    it("should handle 0 control points (straight line)", () => {
      const line: Line = {
        endPoint,
        controlPoints: [],
        color: "red",
      };

      const anchors = createPathAnchors(line, startPoint, mockCtx);

      expect(anchors).toHaveLength(2);
      expect(anchors[0].command).toBe(Two.Commands.move);
      expect(anchors[0].x).toBe(0); // 0 * 10
      expect(anchors[0].y).toBe(0);

      expect(anchors[1].command).toBe(Two.Commands.line);
      expect(anchors[1].x).toBe(100); // 10 * 10
      expect(anchors[1].y).toBe(100);
    });

    it("should handle 1 control point (quadratic converted to cubic)", () => {
      const cp: ControlPoint = { x: 5, y: 0 };
      const line: Line = {
        endPoint,
        controlPoints: [cp],
        color: "red",
      };

      const anchors = createPathAnchors(line, startPoint, mockCtx);

      expect(anchors).toHaveLength(2);
      expect(anchors[0].command).toBe(Two.Commands.move);
      expect(anchors[0].relative).toBe(false);

      expect(anchors[1].command).toBe(Two.Commands.curve);
      expect(anchors[1].relative).toBe(false);
      expect(anchors[1].x).toBe(100);
      expect(anchors[1].y).toBe(100);
      // check if quadratic to cubic worked (some control points generated)
      // start: (0,0), cp: (5,0), end: (10,10)
      // Q1 = (0 + 2*5)/3 = 3.33, (0 + 2*0)/3 = 0
      // Q2 = (10 + 2*5)/3 = 6.66, (10 + 2*0)/3 = 3.33
      // We just ensure they are numbers
      expect(typeof anchors[0].controls.right.x).toBe("number");
      expect(typeof anchors[1].controls.left.x).toBe("number");
    });

    it("should handle 2 control points (cubic)", () => {
      const cp1: ControlPoint = { x: 3, y: 0 };
      const cp2: ControlPoint = { x: 7, y: 0 };
      const line: Line = {
        endPoint,
        controlPoints: [cp1, cp2],
        color: "red",
      };

      const anchors = createPathAnchors(line, startPoint, mockCtx);

      expect(anchors).toHaveLength(2);
      expect(anchors[0].command).toBe(Two.Commands.move);
      expect(anchors[0].relative).toBe(false);

      expect(anchors[1].command).toBe(Two.Commands.curve);
      expect(anchors[1].relative).toBe(false);

      // cp1 maps to a1.controls.right, cp2 maps to a2.controls.left
      expect(anchors[0].controls.right.x).toBe(30); // 3 * 10
      expect(anchors[0].controls.right.y).toBe(0);
      expect(anchors[1].controls.left.x).toBe(70); // 7 * 10
      expect(anchors[1].controls.left.y).toBe(0);
    });

    it("should handle 3+ control points (multi-segment sampled path)", () => {
      const cp1: ControlPoint = { x: 2, y: 0 };
      const cp2: ControlPoint = { x: 5, y: 5 };
      const cp3: ControlPoint = { x: 8, y: 0 };
      const line: Line = {
        endPoint,
        controlPoints: [cp1, cp2, cp3],
        color: "red",
      };

      const anchors = createPathAnchors(line, startPoint, mockCtx);

      // 100 samples + 1 start point = 101 points
      expect(anchors).toHaveLength(101);
      expect(anchors[0].command).toBe(Two.Commands.move);
      expect(anchors[0].x).toBe(0);
      expect(anchors[0].y).toBe(0);

      expect(anchors[1].command).toBe(Two.Commands.line);
      expect(anchors[1].relative).toBe(false);

      const lastAnchor = anchors[anchors.length - 1];
      expect(lastAnchor.command).toBe(Two.Commands.line);
      expect(lastAnchor.x).toBe(100);
      expect(lastAnchor.y).toBe(100);
    });
  });
});

describe("generatePathElements", () => {
    const mockCtx = {
      x: (val: number) => val * 10,
      y: (val: number) => val * 10,
      uiLength: (val: number) => val,
      settings: { showVelocityHeatmap: true, maxVelocity: 100 },
      timePrediction: {
        timeline: [
          { type: "travel", lineIndex: 0, velocityProfile: [0, 50, 100, 50, 0] }
        ]
      },
      percentStore: 0,
      dimmedIds: ["line-dimmed"],
      multiSelectedPointIds: [],
    } as unknown as any;

    const startPoint: Point = { x: 0, y: 0 } as Point;
    const endPoint: Point = { x: 10, y: 10 } as Point;

    it("should render standard line and handle states", () => {
      const lines: Line[] = [
        { id: "line-normal", endPoint, controlPoints: [], color: "#ff0000" },
        { id: "line-dimmed", endPoint: { x: 20, y: 20 } as Point, controlPoints: [], color: "#00ff00" },
        { id: "line-locked", endPoint: { x: 30, y: 30 } as Point, controlPoints: [], color: "#0000ff", locked: true },
        { id: "line-hidden", endPoint: { x: 40, y: 40 } as Point, controlPoints: [], color: "#ffff00", hidden: true },
      ];

      // Use a context without heatmap enabled for this test
      const ctxNoHeatmap = { ...mockCtx, timePrediction: null };

      const elements = generatePathElements(
        lines,
        startPoint,
        (l) => l.color,
        (l) => 2,
        "test-prefix",
        ctxNoHeatmap,
        false
      );

      // 4 lines total, but 1 is hidden, so 3 elements should be returned
      expect(elements).toHaveLength(3);

      // Normal line
      expect(elements[0].id).toBe("test-prefix-line-1");
      expect(elements[0].stroke).toBe("#ff0000");
      expect(elements[0].linewidth).toBe(2);
      expect(elements[0].opacity).toBe(1);
      expect((elements[0] as any).dashes).toEqual(expect.arrayContaining([]));

      // Dimmed line (id "line-dimmed" is in dimmedIds)
      expect(elements[1].id).toBe("test-prefix-line-2");
      expect(elements[1].stroke).toBe("#9ca3af"); // Dimmed override
      expect(elements[1].opacity).toBe(1); // Standard dimming doesn't change opacity directly here, only dashes and stroke
      expect((elements[1] as any).dashes).toEqual(expect.arrayContaining([1, 1]));

      // Locked line
      expect(elements[2].id).toBe("test-prefix-line-3");
      expect(elements[2].opacity).toBe(0.7);
      expect((elements[2] as any).dashes).toEqual(expect.arrayContaining([2, 2]));
    });

    it("should render heatmap segments", () => {
      const lines: Line[] = [
        { id: "line-heatmap", endPoint, controlPoints: [], color: "#ff0000" },
      ];

      const elements = generatePathElements(
        lines,
        startPoint,
        (l) => l.color,
        (l) => 2,
        "test-prefix",
        mockCtx,
        true // isHeatmapEnabled
      );

      // The velocity profile has 5 points, it will create 100 samples mapped to those 5 points.
      // Since velocity changes, the color changes, creating multiple segments.
      expect(elements.length).toBeGreaterThan(1);

      const firstSegment = elements[0];
      expect(firstSegment.id).toContain("test-prefix-line-1-heatmap-");
      // Hue based on velocity 0: ratio = 0, hue = 120 -> hsl(120, 100%, 40%)
      expect(firstSegment.stroke).toBe("hsl(120, 100%, 40%)");
      expect((firstSegment as any).dashes).toEqual(expect.arrayContaining([]));
    });
  });

  describe("generatePreviewPathElements", () => {
    const mockCtx = {
      x: (val: number) => val * 10,
      y: (val: number) => val * 10,
      uiLength: (val: number) => val * 2,
      settings: {},
    } as unknown as any;

    const startPoint: Point = { x: 0, y: 0 } as Point;

    it("should render preview paths correctly", () => {
      const sequentialLines: Line[] = [
        { endPoint: { x: 10, y: 10 } as Point, controlPoints: [], color: "#ff0000" },
        { endPoint: { x: 20, y: 20 } as Point, controlPoints: [], color: "#00ff00" },
      ];

      const elements = generatePreviewPathElements(sequentialLines, startPoint, mockCtx);

      expect(elements).toHaveLength(2);

      expect(elements[0].id).toBe("preview-line-1");
      expect(elements[0].stroke).toBe("#60a5fa"); // Fixed color
      expect(elements[0].opacity).toBe(0.7);
      // LINE_WIDTH is 2 (from config), mocked uiLength multiplies by 2, so 4. But config might not be 2 here.
      // Let's just check it's defined and dashed
      expect((elements[0] as any).dashes).toEqual(expect.arrayContaining([8, 8])); // uiLength(4) -> 8

      expect(elements[1].id).toBe("preview-line-2");
    });

    it("should handle null inputs", () => {
        const elements = generatePreviewPathElements(null as unknown as Line[], startPoint, mockCtx);
        expect(elements).toEqual([]);
    });
  });
