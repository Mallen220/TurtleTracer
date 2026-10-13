// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeAll } from "vitest";
import { get } from "svelte/store";
import { readPedroJava } from "../utils/javaImporter/pedroReader";
import { registerCoreUI } from "../lib/coreRegistrations";
import { exporterRegistry } from "../lib/exporters";
import "../lib/exporters/javaExporter";
import "../lib/exporters/sequentialExporter";
import { DEFAULT_SETTINGS } from "../config/defaults";
import type { Line, Point, SequenceItem, TurtleData } from "../types";

beforeAll(() => registerCoreUI());

/** A project that uses every heading, a chain with its own heading, waits, turns and markers. */
const project: TurtleData = {
  startPoint: { x: 9, y: 25, heading: "constant", degrees: 0 } as Point,
  lines: [
    {
      id: "a",
      name: "Score",
      endPoint: { x: 40, y: 30, heading: "linear", startDeg: 0, endDeg: 90 },
      controlPoints: [],
      color: "#fff",
      eventMarkers: [{ id: "m1", name: "Intake", position: 0.5 }],
    },
    {
      id: "b",
      name: "Swing",
      endPoint: { x: 70, y: 60, heading: "tangential", reverse: true },
      controlPoints: [{ x: 60, y: 20 }],
      color: "#fff",
    },
    {
      id: "c",
      name: "Face",
      endPoint: {
        x: 90,
        y: 90,
        heading: "facingPoint",
        targetX: 72,
        targetY: 72,
      },
      controlPoints: [
        { x: 80, y: 60 },
        { x: 70, y: 100 },
      ],
      color: "#fff",
    },
    {
      id: "d",
      name: "Hold",
      endPoint: { x: 100, y: 100, heading: "constant", degrees: 45 },
      controlPoints: [],
      color: "#fff",
      globalHeading: "constant",
      globalDegrees: 30,
    },
    {
      id: "e",
      name: "Chained",
      endPoint: { x: 110, y: 120, heading: "constant", degrees: 30 },
      controlPoints: [],
      color: "#fff",
      isChain: true,
    },
    {
      id: "f",
      name: "Pieces",
      endPoint: {
        x: 60,
        y: 120,
        heading: "piecewise",
        segments: [
          { tStart: 0, tEnd: 0.5, heading: "tangential" },
          { tStart: 0.5, tEnd: 1, heading: "constant", degrees: 180 },
        ],
      } as unknown as Point,
      controlPoints: [],
      color: "#fff",
    },
  ] as Line[],
  sequence: [
    { kind: "path", lineId: "a" },
    { kind: "path", lineId: "b" },
    { kind: "wait", id: "w", name: "", durationMs: 750 },
    { kind: "path", lineId: "c" },
    { kind: "rotate", id: "r", name: "Rotate", degrees: 120 },
    { kind: "path", lineId: "d" },
    { kind: "path", lineId: "e", isChain: true },
    { kind: "path", lineId: "f" },
  ] as SequenceItem[],
  shapes: [],
};

const FORMATS = [
  ["the OpMode", "java", {}],
  [
    "the OpMode in FTC coordinates and cm",
    "java",
    { coordinateSystem: "FTC", codeUnits: "metric" },
  ],
  [
    "SolversLib loading poses from the project",
    "sequential",
    { targetLibrary: "SolversLib" },
  ],
  [
    "SolversLib",
    "sequential",
    { targetLibrary: "SolversLib", hardcodeValues: true },
  ],
  ["NextFTC", "sequential", { targetLibrary: "NextFTC", hardcodeValues: true }],
  [
    "Ivy in FTC coordinates",
    "sequential",
    { targetLibrary: "Ivy", hardcodeValues: true, coordinateSystem: "FTC" },
  ],
] as const;

async function exported(format: string, options: object) {
  const exporter = get(exporterRegistry)[format]!;
  return exporter.exportCode(project, {
    ...DEFAULT_SETTINGS,
    fileName: "Auto",
    exportFullCode: true,
    packageName: "org.firstinspires.ftc.teamcode",
    ...options,
  });
}

