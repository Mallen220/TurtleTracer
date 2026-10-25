// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type {
  CodeLanguage,
  Point,
  Line,
  SequenceItem,
  TurtleData,
} from "../../types";
import { actionRegistry } from "../../lib/actionRegistry";
import { startingHeading } from "../../utils/timeCalculator/pathCalculator";
import { chainMarkerRegistrationCode } from "./eventMarkerUtils";
import { type CoordinateSystem } from "../../utils/coordinates";

import { exporterRegistry } from "./index";
import { formatKotlin } from "./kotlinFormat";
import { kotlinImports } from "./commandLibraries/kotlinClassSections";
import {
  formatJava,
  kotlinIdentifier,
  stateCase,
  flattenMacros,
  poseCode,
  angleCode,
  headingMethodCode,
  chainGlobalHeading,
  groupChains,
  uniqueNames,
  identifierFor,
  javaClassName,
  projectBaseName,
  AUTO_GENERATED_FILE_WARNING_MESSAGE,
  type FormatOptions,
  type HeadingConfig,
  speedCodes,
  speedLimitNote,
  constantsImport,
} from "./javaFormat";
import { pedroConstants } from "./pedroConstants";

/** A variable name for each line, based on its name and made unique. */
function uniqueVariableNames(lines: Line[], language?: CodeLanguage): string[] {
  return uniqueNames(
    lines.map((line, idx) => identifierFor(line.name, `line${idx + 1}`)),
  ).map((name) => (language === "kotlin" ? kotlinIdentifier(name) : name));
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
  const speeds = speedCodes(lines);
  const segments = lines.map((line, idx) => {
    const start = poseCode(
      idx === 0 ? startPoint : lines[idx - 1].endPoint,
      opts,
    );
    const end = poseCode(line.endPoint, opts);
    const call =
      line.controlPoints.length === 0
        ? `line(\n          ${start},\n          ${end}\n        )`
        : `curve(\n          ${start},\n          ${line.controlPoints.map((cp) => poseCode(cp, opts)).join(",\n")},\n          ${end}\n        )`;

    const global = chainGlobalHeading(lines, idx);
    return {
      line,
      name: names[idx],
      call,
      heading: global
        ? ""
        : headingMethodCode(line.endPoint, literalArgs(opts), opts.language),
      chainHeading:
        global && !line.isChain
          ? `\n        ${headingMethodCode(global, literalArgs(opts), opts.language)}`
          : "",
      speed: speeds.own[idx],
      chainSpeed: speeds.chain[idx],
    };
  });

  const blocks = groupChains(lines, segments).map((members) => {
    const root = members[0];
    if (members.length === 1) {
      // A path on its own takes its own speed, else the one set for its chain.
      const speed = root.speed || root.chainSpeed;
      return `${root.name} = ${root.call}${root.heading}${speed ? `\n        ${speed}` : ""};`;
    }
    const calls = members.map(
      (m) =>
        `        ${m.call}${m.heading}${m.speed ? `\n          ${m.speed}` : ""}`,
    );
    const chainSpeed = root.chainSpeed ? `\n        ${root.chainSpeed}` : "";
    return `${root.name} = path(\n${calls.join(",\n")}\n      )${root.chainHeading}${chainSpeed};`;
  });
  const code = blocks.join("\n\n      ");
  return speeds.any ? `${speedLimitNote(opts.language)}\n      ${code}` : code;
}

/**
 * The OpMode's autonomousPathUpdate() switch cases (`when` branches in
 * Kotlin). Each path takes two states: start following it, then wait until
 * the follower is done.
 */
