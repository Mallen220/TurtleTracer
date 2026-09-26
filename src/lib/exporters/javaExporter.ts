// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import prettier from "prettier";
import prettierJavaPlugin from "prettier-plugin-java";
import type { Point, Line, SequenceItem, TurtleData } from "../../types";
import { actionRegistry } from "../../lib/actionRegistry";
import { startingHeading } from "../../utils/timeCalculator/pathCalculator";
import { generateTrackerEventRegistrationCode } from "./eventMarkerUtils";
import { type CoordinateSystem } from "../../utils/coordinates";

import { exporterRegistry } from "./index";
import {
  flattenMacros,
  poseCode,
  angleCode,
  headingMethodCode,
  chainGlobalHeading,
  groupChains,
  uniqueNames,
  identifierFor,
  AUTO_GENERATED_FILE_WARNING_MESSAGE,
  type FormatOptions,
  type HeadingConfig,
} from "./javaFormat";

/** A Java identifier for each line, based on its name and made unique. */
function uniqueVariableNames(lines: Line[]): string[] {
  return uniqueNames(
    lines.map((line, idx) => identifierFor(line.name, `line${idx + 1}`)),
  );
}

/** Interpolator arguments with every angle and target written out. */
function literalArgs(opts: FormatOptions) {
  return (h: HeadingConfig): string => {
    switch (h.heading) {
      case "constant":
        return angleCode(h.degrees || 0, opts);
      case "linear":
        return `${angleCode(h.startDeg || 0, opts)}, ${angleCode(h.endDeg || 0, opts)}`;
      case "facingPoint":
        return poseCode({ x: h.targetX || 0, y: h.targetY || 0 }, opts);
      default:
        return "";
    }
  };
}

/**
 * The statements in the Paths constructor that build each path. Chained
 * lines are combined into a single path(...) call.
 */
function pathConstructionCode(
  startPoint: Point,
  lines: Line[],
  names: string[],
  opts: FormatOptions,
): string {
  const segments = lines.map((line, idx) => {
    const start = poseCode(
      idx === 0 ? startPoint : lines[idx - 1].endPoint,
      opts,
    );
    const end = poseCode(line.endPoint, opts);
    const call =
      line.controlPoints.length === 0
        ? `line(\n          ${start},\n          ${end}\n        )`
        : `curve(\n          ${start},\n          ${line.controlPoints.map((cp) => poseCode(cp, opts)).join(",\n")},${end}\n        )`;

    const global = chainGlobalHeading(lines, idx);
    return {
      line,
      name: names[idx],
      call,
      heading: global
        ? ""
        : headingMethodCode(line.endPoint, literalArgs(opts)),
      chainHeading:
        global && !line.isChain
          ? `\n        ${headingMethodCode(global, literalArgs(opts))}`
          : "",
    };
  });

  const blocks = groupChains(lines, segments).map((members) => {
    const root = members[0];
    if (members.length === 1)
      return `${root.name} = ${root.call}${root.heading};`;
    const calls = members.map((m) => `        ${m.call}${m.heading}`);
    return `${root.name} = path(\n${calls.join(",\n")}\n      )${root.chainHeading};`;
  });
  return blocks.join("\n\n      ");
}

/**
 * The OpMode's autonomousPathUpdate() switch cases. Each path takes two
 * states: start following it, then wait until the follower is done.
 */
function stateMachineCode(
  sequence: SequenceItem[],
  lines: Line[],
  names: string[],
  trackEvents: boolean,
): string {
  let code = "";
  let state = 0;
  const lineIndexById = (id: string) =>
    lines.findIndex((l, i) => (l.id || `line-${i + 1}`) === id);

  for (const item of sequence) {
    const action = actionRegistry.get(item.kind);
    if (action?.toJavaCode) {
      const res = action.toJavaCode(item, { stateStep: state });
      code += res.code;
      state += res.stepsUsed;
      continue;
    }

    code += `\n        case ${state}:`;
    if (item.kind !== "path") continue;

    const idx = lineIndexById(item.lineId);
    if (idx === -1 || lines[idx].isChain) {
      // Chained lines are followed as part of the path before them.
      if (idx !== -1) code += `\n          // Handled by previous chained path`;
      code += `\n          setPathState(${state + 1});\n          break;`;
      state += 1;
      continue;
    }

    const path = `paths.${names[idx]}`;
    code += `\n          follower.follow(${path});`;
    if (trackEvents) code += `\n          tracker.setCurrentPath(${path});`;
    code += `\n          setPathState(${state + 1});\n          break;`;
    code += `\n        case ${state + 1}:`;
    code += `\n          if(!follower.isBusy()) {\n            setPathState(${state + 2});\n          }\n          break;`;
    state += 2;
  }

  code += `\n        case ${state}:`;
  code += `\n          requestOpModeStop();\n          pathState = -1;\n          break;`;
  return code;
}