describe("reading the code the app exports", () => {
  it.each(FORMATS)(
    "gets the project back from %s",
    async (_, format, options) => {
      const code = await exported(format, options);
      const { project: read, notes } = readPedroJava(code, {
        projectFile: (name) => (name === "Auto.turt" ? project : null),
      });
      expect(notes).toEqual([]);
      expect(read.startPoint).toMatchObject({ x: 9, y: 25 });

      const lines = read.lines;
      // The OpMode writes a chain as one path, so the paths after its first
      // are named after it.
      expect(lines.map((l) => l.name)).toEqual([
        "Score",
        "Swing",
        "Face",
        "Hold",
        format === "java" ? "Hold 2" : "Chained",
        "Pieces",
      ]);
      project.lines.forEach((original, i) => {
        expect(lines[i]!.endPoint.x).toBeCloseTo(original.endPoint.x, 2);
        expect(lines[i]!.endPoint.y).toBeCloseTo(original.endPoint.y, 2);
        expect(lines[i]!.controlPoints).toHaveLength(
          original.controlPoints.length,
        );
        original.controlPoints.forEach((c, k) => {
          expect(lines[i]!.controlPoints[k]!.x).toBeCloseTo(c.x, 2);
          expect(lines[i]!.controlPoints[k]!.y).toBeCloseTo(c.y, 2);
        });
        expect(!!lines[i]!.isChain).toBe(!!original.isChain);
      });

      expect(lines[0]!.endPoint).toMatchObject({
        heading: "linear",
        startDeg: 0,
        endDeg: 90,
      });
      expect(lines[1]!.endPoint).toMatchObject({
        heading: "tangential",
        reverse: true,
      });
      expect(lines[2]!.endPoint).toMatchObject({ heading: "facingPoint" });
      expect(lines[2]!.endPoint.targetX).toBeCloseTo(72, 2);
      expect(lines[3]).toMatchObject({
        globalHeading: "constant",
        globalDegrees: 30,
      });
      expect(lines[5]!.endPoint).toMatchObject({
        heading: "piecewise",
        segments: [
          { tStart: 0, tEnd: 0.5, heading: "tangential" },
          { tStart: 0.5, tEnd: 1, heading: "constant", degrees: 180 },
        ],
      });
      expect(lines[0]!.eventMarkers).toMatchObject([
        { name: "Intake", position: 0.5 },
      ]);

      // The paths in order, with the wait and turn between them.
      expect(
        read.sequence.map((s) =>
          s.kind === "path"
            ? `path${s.isChain ? " chained" : ""}`
            : s.kind === "wait"
              ? `wait ${s.durationMs}`
              : `turn ${(s as { degrees: number }).degrees}`,
        ),
      ).toEqual([
        "path",
        "path",
        "wait 750",
        "path",
        "turn 120",
        "path",
        "path chained",
        "path",
      ]);
    },
  );

  it("says which project file it couldn't find", async () => {
    const code = await exported("sequential", { targetLibrary: "SolversLib" });
    const { project: read, notes } = readPedroJava(code);
    expect(read.lines).toHaveLength(0);
    expect(notes[0]!.message).toBe(
      "Couldn't find Auto.turt, which this loads its poses from.",
    );
    expect(notes[0]!.line).toBeGreaterThan(0);
  });
});

describe("reading code people write", () => {
  it("works out poses, arithmetic and the order paths are followed in", () => {
    const { project: read, notes } = readPedroJava(`
      public class Auto extends OpMode {
        private final Pose start = new Pose(8, 72, Math.PI);
        private final Pose score = new Pose(8 + 30, 72 * 1.5, Math.toRadians(90));
        private final Pose park = new Pose(20, 20);
        private Path toScore, toPark;

        public void init() {
          follower.setStartingPose(start);
          toPark = line(score, park).constant(Math.PI / 2);
          toScore = curve(start, new Pose(30, 80), score).tangent();
        }

        public void loop() {
          switch (state) {
            case 0: follower.follow(toScore); state = 1; break;
            case 1: if (pathTimer.getElapsedTimeSeconds() > 1.5) state = 2; break;
            case 2: follower.follow(toPark); break;
          }
        }
      }
    `);
    expect(notes).toEqual([]);
    expect(read.startPoint).toMatchObject({ x: 8, y: 72, degrees: 180 });
    expect(read.lines.map((l) => l.name)).toEqual(["score", "park"]);
    expect(read.lines[0]!.endPoint).toMatchObject({
      x: 38,
      y: 108,
      heading: "tangential",
    });
    expect(read.lines[0]!.controlPoints).toEqual([{ x: 30, y: 80 }]);
    expect(read.lines[1]!.endPoint).toMatchObject({
      heading: "constant",
      degrees: 90,
    });
    expect(read.sequence.map((s) => s.kind)).toEqual(["path", "wait", "path"]);
    expect(read.sequence[1]).toMatchObject({ durationMs: 1500 });
  });

  it("notes what it couldn't read, with the line", () => {
    const { project: read, notes } = readPedroJava(
      [
        "class Auto {",
        "  Pose a = new Pose(0, 0);",
        "  Path p = line(a, mystery);",
        "  Path q = line(a, new Pose(10, 10));",
        "}",
      ].join("\n"),
    );
    expect(read.lines).toHaveLength(1);
    expect(notes).toEqual([
      { line: 3, message: "Couldn't find where mystery is." },
    ]);
  });

  it("reads the same file the same way each time, so the field doesn't flicker", () => {
    const code = "Path p = line(new Pose(0, 0), new Pose(10, 10)).tangent();";
    const first = readPedroJava(code).project.lines[0]!;
    const again = readPedroJava(code).project.lines[0]!;
    expect(again.id).toBe(first.id);
    expect(again.color).toBe(first.color);
  });
});
