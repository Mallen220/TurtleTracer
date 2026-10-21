// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeAll } from "vitest";
import { generateJavaCode } from "../lib/exporters/javaExporter";
import { registerCoreUI } from "../lib/coreRegistrations";
import { actionRegistry } from "../lib/actionRegistry";
import type { Line, Point, SequenceItem } from "../types";

beforeAll(() => registerCoreUI());

const start: Point = { x: 10, y: 10, heading: "constant", degrees: 0 };
const lines: Line[] = [
  {
    id: "a",
    name: "Score",
    endPoint: { x: 20, y: 20, heading: "constant", degrees: 90 } as Point,
    controlPoints: [],
    color: "red",
    eventMarkers: [{ id: "m", name: "Intake", position: 0.5 } as any],
  },
  {
    id: "b",
    name: "in",
    endPoint: { x: 40, y: 20, heading: "tangential" } as Point,
    controlPoints: [{ x: 30, y: 30 }],
    color: "red",
  },
];
const sequence: SequenceItem[] = [
  { kind: "path", lineId: "a" },
  { kind: "wait", id: "w", name: "", durationMs: 500 } as any,
  { kind: "rotate", id: "r", name: "Rotate", degrees: 90 } as any,
  { kind: "path", lineId: "b" },
];

const kotlin = (
  o: {
    full?: boolean;
    telemetry?: "Panels" | "Dashboard" | "Standard" | "None";
    system?: "Pedro" | "FTC";
    units?: "imperial" | "metric";
    seq?: SequenceItem[];
  } = {},
) =>
  generateJavaCode(
    start,
    lines,
    o.full ?? true,
    o.seq ?? sequence,
    "org.team.auto",
    o.telemetry ?? "Standard",
    o.system ?? "Pedro",
    o.units ?? "imperial",
    "Red Close.turt",
    "kotlin",
  );

describe("the OpMode export in Kotlin", () => {
  it("writes a Kotlin OpMode with a when state machine and no command library", async () => {
    const code = await kotlin();
    expect(code).toContain("package org.team.auto\n");
    expect(code).toContain(
      '@Autonomous(name = "Red Close", group = "Autonomous")',
    );
    expect(code).toContain("class Red_Close : OpMode() {");
    expect(code).toContain("override fun init() {");
    expect(code).toContain("follower = Constants.create(hardwareMap)");
    expect(code).toContain("when (pathState) {");
    expect(code).toContain(
      "            0 -> {\n                follower.follow(paths.Score)",
    );
    expect(code).toContain("if(pathTimer.milliseconds() > 500) {");
    expect(code).toContain(
      "requestOpModeStop()\n                pathState = -1",
    );
    expect(code).not.toMatch(/\bnew [A-Z]|;\s*$|\bcase \d|\bbreak\b/m);
    expect(code).not.toMatch(/solverslib|nextftc|ivy/i);
  });

  it("keeps the paths in a nested class, its helpers in a companion object", async () => {
    const code = await kotlin({ system: "FTC", units: "metric" });
    expect(code).toContain("class Paths {");
    expect(code).toContain("val Score: Path");
    // A Kotlin keyword as a name still works.
    expect(code).toContain("val `in`: Path");
    expect(code).toContain("follower.follow(paths.`in`)");
    expect(code).toContain("companion object {");
    expect(code).toContain(
      "private fun buildPose(x: Double, y: Double, heading: Double): Pose {\n        return Paths.buildPose(x, y, heading)",
    );
    expect(code).toContain(
      "private fun cmToInches(cm: Double): Double = Paths.cmToInches(cm)",
    );
    expect(code).toContain("paths = Paths()");
  });

  it("writes each telemetry option's set-up the Kotlin way", async () => {
    const panels = await kotlin({ telemetry: "Panels" });
    expect(panels).toContain("@Configurable // Panels");
    expect(panels).toContain("panelsTelemetry = PanelsTelemetry.telemetry");
    expect(panels).toContain(
      "private lateinit var panelsTelemetry: TelemetryManager",
    );
    const dashboard = await kotlin({ telemetry: "Dashboard" });
    expect(dashboard).toContain(
      "telemetryA = MultipleTelemetry(telemetry, FtcDashboard.getInstance().telemetry)",
    );
    expect(dashboard).toContain(
      "import org.firstinspires.ftc.robotcore.external.Telemetry\n",
    );
    expect(await kotlin({ telemetry: "None" })).not.toContain("telemetry.");
  });

  it("writes only the Paths class when the full class is off", async () => {
    const code = await kotlin({ full: false });
    expect(code).toContain("class Paths {");
    expect(code).not.toContain("OpMode");
  });

  it("leaves a TODO state where a plugin action can't write Kotlin", async () => {
    actionRegistry.register({
      kind: "javaOnlyState",
      label: "Java Only",
      component: null,
      toJavaCode: () => ({ code: "case 9: weird(); break;", stepsUsed: 1 }),
    });
    try {
      const code = await kotlin({
        seq: [{ kind: "javaOnlyState", id: "j" } as any, sequence[0]!],
      });
      expect(code).toContain(
        "0 -> {\n                // TODO: Java Only has no Kotlin export yet.\n                setPathState(1)",
      );
      expect(code).not.toContain("weird()");
      expect(code).toContain(
        "1 -> {\n                follower.follow(paths.Score)",
      );
    } finally {
      actionRegistry.unregister("javaOnlyState");
    }
  });
});