type TelemetryImpl = "Standard" | "Dashboard" | "Panels" | "None";

/** Code for each telemetry option: imports, field, init() and loop() lines. */
const TELEMETRY_CODE: Record<
  TelemetryImpl,
  { imports: string; field: string; init: string; loop: string }
> = {
  Panels: {
    imports: `
    import com.bylazar.configurables.annotations.Configurable;
    import com.bylazar.telemetry.TelemetryManager;
    import com.bylazar.telemetry.PanelsTelemetry;`,
    field:
      "private TelemetryManager panelsTelemetry; // Panels Telemetry instance",
    init: `
        panelsTelemetry = PanelsTelemetry.INSTANCE.getTelemetry();
        // ...
        panelsTelemetry.debug("Status", "Initialized");
        panelsTelemetry.update(telemetry);`,
    loop: `
        // Log values to Panels and Driver Station
        panelsTelemetry.debug("Path State", pathState);
        panelsTelemetry.debug("X", follower.pose().x());
        panelsTelemetry.debug("Y", follower.pose().y());
        panelsTelemetry.debug("Heading", follower.pose().heading());
        panelsTelemetry.update(telemetry);`,
  },
  Dashboard: {
    imports: `
    import com.acmerobotics.dashboard.FtcDashboard;
    import com.acmerobotics.dashboard.telemetry.MultipleTelemetry;
    import org.firstinspires.ftc.robotcore.external.Telemetry;`,
    field: "private Telemetry telemetryA;",
    init: `
        telemetryA = new MultipleTelemetry(this.telemetry, FtcDashboard.getInstance().getTelemetry());
        telemetryA.addData("Status", "Initialized");
        telemetryA.update();`,
    loop: `
        // Log values to Dashboard and Driver Station
        telemetryA.addData("Path State", pathState);
        telemetryA.addData("X", follower.pose().x());
        telemetryA.addData("Y", follower.pose().y());
        telemetryA.addData("Heading", follower.pose().heading());
        telemetryA.update();`,
  },
  Standard: {
    imports: "",
    field: "",
    init: `
        telemetry.addData("Status", "Initialized");
        telemetry.update();`,
    loop: `
        // Log values to Driver Station
        telemetry.addData("Path State", pathState);
        telemetry.addData("X", follower.pose().x());
        telemetry.addData("Y", follower.pose().y());
        telemetry.addData("Heading", follower.pose().heading());
        telemetry.update();`,
  },
  None: { imports: "", field: "", init: "", loop: "" },
};

