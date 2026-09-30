// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Point, Line, SequenceItem, TurtleData } from "../../types";
import {
  generateTrackerEventRegistrationCode,
  getUniqueEventMarkerNames,
} from "./eventMarkerUtils";
import { actionRegistry } from "../../lib/actionRegistry";
import { startingHeading } from "../../utils/timeCalculator/pathCalculator";
import { type CoordinateSystem } from "../../utils/coordinates";
import {
  DEFAULT_PROJECT_EXTENSION,
  getProjectExtensionFromPath,
  stripProjectExtension,
} from "../../utils/fileExtensions";
import { exporterRegistry } from "./index";
import {
  javaLength,
  formatJava,
  flattenMacros,
  AUTO_GENERATED_FILE_WARNING_MESSAGE,
  poseCode,
  angleCode,
  headingMethodCode,
  chainGlobalHeading,
  groupChains,
  uniqueNames,
  identifierFor,
  type FormatOptions,
  type HeadingConfig,
} from "./javaFormat";

export async function generateSequentialCommandCode(
  startPoint: Point,
  lines: Line[],
  fileName: string | null = null,
  sequence?: SequenceItem[],
  targetLibrary: "SolversLib" | "NextFTC" = "SolversLib",
  packageName: string = "org.firstinspires.ftc.teamcode.Commands.AutoCommands",
  hardcodeValues: boolean = false,
  coordinateSystem: CoordinateSystem = "Pedro",
  codeUnits: "imperial" | "metric" = "imperial",
): Promise<string> {
  const baseName = fileName ? fileName.split(/[\\/]/).pop() || "" : "";
  const className =
    stripProjectExtension(baseName).replaceAll(/[^a-zA-Z0-9]/g, "_") ||
    "AutoPath";

  // Every pose becomes a field. With hardcodeValues it's set from the
  // project's numbers; otherwise it's loaded at runtime with pp.get().
  const poseDeclarations: string[] = [];
  const poseInitializations: string[] = [];
  const declareInitializedPose = (name: string, value: string) => {
    poseDeclarations.push(`    private Pose ${name};`);
    poseInitializations.push(`        ${name} = ${value};`);
  };
  const declarePose = (name: string, point: Point, degrees: number) => {
    if (!hardcodeValues) {
      declareInitializedPose(name, `pp.get("${name}")`);
    } else if (coordinateSystem === "FTC") {
      declareInitializedPose(name, poseCode(point, opts, degrees));
    } else {
      const { x, y } = point;
      declareInitializedPose(
        name,
        `p.of(${javaLength(x, codeUnits)}, ${javaLength(y, codeUnits)}, ${degrees})`,
      );
    }
  };

  const opts: FormatOptions = { coordinateSystem, codeUnits };
  const poseName = (idx: number) =>
    idx < 0 ? "startPoint" : identifierFor(lines[idx].name, `point${idx + 1}`);

  // The same start heading playback uses.
  declarePose(
    "startPoint",
    startPoint,
    startingHeading(startPoint, lines, sequence),
  );

  const declared = new Set(["startPoint"]);
  lines.forEach((line, lineIdx) => {
    const name = poseName(lineIdx);
    const end = line.endPoint;
    let endDegrees = 0;
    if (end.heading === "constant") endDegrees = end.degrees ?? 0;
    else if (end.heading === "linear") endDegrees = end.endDeg ?? 0;

    // Lines with the same name share one pose.
    if (!declared.has(name)) {
      declared.add(name);
      declarePose(name, end, endDegrees);
    }

    line.controlPoints.forEach((cp, i) => {
      declareInitializedPose(
        `${name}_line${lineIdx}_control${i + 1}`,
        hardcodeValues
          ? `p.of(${cp.x.toFixed(3)}, ${cp.y.toFixed(3)}, 0.0)`
          : `pp.get("${name}_control${i + 1}")`,
      );
    });
  });

  // Paths are named after their start and end poses, e.g. startPointTOShoot.
  const pathChainVariables = uniqueNames(
    lines.map((_, idx) => `${poseName(idx - 1)}TO${poseName(idx)}`),
  );
  // A chained line is part of the path before it, so it has no variable.
  const pathChainDeclarations = lines
    .map((line, idx) =>
      line.isChain ? "" : `    private Path ${pathChainVariables[idx]};`,
    )
    .filter(Boolean)
    .join("\n");

  // Define library-specific names
  const isNextFTC = targetLibrary === "NextFTC";
  const SequentialGroupClass = isNextFTC
    ? "SequentialGroup"
    : "SequentialCommandGroup";
  const FollowPathCmdClass = isNextFTC ? "FollowPath" : "FollowPathCommand";

  // Generate addCommands calls with event handling; iterate sequence if provided
  const commands: string[] = [];

  const defaultSequence: SequenceItem[] = lines.map((ln, idx) => ({
    kind: "path",
    lineId: ln.id || `line-${idx + 1}`,
  }));

  const seq = flattenMacros(sequence?.length ? sequence : defaultSequence);

  seq.forEach((item) => {
    // Registry Check
    const action = actionRegistry.get(item.kind);
    if (action?.toSequentialCommand) {
      commands.push(action.toSequentialCommand(item, { isNextFTC }));
      return;
    }

    const lineIdx = lines.findIndex((l) => l.id === (item as any).lineId);
    if (lineIdx < 0) {
      return; // skip if sequence references a missing line
    }
    const line = lines[lineIdx];
    if (!line) {
      return;
    }

    // Skip generating an individual FollowPath command if this line is part of a chained group (but not the first)
    if (line.isChain) {
      return;
    }

    // The name of the entire Path is the pathName of the root path
    const pathName = pathChainVariables[lineIdx];

    // Construct FollowPath instantiation
    const followPathInstance = isNextFTC
      ? `new ${FollowPathCmdClass}(${pathName})`
      : `new ${FollowPathCmdClass}(follower, ${pathName})`;

    commands.push(`                ${followPathInstance}`);
  });

  // Interpolator arguments for a path between two pose variables. Unless
  // values are hardcoded, headings that weren't set explicitly are read
  // from the poses loaded at runtime.
  const interpolatorArgsFor =
    (startPose: string, endPose: string) =>
    (h: HeadingConfig): string => {
      switch (h.heading) {
        case "constant":
          return hardcodeValues || h.degrees !== undefined
            ? angleCode(h.degrees || 0, opts)
            : `${endPose}.heading()`;
        case "linear":
          return hardcodeValues ||
            (h.startDeg !== undefined && h.endDeg !== undefined)
            ? `${angleCode(h.startDeg || 0, opts)}, ${angleCode(h.endDeg || 0, opts)}`
            : `${startPose}.heading(), ${endPose}.heading()`;
        case "facingPoint":
          return poseCode({ x: h.targetX || 0, y: h.targetY || 0 }, opts);
        default:
          return "";
      }
    };

  const pathData = lines.map((line, idx) => {
    const startPose = poseName(idx - 1);
    const endPose = poseName(idx);
    const args = interpolatorArgsFor(startPose, endPose);

    const controlPoints = line.controlPoints.map(
      (cp) => `p.of(${cp.x.toFixed(3)}, ${cp.y.toFixed(3)}, 0.0)`,
    );
    const call = controlPoints.length
      ? `curve(${startPose}, ${controlPoints.join(", ")}, ${endPose})`
      : `line(${startPose}, ${endPose})`;

    const global = chainGlobalHeading(lines, idx);
    return {
      name: pathChainVariables[idx],
      call,
      heading: global ? "" : headingMethodCode(line.endPoint, args),
      chainHeading:
        global && !line.isChain
          ? `\n            ${headingMethodCode(global, args)}`
          : "",
    };
  });

  const pathBuilders = groupChains(lines, pathData)
    .map((members) => {
      const root = members[0];
      if (members.length === 1) {
        const heading = root.heading ? `\n            ${root.heading}` : "";
        return `        ${root.name} = ${root.call}${heading};`;
      }
      const calls = members.map((m) => {
        const heading = m.heading ? `\n                ${m.heading}` : "";
        return `            ${m.call}${heading}`;
      });
      return `        ${root.name} = path(\n${calls.join(",\n")}\n        )${root.chainHeading};`;
    })
    .join("\n\n");

  // Generate imports based on library
  let imports = "";
  if (isNextFTC) {
    imports = `
import dev.nextftc.core.commands.Command;
import dev.nextftc.core.commands.groups.SequentialGroup;
import dev.nextftc.core.commands.groups.ParallelRaceGroup;
import dev.nextftc.core.commands.delays.Delay;
import dev.nextftc.core.commands.delays.WaitUntil;
import dev.nextftc.core.commands.utility.InstantCommand;
import org.firstinspires.ftc.teamcode.pedroPathing.FollowPath;
`;
  } else {
    imports = `
import com.seattlesolvers.solverslib.command.SequentialCommandGroup;
import com.seattlesolvers.solverslib.command.ParallelRaceGroup;
import com.seattlesolvers.solverslib.command.WaitCommand;
import com.seattlesolvers.solverslib.command.WaitUntilCommand;
import com.seattlesolvers.solverslib.command.InstantCommand;
import com.seattlesolvers.solverslib.pedroCommand.FollowPathCommand;
`;
  }

  const ppReaderImport = hardcodeValues
    ? ""
    : "import com.turtletracerlib.TurtleTracerReader;";
  const ppReaderInit = hardcodeValues
    ? ""
    : (() => {
        const rawName = fileName ? fileName.split(/[\\/]/).pop() || "" : "";
        const baseName =
          stripProjectExtension(rawName || "AutoPath") || "AutoPath";
        const ext =
          getProjectExtensionFromPath(rawName) || DEFAULT_PROJECT_EXTENSION;
        return `TurtleTracerReader pp = new TurtleTracerReader("${baseName}${ext}", hw.appContext);`;
      })();

  const hasEventMarkers = lines.some(
    (line) => line.eventMarkers && line.eventMarkers.length > 0,
  );
  const markerNames = getUniqueEventMarkerNames(lines);

  const getEventBindingCode = (isNextFTC: boolean) => {
    if (!hasEventMarkers) return "";
    const telemetryArg = isNextFTC ? "null" : "telemetry";
    if (!hardcodeValues && markerNames.length > 0) {
      return `\n        pp${markerNames.map((name) => `.onEvent("${name}", NamedCommands.getCommand("${name}"))`).join("\n          ")};

        ProgressTracker tracker = new ProgressTracker(follower, ${telemetryArg});
        pp.registerEvents(tracker);`;
    } else if (hardcodeValues) {
      return `\n        ProgressTracker tracker = new ProgressTracker(follower, ${telemetryArg});${generateTrackerEventRegistrationCode(lines, "        ", coordinateSystem, codeUnits)}`;
    }
    return "";
  };

  let sequentialCommandCode = "";

  if (isNextFTC) {
    sequentialCommandCode = `
${AUTO_GENERATED_FILE_WARNING_MESSAGE}

package ${packageName};

import com.pedropathing.api.PoseFactory;
import com.pedropathing.follower.Follower;
import com.pedropathing.paths.Path;
import static com.pedropathing.api.Paths.curve;
import static com.pedropathing.api.Paths.line;
import static com.pedropathing.api.Paths.path;
import com.pedropathing.math.Pose;
import com.pedropathing.paths.interpolator.Interpolator;
import com.qualcomm.robotcore.hardware.HardwareMap;
${imports}
${hasEventMarkers ? "import com.turtletracerlib.pathing.ProgressTracker;\nimport com.turtletracerlib.pathing.NamedCommands;\n" : ""}${ppReaderImport}
import java.io.IOException;
import ${packageName.split(".").slice(0, 4).join(".")}.Subsystems.Drivetrain;

public class ${className} extends Command {

    private final Follower follower;
    private final PoseFactory p = PoseFactory.degrees();
    private Command group;

    // Poses
${poseDeclarations.join("\n")}

    // Path chains
${pathChainDeclarations}

    public ${className}(final Drivetrain drive, HardwareMap hw) throws IOException {
        this.follower = drive.getFollower();

        ${ppReaderInit}${getEventBindingCode(true)}

        // Load poses
${poseInitializations.join("\n")}

        follower.setPose(startPoint);
    }

    public void buildPaths() {
        ${pathBuilders}
    }

    @Override
    public void start() {
        buildPaths();
        group = new SequentialGroup(
${commands.join(",\n")}
        );
        group.start();
    }

    @Override
    public void update() {
        if (group != null) group.update();
    }

    @Override
    public void stop(boolean interrupted) {
        if (group != null) group.stop(interrupted);
    }

    @Override
    public boolean isDone() {
        return group != null && group.isDone();
    }

    ${
      coordinateSystem === "FTC"
        ? `
    private Pose buildPose(double x, double y, double heading) {
        return p.of(y + 72.0, 72.0 - x, heading);
    }
    `
        : ""
    }
    ${
      codeUnits === "metric"
        ? `
    private double cmToInches(double cm) {
        return cm / 2.54;
    }
`
        : ""
    }
}
`;
  } else {
    sequentialCommandCode = `
${AUTO_GENERATED_FILE_WARNING_MESSAGE}

package ${packageName};

import com.pedropathing.api.PoseFactory;
import com.pedropathing.follower.Follower;
import com.pedropathing.paths.Path;
import static com.pedropathing.api.Paths.curve;
import static com.pedropathing.api.Paths.line;
import static com.pedropathing.api.Paths.path;
import com.pedropathing.math.Pose;
import com.pedropathing.paths.interpolator.Interpolator;
import com.qualcomm.robotcore.hardware.HardwareMap;
${imports}
import org.firstinspires.ftc.robotcore.external.Telemetry;
${ppReaderImport}
${hasEventMarkers ? "import com.turtletracerlib.pathing.ProgressTracker;\n" : ""}import com.turtletracerlib.pathing.NamedCommands;
import java.io.IOException;
import ${packageName.split(".").slice(0, 4).join(".")}.Subsystems.Drivetrain;

public class ${className} extends ${SequentialGroupClass} {

    private final Follower follower;
    private final PoseFactory p = PoseFactory.degrees();

    // Poses
${poseDeclarations.join("\n")}

    // Path chains
${pathChainDeclarations}

    public ${className}(final Drivetrain drive, HardwareMap hw, Telemetry telemetry) throws IOException {
        this.follower = drive.getFollower();

        ${ppReaderInit}${getEventBindingCode(false)}

        // Load poses
${poseInitializations.join("\n")}

        follower.setPose(startPoint);

        buildPaths();

        addCommands(
${commands.join(",\n")}
        );
    }

    public void buildPaths() {
        ${pathBuilders}
    }

    ${
      coordinateSystem === "FTC"
        ? `
    private Pose buildPose(double x, double y, double heading) {
        return p.of(y + 72.0, 72.0 - x, heading);
    }
    `
        : ""
    }
    ${
      codeUnits === "metric"
        ? `
    private double cmToInches(double cm) {
        return cm / 2.54;
    }
`
        : ""
    }
}
`;
  }

  return formatJava(sequentialCommandCode);
}

exporterRegistry.register({
  id: "sequential",
  name: "Export Sequential Code",
  description: "Export the path as a Sequential Command group.",
  exportCode: async (data: TurtleData, settings: any) => {
    return await generateSequentialCommandCode(
      data.startPoint,
      data.lines,
      settings.fileName,
      data.sequence,
      settings.targetLibrary ?? "SolversLib",
      settings.packageName ??
        "org.firstinspires.ftc.teamcode.Commands.AutoCommands",
      settings.hardcodeValues ?? false,
      settings.coordinateSystem ?? "Pedro",
      settings.codeUnits ?? "imperial",
    );
  },
});