function stateMachineCode(
  sequence: SequenceItem[],
  lines: Line[],
  names: string[],
  trackEvents: boolean,
  opts: FormatOptions,
): string {
  const { language } = opts;
  const kotlin = language === "kotlin";
  let code = "";
  let state = 0;
  const lineIndexById = (id: string) =>
    lines.findIndex((l, i) => (l.id || `line-${i + 1}`) === id);

  for (const item of sequence) {
    const action = actionRegistry.get(item.kind);
    if (action?.toJavaCode && kotlin && !action.supportsKotlin) {
      // Its Java wouldn't compile here, so the state is only passed through.
      code += stateCase(
        state,
        `// TODO: ${action.label} has no Kotlin export yet.
          setPathState(${state + 1});`,
        language,
      );
      state += 1;
      continue;
    }
    if (action?.toJavaCode) {
      const res = action.toJavaCode(item, { stateStep: state, language });
      code += res.code;
      state += res.stepsUsed;
      continue;
    }

    if (item.kind !== "path") {
      // Kotlin's branches don't fall through to the next state's.
      if (!kotlin) code += `\n        case ${state}:`;
      continue;
    }

    const idx = lineIndexById(item.lineId);
    if (idx === -1 || lines[idx].isChain) {
      // Chained lines are followed as part of the path before them.
      const note =
        idx === -1 ? "" : "// Handled by previous chained path\n          ";
      code += stateCase(state, `${note}setPathState(${state + 1});`, language);
      state += 1;
      continue;
    }

    const path = `paths.${names[idx]}`;
    let start = `follower.follow(${path});`;
    if (trackEvents) {
      // The tracker watches one path at a time, so it gets this path's
      // markers (and none of the others') when the path starts.
      const registrations = chainMarkerRegistrationCode(lines, idx, {
        indent: "          ",
        ...opts,
      });
      start += `\n          tracker.clearPathEvents();${registrations}`;
      start += `\n          tracker.setCurrentPath(${path});`;
    }
    code += stateCase(
      state,
      `${start}\n          setPathState(${state + 1});`,
      language,
    );
    code += stateCase(
      state + 1,
      `if(!follower.isBusy()) {\n            setPathState(${state + 2});\n          }`,
      language,
    );
    state += 2;
  }

  code += stateCase(
    state,
    "requestOpModeStop();\n          pathState = -1;",
    language,
  );
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

/**
 * The same in Kotlin. Only the fields and the set-up differ: Panels is a
 * Kotlin object, and Java's getters are properties. The logging is the same.
 */
const KOTLIN_TELEMETRY_CODE: Record<
  TelemetryImpl,
  { imports: string; field: string; init: string; loop: string }
> = {
  Panels: {
    ...TELEMETRY_CODE.Panels,
    field:
      "private lateinit var panelsTelemetry: TelemetryManager // Panels Telemetry instance",
    init: `
        panelsTelemetry = PanelsTelemetry.telemetry
        // ...
        panelsTelemetry.debug("Status", "Initialized")
        panelsTelemetry.update(telemetry)`,
  },
  Dashboard: {
    ...TELEMETRY_CODE.Dashboard,
    field: "private lateinit var telemetryA: Telemetry",
    init: `
        telemetryA = MultipleTelemetry(telemetry, FtcDashboard.getInstance().telemetry)
        telemetryA.addData("Status", "Initialized")
        telemetryA.update()`,
  },
  Standard: TELEMETRY_CODE.Standard,
  None: TELEMETRY_CODE.None,
};

/** The imports every OpMode needs, after its package line. */
const opModeImports = () => {
  const constants = constantsImport();
  return `
    import com.qualcomm.robotcore.eventloop.opmode.OpMode;
    import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
    import com.qualcomm.robotcore.util.ElapsedTime;${constants ? `\n    ${constants};` : ""}`;
};

/** How the OpMode builds its follower, with the team's constants class. */
const createFollower = () => {
  const { className, followerFactory } = pedroConstants();
  return `${className}.${followerFactory}(hardwareMap)`;
};

const PEDRO_OPMODE_IMPORTS = `
    import com.pedropathing.api.PoseFactory;
    import com.pedropathing.follower.Follower;
    import com.pedropathing.paths.Path;
    import static com.pedropathing.api.Paths.curve;
    import static com.pedropathing.api.Paths.line;
    import static com.pedropathing.api.Paths.path;
    import com.pedropathing.math.Pose;
    import com.pedropathing.paths.interpolator.Interpolator;`;

/** Everything a language's OpMode template needs, already generated. */
interface OpModeParts {
  packageName: string;
  className: string;
  opModeName: string;
  /** Line variable names, with "" for chained lines, which have none. */
  pathFields: string[];
  pathConstruction: string;
  stateCases: string;
  startPose: string;
  hasEventMarkers: boolean;
  telemetryImpl: TelemetryImpl;
  ftc: boolean;
  metric: boolean;
}

/** The OpMode in Kotlin: the Java one's shape, with a companion object for its statics. */
function kotlinOpMode(o: OpModeParts, exportFullCode: boolean): string {
  const pathsClass = `
  class Paths {
    ${o.pathFields
      .filter(Boolean)
      .map((name) => `val ${name}: Path`)
      .join("\n")}

    init {
      ${o.pathConstruction}
    }

    companion object {
      private val p = PoseFactory.degrees()
      ${
        o.ftc
          ? `
      fun buildPose(x: Double, y: Double, heading: Double): Pose {
          return p.of(y + 72.0, 72.0 - x, heading)
      }
      `
          : ""
      }
      ${o.metric ? "fun cmToInches(cm: Double): Double = cm / 2.54" : ""}
    }
  }
  `;
  if (!exportFullCode) return AUTO_GENERATED_FILE_WARNING_MESSAGE + pathsClass;

  const telemetry = KOTLIN_TELEMETRY_CODE[o.telemetryImpl];
  const markerImports = o.hasEventMarkers
    ? "import com.turtletracerlib.pathing.NamedCommands;\nimport com.turtletracerlib.pathing.ProgressTracker;\n"
    : "";
  return `
    ${AUTO_GENERATED_FILE_WARNING_MESSAGE}

    package ${o.packageName}
    ${kotlinImports(`${opModeImports()}\n${markerImports}${telemetry.imports}${PEDRO_OPMODE_IMPORTS}`)}

    @Autonomous(name = "${o.opModeName}", group = "Autonomous")
    ${o.telemetryImpl === "Panels" ? "@Configurable // Panels" : ""}
    class ${o.className} : OpMode() {
      ${telemetry.field}
      lateinit var follower: Follower // Pathing follower instance
      private val p = PoseFactory.degrees()
      ${o.hasEventMarkers ? "private lateinit var tracker: ProgressTracker // Progress tracker instance for event markers\n      " : ""}private var pathState = 0 // Current autonomous path state (state machine)
      private lateinit var pathTimer: ElapsedTime // Timer for path state machine
      private lateinit var paths: Paths // Paths defined in the Paths class

      override fun init() {
        ${telemetry.init}

        follower = ${createFollower()}
        follower.setPose(${o.startPose})

        pathTimer = ElapsedTime()
        paths = Paths() // Build paths
        ${o.hasEventMarkers ? "\n        tracker = ProgressTracker(follower, telemetry)" : ""}
      }

      override fun loop() {
        follower.update() // Update follower
        ${o.hasEventMarkers ? "tracker.update() // Update tracker\n        " : ""}pathState = autonomousPathUpdate() // Update autonomous state machine

        ${telemetry.loop}
      }

      ${pathsClass}

      ${
        o.ftc
          ? `
      private fun buildPose(x: Double, y: Double, heading: Double): Pose {
          return Paths.buildPose(x, y, heading)
      }
      `
          : ""
      }
      ${o.metric ? "private fun cmToInches(cm: Double): Double = Paths.cmToInches(cm)" : ""}

      fun autonomousPathUpdate(): Int {
        when (pathState) {
          ${o.stateCases}
        }
        return pathState
      }

      fun setPathState(pState: Int) {
        pathState = pState
        pathTimer.reset()
      }
    }
    `;
}

/** Generates the Pedro Pathing OpMode class for the project, in Java or Kotlin. */
export async function generateJavaCode(
  startPoint: Point,
  lines: Line[],
  exportFullCode: boolean,
  sequence?: SequenceItem[],
  packageName: string = "org.firstinspires.ftc.teamcode.Commands.AutoCommands",
  telemetryImpl: TelemetryImpl = "Panels",
  coordinateSystem: CoordinateSystem = "Pedro",
  codeUnits: "imperial" | "metric" = "imperial",
  /** The project file; the class and OpMode are named after it. */
  fileName: string | null = null,
  language: CodeLanguage = "java",
): Promise<string> {
  const pathChainNames = uniqueVariableNames(lines, language);
  const className = javaClassName(fileName, "TurtleTracerAutonomous", language);
  const opModeName = (
    projectBaseName(fileName) || "Turtle Tracer Autonomous"
  ).replaceAll(/["\\]/g, "");
  const opts: FormatOptions = { coordinateSystem, codeUnits, language };

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
    opts,
  );
  const startPose = poseCode(
    startPoint,
    opts,
    startingHeading(startPoint, lines, sequence),
  );

  if (language === "kotlin") {
    return formatKotlin(
      kotlinOpMode(
        {
          packageName,
          className,
          opModeName,
          pathFields: pathChainNames.map((name, idx) =>
            lines[idx].isChain ? "" : name,
          ),
          pathConstruction: pathConstructionCode(
            startPoint,
            lines,
            pathChainNames,
            opts,
          ),
          stateCases,
          startPose,
          hasEventMarkers,
          telemetryImpl,
          ftc: coordinateSystem === "FTC",
          metric: codeUnits === "metric",
        },
        exportFullCode,
      ),
    );
  }

  let file = "";
  if (exportFullCode) {
    const telemetry = TELEMETRY_CODE[telemetryImpl];
    const namedCommandsImport = hasEventMarkers
      ? "import com.turtletracerlib.pathing.NamedCommands;\nimport com.turtletracerlib.pathing.ProgressTracker;\n"
      : "";
    const classAnnotations =
      telemetryImpl === "Panels" ? "@Configurable // Panels" : "";

    file = `
    ${AUTO_GENERATED_FILE_WARNING_MESSAGE}

    package ${packageName};${opModeImports()}
    ${namedCommandsImport}${telemetry.imports}${PEDRO_OPMODE_IMPORTS}
    
    @Autonomous(name = "${opModeName}", group = "Autonomous")
    ${classAnnotations}
    public class ${className} extends OpMode {
      ${telemetry.field}
      public Follower follower; // Pathing follower instance
      private final PoseFactory p = PoseFactory.degrees();
      ${hasEventMarkers ? "private ProgressTracker tracker; // Progress tracker instance for event markers\n      " : ""}private int pathState; // Current autonomous path state (state machine)
      private ElapsedTime pathTimer; // Timer for path state machine
      private Paths paths; // Paths defined in the Paths class
      
      @Override
      public void init() {
        ${telemetry.init}

        follower = ${createFollower()};
        follower.setPose(${startPose});

        pathTimer = new ElapsedTime();
        paths = new Paths(follower); // Build paths
        ${
          hasEventMarkers
            ? `\n        tracker = new ProgressTracker(follower, telemetry);`
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

  return formatJava(file);
}

exporterRegistry.register({
  id: "java",
  name: "Export OpMode Code",
  description:
    "Export the path as a standard Pedro Pathing OpMode, in Java or Kotlin.",
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
      settings.fileName ?? null,
      settings.codeLanguage ?? "java",
    );
  },
});