/** Generates the Pedro Pathing Java class for the project. */
export async function generateJavaCode(
  startPoint: Point,
  lines: Line[],
  exportFullCode: boolean,
  sequence?: SequenceItem[],
  packageName: string = "org.firstinspires.ftc.teamcode.Commands.AutoCommands",
  telemetryImpl: TelemetryImpl = "Panels",
  coordinateSystem: CoordinateSystem = "Pedro",
  codeUnits: "imperial" | "metric" = "imperial",
): Promise<string> {
  const pathChainNames = uniqueVariableNames(lines);
  const opts: FormatOptions = { coordinateSystem, codeUnits };

  let pathsClass = `
  public static class Paths {
    private static final PoseFactory p = PoseFactory.degrees();
    ${pathChainNames
      .map((variableName, idx) => {
        if (lines[idx].isChain) return "";
        return `public Path ${variableName};`;
      })
      .filter(Boolean)
      .join("\n")}

    public Paths(Follower follower) {
      ${pathConstructionCode(startPoint, lines, pathChainNames, opts)}
    }

    ${
      coordinateSystem === "FTC"
        ? `
    public static Pose buildPose(double x, double y, double heading) {
        return p.of(y + 72.0, 72.0 - x, heading);
    }
    `
        : ""
    }
    ${
      codeUnits === "metric"
        ? `
    public static double cmToInches(double cm) {
        return cm / 2.54;
    }
`
        : ""
    }
  }
  `;

  const hasEventMarkers = lines.some((line) => line.eventMarkers?.length);
  const sequenceToExport = flattenMacros(
    sequence?.length
      ? sequence
      : lines.map(
          (line, i): SequenceItem => ({
            kind: "path",
            lineId: line.id || `line-${i + 1}`,
          }),
        ),
  );
  const stateCases = stateMachineCode(
    sequenceToExport,
    lines,
    pathChainNames,
    hasEventMarkers,
  );

  let file = "";
  if (exportFullCode) {
    const telemetry = TELEMETRY_CODE[telemetryImpl];
    const namedCommandsImport = hasEventMarkers
      ? "import com.turtletracerlib.pathing.NamedCommands;\nimport com.turtletracerlib.pathing.ProgressTracker;\n"
      : "";
    const classAnnotations =
      telemetryImpl === "Panels" ? "@Configurable // Panels" : "";
    const startPose = poseCode(
      startPoint,
      opts,
      startingHeading(startPoint, lines, sequence),
    );

    file = `
    ${AUTO_GENERATED_FILE_WARNING_MESSAGE}

    package ${packageName};
    import com.qualcomm.robotcore.eventloop.opmode.OpMode;
    import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
    import com.qualcomm.robotcore.util.ElapsedTime;
    import org.firstinspires.ftc.teamcode.pedroPathing.PedroConstants;
    ${namedCommandsImport}${telemetry.imports}
    import com.pedropathing.api.PoseFactory;
    import com.pedropathing.follower.Follower;
    import com.pedropathing.paths.Path;
    import static com.pedropathing.api.Paths.curve;
    import static com.pedropathing.api.Paths.line;
    import static com.pedropathing.api.Paths.path;
    import com.pedropathing.math.Pose;
    import com.pedropathing.paths.interpolator.Interpolator;
    
    @Autonomous(name = "Turtle Tracer Autonomous", group = "Autonomous")
    ${classAnnotations}
    public class TurtleTracerAutonomous extends OpMode {
      ${telemetry.field}
      public Follower follower; // Pathing follower instance
      private final PoseFactory p = PoseFactory.degrees();
      ${hasEventMarkers ? "private ProgressTracker tracker; // Progress tracker instance for event markers\n      " : ""}private int pathState; // Current autonomous path state (state machine)
      private ElapsedTime pathTimer; // Timer for path state machine
      private Paths paths; // Paths defined in the Paths class
      
      @Override
      public void init() {
        ${telemetry.init}

        follower = PedroConstants.createFollower(hardwareMap);
        follower.setPose(${startPose});

        pathTimer = new ElapsedTime();
        paths = new Paths(follower); // Build paths
        ${
          hasEventMarkers
            ? `\n        tracker = new ProgressTracker(follower, telemetry);${generateTrackerEventRegistrationCode(lines, "        ", coordinateSystem, codeUnits)}`
            : ""
        }
      }
      
      @Override
      public void loop() {
        follower.update(); // Update follower
        ${hasEventMarkers ? "tracker.update(); // Update tracker\n        " : ""}pathState = autonomousPathUpdate(); // Update autonomous state machine

        ${telemetry.loop}
      }

      ${pathsClass}

      ${
        coordinateSystem === "FTC"
          ? `
      private Pose buildPose(double x, double y, double heading) {
          return Paths.buildPose(x, y, heading);
      }
      `
          : ""
      }
      ${
        codeUnits === "metric"
          ? `
      private double cmToInches(double cm) {
          return Paths.cmToInches(cm);
      }
  `
          : ""
      }

      public int autonomousPathUpdate() {
        switch (pathState) {
          ${stateCases}
        }
        return pathState;
      }

      public void setPathState(int pState) {
        pathState = pState;
        pathTimer.reset();
      }
    }
    `;
  } else {
    file = AUTO_GENERATED_FILE_WARNING_MESSAGE + pathsClass;
  }

  try {
    const formattedCode = await prettier.format(file, {
      parser: "java",
      plugins: [prettierJavaPlugin],
    });
    return formattedCode;
  } catch (error) {
    console.error("Code formatting error:", error);
    return file;
  }
}

exporterRegistry.register({
  id: "java",
  name: "Export Java Code",
  description: "Export the path as a standard Pedro Pathing Java OpMode.",
  exportCode: async (data: TurtleData, settings: any) => {
    return await generateJavaCode(
      data.startPoint,
      data.lines,
      settings.exportFullCode ?? true,
      data.sequence,
      settings.packageName ??
        "org.firstinspires.ftc.teamcode.Commands.AutoCommands",
      settings.telemetryImpl ?? "Panels",
      settings.coordinateSystem ?? "Pedro",
      settings.codeUnits ?? "imperial",
    );
  },
});
