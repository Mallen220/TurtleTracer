// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi } from "vitest";
import { generateJavaCode } from "../lib/exporters/javaExporter";
import { generatePointsArray } from "../lib/exporters/pointsExporter";
import { generateSequentialCommandCode } from "../lib/exporters/sequentialExporter";
import type { Point, Line, SequenceItem } from "../types";
import { registerCoreUI } from "../lib/coreRegistrations";

// Register actions for tests
registerCoreUI();
import { pathKind, waitKind } from "./testUtils";

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
      expect(code).toContain("public Path line1;");
      expect(code).toContain("line1 = line(");
      expect(code).toContain(".constant(Math.toRadians(90))");
    });

    it("should generate code with BezierCurve and Linear Heading", async () => {
      const lines = [line2];
      const code = await generateJavaCode(startPoint, lines, false);

      expect(code).toContain("curve(");
      expect(code).not.toContain("Paths.curve(");
      expect(code).toContain(
        ".linear(Math.toRadians(90), Math.toRadians(180))",
      );
    });

    it("should generate code with Tangential Heading and Reverse", async () => {
      const lines = [line3];
      const code = await generateJavaCode(startPoint, lines, false);

      expect(code).toContain(".reverseTangent()");
    });

    it("should generate code with Facing Point Heading", async () => {
      const facingPointLine: Line = {
        id: "line4",
        name: "line4",
        endPoint: {
          x: 50,
          y: 0,
          heading: "facingPoint",
          targetX: 20,
          targetY: 30,
          reverse: false,
        },
        controlPoints: [],
        color: "#000",
        locked: false,
      };
      const code = await generateJavaCode(startPoint, [facingPointLine], false);
      expect(code).toContain(".facingPoint(p.of(20.000, 30.000, 0.0))");

      facingPointLine.endPoint.reverse = true;
      const codeReverse = await generateJavaCode(
        startPoint,
        [facingPointLine],
        false,
      );
      expect(codeReverse).toContain(
        ".heading(Interpolator.facingPoint(p.of(20.000, 30.000, 0.0)).reverse())",
      );
    });

    it("should keep Paths class purely geometric without event markers in basic java export", async () => {
      const lines = [line3];
      const code = await generateJavaCode(startPoint, lines, false);

      expect(code).toContain("line3 = curve(");
      expect(code).not.toContain(".onParametric");
      expect(code).not.toContain(".onTemporal");
      expect(code).not.toContain(".onSpatial");
      expect(code).not.toContain("addParametricCallback");
    });

    it("should export event markers on ProgressTracker in full autonomous OpMode", async () => {
      const lines = [line3];
      const code = await generateJavaCode(startPoint, lines, true);

      expect(code).toContain(
        "import com.turtletracerlib.pathing.NamedCommands;",
      );
      expect(code).toContain(
        "import com.turtletracerlib.pathing.ProgressTracker;",
      );
      expect(code).toContain("private ProgressTracker tracker;");
      expect(code).toContain(
        "tracker = new ProgressTracker(follower, telemetry);",
      );
      expect(code).toContain(
        'tracker.onParametric(0.500, NamedCommands.getCommand("marker1"));',
      );
      expect(code).toContain("tracker.update();");
      expect(code).toContain("tracker.setCurrentPath(paths.line3);");
      // Paths class inside OpMode must remain pure geometry
      expect(code).not.toContain(".reverseTangent().onParametric");
    });

    it("should export temporal and spatial event markers using onTemporal and onSpatial on ProgressTracker", async () => {
      const lineWithEvents: Line = {
        id: "l_events",
        name: "eventLine",
        controlPoints: [],
        endPoint: { x: 30, y: 30, heading: "constant", degrees: 0 },
        color: "#000000",
        eventMarkers: [
          {
            id: "t1",
            name: "tempMarker",
            type: "temporal",
            position: 0,
            time: 750,
          },
          {
            id: "s1",
            name: "spatMarker",
            type: "pose",
            position: 0,
            poseX: 15,
            poseY: 20,
            poseHeading: 90,
            radius: 1.5,
          } as any,
        ],
      };

      const code = await generateJavaCode(startPoint, [lineWithEvents], true);
      expect(code).toContain(
        'tracker.onTemporal(750, NamedCommands.getCommand("tempMarker"));',
      );
      expect(code).toContain(
        'tracker.onSpatial(p.of(15.000, 20.000, 90.000), 1.5, NamedCommands.getCommand("spatMarker"));',
      );
      expect(code).not.toContain("addTemporalCallback");
      expect(code).not.toContain("addPoseCallback");
    });

    it("should include NamedCommands import when exportFullCode has event markers", async () => {
      const lines = [line3];
      const code = await generateJavaCode(startPoint, lines, true);

      expect(code).toContain(
        "import com.turtletracerlib.pathing.NamedCommands;",
      );
    });

    it("should generate full OpMode code when exportFullCode is true", async () => {
      const lines = [line1];
      const code = await generateJavaCode(startPoint, lines, true);

      expect(code).toContain(
        "package org.firstinspires.ftc.teamcode.Commands.AutoCommands;",
      );
      expect(code).toContain(
        "public class TurtleTracerAutonomous extends OpMode",
      );
      expect(code).toContain("paths = new Paths(follower);");
      expect(code).toContain("import static com.pedropathing.api.Paths.curve;");
      expect(code).toContain("import static com.pedropathing.api.Paths.line;");
      expect(code).toContain("import static com.pedropathing.api.Paths.path;");
      expect(code).toContain("import com.pedropathing.api.PoseFactory;");
      expect(code).toContain(
        "private final PoseFactory p = PoseFactory.degrees();",
      );
      expect(code).toContain(
        "private static final PoseFactory p = PoseFactory.degrees();",
      );
      expect(code).not.toContain("import com.pedropathing.api.Paths;");
    });

    it("should handle empty lines array", async () => {
      const code = await generateJavaCode(startPoint, [], false);
      expect(code).toContain("public static class Paths");
      // Should not contain any paths
      expect(code).not.toContain("public Path ");
    });

    it("should omit wait events in sequence when provided", async () => {
      const sequence: SequenceItem[] = [
        {
          kind: waitKind(),
          durationMs: 500,
          eventMarkers: [{ name: "waitMarker", position: 0.5 }],
        } as any,
      ];
      // generateJavaCode uses sequence ONLY to collect event marker names for NamedCommands
      const code = await generateJavaCode(startPoint, [], false, sequence);

      expect(code).not.toContain(
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

      // Check unique variables
      expect(code).toMatch(/public Path Score;/);
      expect(code).toMatch(/public Path Score_1;/);
      expect(code).toMatch(/public Path Park;/);

      // Check initialization - check for assignment
      expect(code).toMatch(/Score = line/);
      expect(code).toMatch(/Score_1 = curve/);
    });

    const setupTangentTest = () => {
      const line: Line = {
        id: "l1",
        endPoint: { x: 20, y: 20, heading: "tangential", reverse: false },
        controlPoints: [],
        color: "black",
      };
      return line;
    };

    it("should use correct start heading in setStartingPose", async () => {
      // Create a line that forces a specific start heading
      // For a line from (10,10) to (20,20), the tangent is 45 degrees.
      // If endPoint.heading is 'tangential', the start heading should be 45.
      const line = setupTangentTest();

      const code = await generateJavaCode(startPoint, [line], true);

      // startPoint is (10,10). Tangent to (20,20) is 45 degrees.
      // Math.toRadians(45) approx 0.785
      // 45 degrees
      expect(code).toContain("follower.setPose(p.of(10.000, 10.000, 45.000))");
    });

    it("should use default start heading if lines array is empty", async () => {
      // construct a point without the constant-heading `degrees` field so it
      // matches the linear variant of Point.
      const sp: Point = {
        x: startPoint.x,
        y: startPoint.y,
        heading: "linear",
        startDeg: 120,
        endDeg: 180,
      };
      const code = await generateJavaCode(sp, [], true);
      expect(code).toContain("follower.setPose(p.of(10.000, 10.000, 120.000))");
    });

    it("uses geometric start heading when path geometry exists (updates with position)", async () => {
      // startPoint explicitly requests a different startDeg than geometry
      const sp: Point = {
        x: 10,
        y: 10,
        heading: "linear",
        startDeg: 123,
        endDeg: 180,
      };

      // A line whose geometric tangent would be 45 degrees (different from 123)
      const line = setupTangentTest();

      const code = await generateJavaCode(sp, [line], true);

      // When line geometry exists, export should reflect the geometric start heading (45°),
      // so updating the start position will change the exported angle accordingly.
      expect(code).toContain("follower.setPose(p.of(10.000, 10.000, 45.000))");
    });
  });

  describe("generateSequentialCommandCode", () => {
    it("should generate basic sequential code", async () => {
      const lines = [line1];
      const code = await generateSequentialCommandCode(
        startPoint,
        lines,
        "TestPath.turt",
      );

      expect(code).toContain(
        "public class TestPath extends SequentialCommandGroup",
      );
      expect(code).toContain(
        "new FollowPathCommand(follower, startPointTOline1)",
      );
    });

    it("should handle NextFTC library and structure", async () => {
      const lines = [line1];
      const code = await generateSequentialCommandCode(
        startPoint,
        lines,
        "TestPath.turt",
        undefined,
        "NextFTC",
      );

      expect(code).toContain(
        "import dev.nextftc.core.commands.groups.SequentialGroup",
      );
      expect(code).toContain("public class TestPath extends Command");
      expect(code).toContain("private Command group;");

      // Constructor shouldn't contain addCommands
      expect(code).not.toContain("addCommands(");

      // Check Imports
      expect(code).toContain("import dev.nextftc.core.commands.Command;");
      expect(code).toContain(
        "import dev.nextftc.core.commands.groups.SequentialGroup;",
      );
      expect(code).toContain(
        "import dev.nextftc.core.commands.delays.WaitUntil;",
      );
      expect(code).toContain(
        "import org.firstinspires.ftc.teamcode.pedroPathing.FollowPath;",
      );

      // Check Methods
      expect(code).toContain("public void start() {");
      expect(code).toContain("buildPaths();");
      expect(code).toContain("group = new SequentialGroup(");
      expect(code).toContain("new FollowPath(startPointTOline1)");
      expect(code).toContain("group.start();");

      expect(code).toContain("public void update() {");
      expect(code).toContain("if (group != null) group.update();");

      expect(code).toContain("public void stop(boolean interrupted) {");
      expect(code).toContain("if (group != null) group.stop(interrupted);");

      expect(code).toContain("public boolean isDone() {");
      expect(code).toContain("return group != null && group.isDone();");

      // Verify no ProgressTracker or Telemetry
      expect(code).not.toContain("ProgressTracker progressTracker");
      expect(code).not.toContain(
        "import com.turtletracerlib.pathing.ProgressTracker;",
      );
      expect(code).not.toContain(
        "public TestPath(final Drivetrain drive, HardwareMap hw, Telemetry telemetry)",
      );
      expect(code).toContain(
        "public TestPath(final Drivetrain drive, HardwareMap hw) throws IOException",
      );
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
        "TestPath.turt",
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
        "TestPath.turt",
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
        "TestPath.turt",
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
            { name: "endWait", position: 1 },
          ],
        } as any,
      ];
      const code = await generateSequentialCommandCode(
        startPoint,
        [],
        "TestPath.turt",
        sequence,
      );

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
        "TestPath.turt",
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
      expect(code).toMatch(/private Path startPointTOA;/);
      expect(code).toMatch(/private Path ATOB;/);
      expect(code).toMatch(/private Path BTOA;/);

      // Test duplicate path naming
      const makeLine = (id: string, name: string, x: number, y: number) =>
        ({
          id,
          endPoint: { x, y },
          controlPoints: [],
          color: "r",
          name,
          heading: "constant",
          degrees: 0,
        }) as any;

      const loopLines: Line[] = [
        makeLine("1", "A", 10, 10),
        makeLine("2", "B", 20, 20),
        makeLine("3", "A", 10, 10),
        makeLine("4", "B", 20, 20),
      ];

      const loopCode = await generateSequentialCommandCode(
        startPoint,
        loopLines,
        "TestPath.turt",
      );
      expect(loopCode).toMatch(/private Path ATOB;/);
      expect(loopCode).toMatch(/private Path ATOB_1;/);
      expect(loopCode).toMatch(/ATOB = line/);
      expect(loopCode).toMatch(/ATOB_1 = line/);
    });

    it("should use TurtleTracerReader when hardcodeValues is false", async () => {
      const lines = [line1];
      const code = await generateSequentialCommandCode(
        startPoint,
        lines,
        "TestPath.turt",
        undefined,
        "SolversLib",
        "org.firstinspires.ftc.teamcode.Commands.AutoCommands",
        false, // hardcodeValues: false
      );

      expect(code).toContain("import com.turtletracerlib.TurtleTracerReader;");
      expect(code).toContain(
        'TurtleTracerReader pp = new TurtleTracerReader("TestPath.turt", hw.appContext);',
      );
      expect(code).toContain('pp.get("startPoint");');
      expect(code).toContain('pp.get("line1");');
      expect(code).not.toContain("PedroPathReader");
    });

    it("should embed pose data when hardcodeValues is true", async () => {
      const lines = [line1, line2]; // Add line2 which has linear heading
      const code = await generateSequentialCommandCode(
        startPoint,
        lines,
        "TestPath.turt",
        undefined,
        "SolversLib",
        "org.firstinspires.ftc.teamcode.Commands.AutoCommands",
        true, // hardcodeValues
      );

      expect(code).not.toContain(
        "import com.turtletracerlib.TurtleTracerReader;",
      );
      expect(code).not.toContain("new TurtleTracerReader");
      expect(code).not.toContain("PedroPathReader");
      expect(code).toContain("import com.pedropathing.api.PoseFactory;");
      expect(code).toContain(
        "private final PoseFactory p = PoseFactory.degrees();",
      );
      expect(code).toContain("startPoint = p.of(10.000, 10.000, 0);"); // startPoint
      // Check line1 (constant 90)
      expect(code).toContain("line1 = p.of(20.000, 20.000, 90);");
      // Check line2 (linear 90 -> 180). End point should use endDeg (180)
      expect(code).toContain("line2 = p.of(30.000, 10.000, 180);");
      // Check control point
      expect(code).toContain(
        "line2_line1_control1 = p.of(25.000, 15.000, 0.0);",
      );

      expect(code).not.toContain("pp.get(");

      // Check hardcoded heading interpolation
      expect(code).toContain(".constant(Math.toRadians(90))");
      expect(code).toContain(
        ".linear(Math.toRadians(90), Math.toRadians(180))",
      );
    });

    it("should register event markers with TurtleTracerReader and ProgressTracker in SolversLib sequential code", async () => {
      const lines = [line3];
      const code = await generateSequentialCommandCode(
        startPoint,
        lines,
        "TestPath.turt",
        undefined,
        "SolversLib",
        "org.firstinspires.ftc.teamcode.Commands.AutoCommands",
        false, // hardcodeValues: false
      );

      // Verify buildPaths is purely geometric without onParametric
      expect(code).not.toContain(".onParametric");
      expect(code).not.toContain(".onTemporal");
      expect(code).not.toContain(".onSpatial");

      // Verify TurtleTracerReader and ProgressTracker event binding
      expect(code).toContain(
        "import com.turtletracerlib.pathing.ProgressTracker;",
      );
      expect(code).toContain(
        "import com.turtletracerlib.pathing.NamedCommands;",
      );
      expect(code).toContain(
        'pp.onEvent("marker1", NamedCommands.getCommand("marker1"));',
      );
      expect(code).toContain(
        "ProgressTracker tracker = new ProgressTracker(follower, telemetry);",
      );
      expect(code).toContain("pp.registerEvents(tracker);");
    });

    it("should register event markers with ProgressTracker in NextFTC sequential code (null telemetry)", async () => {
      const lines = [line3];
      const code = await generateSequentialCommandCode(
        startPoint,
        lines,
        "TestPath.turt",
        undefined,
        "NextFTC",
        "org.firstinspires.ftc.teamcode.Commands.AutoCommands",
        false, // hardcodeValues: false
      );

      expect(code).not.toContain(".onParametric");
      expect(code).toContain(
        "import com.turtletracerlib.pathing.ProgressTracker;",
      );
      expect(code).toContain(
        "import com.turtletracerlib.pathing.NamedCommands;",
      );
      expect(code).toContain(
        'pp.onEvent("marker1", NamedCommands.getCommand("marker1"));',
      );
      expect(code).toContain(
        "ProgressTracker tracker = new ProgressTracker(follower, null);",
      );
      expect(code).toContain("pp.registerEvents(tracker);");
    });

    it("should bind event markers to ProgressTracker directly when hardcodeValues is true", async () => {
      const lines = [line3];
      const code = await generateSequentialCommandCode(
        startPoint,
        lines,
        "TestPath.turt",
        undefined,
        "SolversLib",
        "org.firstinspires.ftc.teamcode.Commands.AutoCommands",
        true, // hardcodeValues: true
      );

      expect(code).toContain(
        "import com.turtletracerlib.pathing.ProgressTracker;",
      );
      expect(code).toContain(
        "ProgressTracker tracker = new ProgressTracker(follower, telemetry);",
      );
      expect(code).toContain(
        'tracker.onParametric(0.500, NamedCommands.getCommand("marker1"));',
      );
    });

    it("should export rotate action using Pedro v3 follower.hold and !isBusy", async () => {
      const lines = [line1];
      const sequence: SequenceItem[] = [
        { kind: pathKind(), lineId: "line1" },
        { kind: "rotate", id: "rot1", degrees: 90 } as any,
      ];

      const solversCode = await generateSequentialCommandCode(
        startPoint,
        lines,
        "TestPath.turt",
        sequence,
        "SolversLib",
      );
      expect(solversCode).toContain(
        "follower.hold(follower.pose().withHeading(1.571))",
      );
      expect(solversCode).toContain(
        "new WaitUntilCommand(() -> !follower.isBusy())",
      );
      expect(solversCode).toContain(
        "import com.seattlesolvers.solverslib.command.WaitUntilCommand;",
      );

      const nextFtcCode = await generateSequentialCommandCode(
        startPoint,
        lines,
        "TestPath.turt",
        sequence,
        "NextFTC",
      );
      expect(nextFtcCode).toContain(
        "follower.hold(follower.pose().withHeading(1.571))",
      );
      expect(nextFtcCode).toContain("new WaitUntil(() -> !follower.isBusy())");
      expect(nextFtcCode).toContain(
        "import dev.nextftc.core.commands.delays.WaitUntil;",
      );
    });

    it("should export chained paths using Paths.path in sequential code", async () => {
      const chainedLines: Line[] = [
        {
          id: "l1",
          endPoint: { x: 20, y: 20, heading: "constant", degrees: 0 },
          controlPoints: [],
          color: "blue",
          name: "Line1",
        },
        {
          id: "l2",
          endPoint: { x: 30, y: 30, heading: "constant", degrees: 0 },
          controlPoints: [],
          color: "blue",
          name: "Line2",
          isChain: true,
        },
      ];

      const code = await generateSequentialCommandCode(
        startPoint,
        chainedLines,
        "TestPath.turt",
      );

      expect(code).toContain("startPointTOLine1 = path(");
      expect(code).toContain("line(startPoint, Line1)");
      expect(code).toContain("line(Line1, Line2)");
      expect(code).toContain("import static com.pedropathing.api.Paths.curve;");
      expect(code).toContain("import static com.pedropathing.api.Paths.line;");
      expect(code).toContain("import static com.pedropathing.api.Paths.path;");
      expect(code).not.toContain("import com.pedropathing.api.Paths;");
    });
  });

  describe("rotate in generateJavaCode", () => {
    it("should export rotate action using follower.hold and !follower.isBusy()", async () => {
      const lines = [line1];
      const sequence: SequenceItem[] = [
        { kind: pathKind(), lineId: "line1" },
        { kind: "rotate", id: "rot1", degrees: 90 } as any,
      ];

      const code = await generateJavaCode(startPoint, lines, true, sequence);
      expect(code).toContain(
        "follower.hold(follower.pose().withHeading(1.571));",
      );
      expect(code).toContain("if(!follower.isBusy()) {");
    });
  });

  describe("chained paths in generateJavaCode", () => {
    it("should export chained paths using Paths.path compound path", async () => {
      const chainedLines: Line[] = [
        {
          id: "l1",
          endPoint: { x: 20, y: 20, heading: "tangential", reverse: false },
          controlPoints: [],
          color: "blue",
          name: "Line1",
          globalHeading: "tangential",
        },
        {
          id: "l2",
          endPoint: { x: 30, y: 30, heading: "tangential", reverse: false },
          controlPoints: [],
          color: "blue",
          name: "Line2",
          isChain: true,
        },
      ];

      const code = await generateJavaCode(startPoint, chainedLines, false);
      expect(code).toContain("public Path Line1;");
      expect(code).not.toContain("public Path Line2;");
      expect(code).toContain("Line1 = path(");
      expect(code).not.toContain("Paths.path(");
      expect(code).toContain(".tangent()");
    });
  });

  describe("PoseFactory coordinate systems and units", () => {
    it("should export Java code using buildPose and p.of with FTC coordinates", async () => {
      const lines = [line1];
      const code = await generateJavaCode(
        startPoint,
        lines,
        true,
        undefined,
        "org.firstinspires.ftc.teamcode.Commands.AutoCommands",
        "Panels",
        "FTC",
        "imperial",
      );

      expect(code).toContain("import com.pedropathing.api.PoseFactory;");
      expect(code).toContain(
        "private final PoseFactory p = PoseFactory.degrees();",
      );
      expect(code).toContain("return p.of(y + 72.0, 72.0 - x, heading);");
      expect(code).toContain("follower.setPose(buildPose(");
      expect(code).not.toContain("Math.toRadians(" + "buildPose");
    });

    it("should export Sequential code using buildPose and p.of with FTC coordinates and metric units", async () => {
      const lines = [line1];
      const code = await generateSequentialCommandCode(
        startPoint,
        lines,
        "TestFTCPath.turt",
        undefined,
        "SolversLib",
        "org.firstinspires.ftc.teamcode.Commands.AutoCommands",
        true,
        "FTC",
        "metric",
      );

      expect(code).toContain("import com.pedropathing.api.PoseFactory;");
      expect(code).toContain(
        "private final PoseFactory p = PoseFactory.degrees();",
      );
      expect(code).toContain("return p.of(y + 72.0, 72.0 - x, heading);");
      expect(code).toContain("cmToInches(");
      expect(code).toContain("follower.setPose(startPoint);");
    });
  });
});
