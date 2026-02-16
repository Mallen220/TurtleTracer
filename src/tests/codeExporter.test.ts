// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi } from "vitest";
import {
  generateJavaCode,
  generatePointsArray,
  generateSequentialCommandCode,
} from "../utils/codeExporter";
import type { Point, Line, SequenceItem } from "../types";
import { registerCoreUI } from "../lib/coreRegistrations";

// Register actions for tests
registerCoreUI();
import { actionRegistry } from "../lib/actionRegistry";
import type { SequencePathItem, SequenceWaitItem } from "../types";
const pathKind = (): SequencePathItem["kind"] =>
  (actionRegistry.getAll().find((a: any) => a.isPath)
    ?.kind as SequencePathItem["kind"]) ?? "path";
const waitKind = (): SequenceWaitItem["kind"] =>
  (actionRegistry.getAll().find((a: any) => a.isWait)
    ?.kind as SequenceWaitItem["kind"]) ?? "wait";

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
    eventMarkers: [{ id: "m1", name: "marker1", position: 0.5 }],
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
      // .setReversed() for Java code, not .setReversed(true)
      expect(code).toContain(".setReversed()");
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

    it("should handle empty lines array", async () => {
      const code = await generateJavaCode(startPoint, [], false);
      expect(code).toContain("public static class Paths");
      // Should not contain any paths
      expect(code).not.toContain("public PathChain");
    });

    it("should handle wait events in sequence when provided", async () => {
      const sequence: SequenceItem[] = [
        {
          kind: waitKind(),
          durationMs: 500,
          eventMarkers: [{ name: "waitMarker", position: 0.5 }],
        } as any,
      ];
      // generateJavaCode uses sequence ONLY to collect event marker names for NamedCommands
      const code = await generateJavaCode(startPoint, [], false, sequence);

      expect(code).toContain(
        'NamedCommands.registerCommand("waitMarker", yourwaitMarkerCommand)',
      );
    });

    it("generateJavaCode: handles duplicate path names correctly", async () => {
      const lines: Line[] = [
        {
          id: "line1",
          endPoint: { x: 10, y: 10, heading: "constant", degrees: 45 },
          controlPoints: [],
          color: "#000000",
          name: "Score",
        },
        {
          id: "line2",
          endPoint: { x: 20, y: 20, heading: "constant", degrees: 90 },
          controlPoints: [{ x: 15, y: 15 }],
          color: "#000000",
          name: "Score", // Shared name
        },
        {
          id: "line3",
          endPoint: { x: 30, y: 30, heading: "constant", degrees: 135 },
          controlPoints: [],
          color: "#000000",
          name: "Park",
        },
      ];
      const code = await generateJavaCode(startPoint, lines, false);

      // Check that we have unique variables
      expect(code).toMatch(/public PathChain Score;/);
      expect(code).toMatch(/public PathChain Score_1;/);
      expect(code).toMatch(/public PathChain Park;/);

      // Check initialization - check for assignment
      expect(code).toMatch(/Score = follower/);
      expect(code).toMatch(/Score_1 = follower/);
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
        { kind: pathKind(), lineId: "line1" },
        { kind: waitKind(), durationMs: 1000 } as any,
      ];
      const code = await generateSequentialCommandCode(
        startPoint,
        lines,
        "TestPath.pp",
        sequence,
      );

      expect(code).toContain("new WaitCommand(1000)");
    });

    it("should handle NextFTC wait commands (seconds conversion)", async () => {
      const lines = [line1];
      const sequence: SequenceItem[] = [
        { kind: pathKind(), lineId: "line1" },
        { kind: waitKind(), durationMs: 1500 } as any,
      ];
      const code = await generateSequentialCommandCode(
        startPoint,
        lines,
        "TestPath.pp",
        sequence,
        "NextFTC",
      );

      // NextFTC uses seconds, so 1500ms -> 1.500
      expect(code).toContain("new Delay(1.500)");
    });

    it("should generate auto-names if line names are missing", async () => {
      const unnamedLine = { ...line1, name: "" };
      const lines = [unnamedLine];
      const code = await generateSequentialCommandCode(
        startPoint,
        lines,
        "TestPath.pp",
      );

      expect(code).toContain("private Pose point1;");
      expect(code).toContain('point1 = pp.get("point1");');
    });

    it("should handle wait events with markers", async () => {
      const sequence: SequenceItem[] = [
        {
          kind: waitKind(),
          durationMs: 2000,
          eventMarkers: [
            { name: "midWait", position: 0.5 },
            { name: "endWait", position: 1.0 },
          ],
        } as any,
      ];
      const code = await generateSequentialCommandCode(
        startPoint,
        [],
        "TestPath.pp",
        sequence,
      );

      expect(code).toContain("ParallelRaceGroup");
      expect(code).toContain('progressTracker.executeEvent("midWait")');
      // 2000ms * 0.5 = 1000
      expect(code).toContain("new WaitCommand(1000)");
    });

    it("generateSequentialCommandCode: handles shared poses and naming", async () => {
      const linkedLines: Line[] = [
        {
          id: "l1",
          endPoint: { x: 10, y: 10, heading: "constant", degrees: 0 },
          controlPoints: [],
          color: "red",
          name: "A",
        },
        {
          id: "l2",
          endPoint: { x: 20, y: 20, heading: "constant", degrees: 0 },
          controlPoints: [{ x: 15, y: 15 }],
          color: "red",
          name: "B",
        },
        {
          id: "l3",
          endPoint: { x: 10, y: 10, heading: "constant", degrees: 0 },
          controlPoints: [{ x: 25, y: 15 }],
          color: "red",
          name: "A",
        },
      ];

      const code = await generateSequentialCommandCode(
        startPoint,
        linkedLines,
        "TestPath.pp",
      );

      // 1. Shared Pose Declarations
      // "A" should be declared once
      const matchesA = code.match(/private Pose A;/g);
      expect(matchesA?.length).toBe(1);

      // "B" should be declared once
      const matchesB = code.match(/private Pose B;/g);
      expect(matchesB?.length).toBe(1);

      // Initialization
      const initA = code.match(/A = pp.get\("A"\);/g);
      expect(initA?.length).toBe(1);

      // 3. Path Naming
      expect(code).toMatch(/private PathChain startPointTOA;/);
      expect(code).toMatch(/private PathChain ATOB;/);
      expect(code).toMatch(/private PathChain BTOA;/);

      // Test duplicate path naming
      const loopLines: Line[] = [
        {
          id: "1",
          endPoint: { x: 10, y: 10 },
          controlPoints: [],
          color: "r",
          name: "A",
          heading: "constant",
          degrees: 0,
        } as any,
        {
          id: "2",
          endPoint: { x: 20, y: 20 },
          controlPoints: [],
          color: "r",
          name: "B",
          heading: "constant",
          degrees: 0,
        } as any,
        {
          id: "3",
          endPoint: { x: 10, y: 10 },
          controlPoints: [],
          color: "r",
          name: "A",
          heading: "constant",
          degrees: 0,
        } as any,
        {
          id: "4",
          endPoint: { x: 20, y: 20 },
          controlPoints: [],
          color: "r",
          name: "B",
          heading: "constant",
          degrees: 0,
        } as any,
      ];

      const loopCode = await generateSequentialCommandCode(
        startPoint,
        loopLines,
        "TestPath.pp",
      );
      expect(loopCode).toMatch(/private PathChain ATOB;/);
      expect(loopCode).toMatch(/private PathChain ATOB_1;/);
      expect(loopCode).toMatch(/ATOB = follower/);
      expect(loopCode).toMatch(/ATOB_1 = follower/);
    });

    it("should embed pose data when hardcodeValues is true", async () => {
      const lines = [line1, line2]; // Add line2 which has linear heading
      const code = await generateSequentialCommandCode(
        startPoint,
        lines,
        "TestPath.pp",
        undefined,
        "SolversLib",
        "org.firstinspires.ftc.teamcode.Commands.AutoCommands",
        true, // hardcodeValues
      );

      expect(code).not.toContain(
        "import com.pedropathingplus.PedroPathReader;",
      );
      expect(code).not.toContain("new PedroPathReader");
      expect(code).toContain("new Pose(10.000, 10.000, Math.toRadians(0))"); // startPoint
      // Check line1 (constant 90)
      expect(code).toContain("new Pose(20.000, 20.000, Math.toRadians(90))");
      // Check line2 (linear 90 -> 180). End point should use endDeg (180)
      expect(code).toContain("new Pose(30.000, 10.000, Math.toRadians(180))");

      expect(code).not.toContain("pp.get(");

      // Check hardcoded heading interpolation
      expect(code).toContain(
        "setConstantHeadingInterpolation(Math.toRadians(90))",
      );
      expect(code).toContain(
        "setLinearHeadingInterpolation(Math.toRadians(90), Math.toRadians(180))",
      );
    });
  });
});
