import { describe, it, expect, vi } from "vitest";
import {
  generateJavaCode,
  generatePointsArray,
  generateSequentialCommandCode,
} from "../utils/codeExporter";
import type { Point, Line, SequenceItem } from "../types";

// Mock prettier to just return the code as-is or with simple modification
vi.mock("prettier", () => ({
  default: {
    format: vi.fn().mockImplementation((code) => Promise.resolve(code)),
  },
}));

// Mock prettier-plugin-java
vi.mock("prettier-plugin-java", () => ({
  default: {},
}));

describe("codeExporter", () => {
  const startPoint: Point = {
    x: 10,
    y: 10,
    heading: "constant",
    degrees: 0,
  };

  const line1: Line = {
    id: "line1",
    name: "line1",
    controlPoints: [],
    endPoint: {
      x: 20,
      y: 20,
      heading: "constant",
      degrees: 90,
    },
    color: "#000000",
  };

  const line2: Line = {
    id: "line2",
    name: "line2",
    controlPoints: [{ x: 25, y: 15 }],
    endPoint: {
      x: 30,
      y: 10,
      heading: "linear",
      startDeg: 90,
      endDeg: 180,
    },
    color: "#000000",
  };

  const line3: Line = {
    id: "line3",
    name: "line3",
    controlPoints: [
      { x: 35, y: 5 },
      { x: 40, y: 5 },
    ],
    endPoint: {
      x: 50,
      y: 0,
      heading: "tangential",
      reverse: true,
    },
    color: "#000000",
    eventMarkers: [{ name: "marker1", position: 0.5 }],
  };

  describe("generatePointsArray", () => {
    it("should generate a correct string representation of points", () => {
      const lines = [line1, line2];
      const result = generatePointsArray(startPoint, lines);
      // start: (10.0, 10.0)
      // line1 (no cp): end (20.0, 20.0)
      // line2 (cp 25,15): cp (25.0, 15.0), end (30.0, 10.0)
      expect(result).toBe(
        "[(10.0, 10.0), (20.0, 20.0), (25.0, 15.0), (30.0, 10.0)]",
      );
    });

    it("should handle integer coordinates correctly", () => {
      const result = generatePointsArray(
        { x: 10, y: 10, heading: "constant", degrees: 0 },
        [],
      );
      expect(result).toBe("[(10.0, 10.0)]");
    });
  });

  describe("generateJavaCode", () => {
    it("should generate code for a simple path", async () => {
      const lines = [line1];
      const code = await generateJavaCode(startPoint, lines, false);

      expect(code).toContain("public static class Paths {");
      expect(code).toContain("public PathChain line1;");
      expect(code).toContain("line1 = follower.pathBuilder().addPath(");
      expect(code).toContain("new BezierLine");
      expect(code).toContain(
        "setConstantHeadingInterpolation(Math.toRadians(90))",
      );
    });

    it("should generate code with BezierCurve and Linear Heading", async () => {
      const lines = [line2];
      const code = await generateJavaCode(startPoint, lines, false);

      expect(code).toContain("new BezierCurve");
      expect(code).toContain(
        "setLinearHeadingInterpolation(Math.toRadians(90), Math.toRadians(180))",
      );
    });

    it("should generate code with Tangential Heading and Reverse", async () => {
      const lines = [line3];
      const code = await generateJavaCode(startPoint, lines, false);

      expect(code).toContain("setTangentHeadingInterpolation()");
      expect(code).toContain(".setReversed(true)");
    });

    it("should include event markers", async () => {
      const lines = [line3];
      const code = await generateJavaCode(startPoint, lines, false);

      expect(code).toContain('.addEventMarker(0.500, "marker1")');
      expect(code).toContain(
        '// NamedCommands.registerCommand("marker1", yourmarker1Command);',
      );
    });

    it("should generate full OpMode code when exportFullCode is true", async () => {
      const lines = [line1];
      const code = await generateJavaCode(startPoint, lines, true);

      expect(code).toContain(
        "package org.firstinspires.ftc.teamcode.Commands.AutoCommands;",
      );
      expect(code).toContain("public class PedroAutonomous extends OpMode");
      expect(code).toContain("paths = new Paths(follower);");
    });
  });

  describe("generateSequentialCommandCode", () => {
    it("should generate basic sequential code", async () => {
      const lines = [line1];
      const code = await generateSequentialCommandCode(
        startPoint,
        lines,
        "TestPath.pp",
      );

      expect(code).toContain(
        "public class TestPath extends SequentialCommandGroup",
      );
      expect(code).toContain(
        "new FollowPathCommand(follower, startPointTOline1)",
      );
    });

    it("should handle NextFTC library", async () => {
      const lines = [line1];
      const code = await generateSequentialCommandCode(
        startPoint,
        lines,
        "TestPath.pp",
        undefined,
        "NextFTC",
      );

      expect(code).toContain(
        "import dev.nextftc.core.command.groups.SequentialGroup",
      );
      expect(code).toContain("public class TestPath extends SequentialGroup");
      expect(code).toContain("new FollowPath(startPointTOline1)");
    });

    it("should handle wait commands in sequence", async () => {
      const lines = [line1];
      const sequence: SequenceItem[] = [
        { kind: "path", lineId: "line1" },
        { kind: "wait", durationMs: 1000 } as any,
      ];
      const code = await generateSequentialCommandCode(
        startPoint,
        lines,
        "TestPath.pp",
        sequence,
      );

      expect(code).toContain("new WaitCommand(1000)");
    });
  });
});
