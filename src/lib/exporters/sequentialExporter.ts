// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import prettier from "prettier";
import prettierJavaPlugin from "prettier-plugin-java";
import type { Point, Line, BasePoint, SequenceItem, TurtleData } from "../../types";
import { getLineStartHeading } from "../../utils/math";
import pkg from "../../../package.json";
import { actionRegistry } from "../../lib/actionRegistry";
import { toUser, toUserHeading, type CoordinateSystem } from "../../utils/coordinates";
import {
  DEFAULT_PROJECT_EXTENSION,
  getProjectExtensionFromPath,
  stripProjectExtension,
} from "../../utils/fileExtensions";
import { exporterRegistry } from "./index";

const AUTO_GENERATED_FILE_WARNING_MESSAGE: string = `
/* ============================================================= *
 *                 Turtle Tracer — Auto-Generated                *
 *                                                               *
 *  Version: ${pkg.version}.                                              *
 *  Copyright (c) ${new Date().getFullYear()} Matthew Allen                             *
 *                                                               *
 *  THIS FILE IS AUTO-GENERATED — DO NOT EDIT MANUALLY.          *
 *  Changes will be overwritten when regenerated.                *
 * ============================================================= */
`;

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
  // Determine class name from file name or use default
  let className = "AutoPath";
  if (fileName) {
    const baseName = fileName.split(/[\\/]/).pop() || "";
    className = stripProjectExtension(baseName).replace(/[^a-zA-Z0-9]/g, "_");
    if (!className) className = "AutoPath";
  }

  // Collect all pose names including control points
  const allPoseDeclarations: string[] = [];
  const allPoseInitializations: string[] = [];

  // Track declared poses to prevent duplicates
  const declaredPoses = new Set<string>();

  // Map logic name to variable name
  const poseVariableNames: Map<string, string> = new Map();

  // Helper to add pose if not exists
  const addPose = (
    variableName: string,
    lookupName: string = variableName,
    point?: Point,
    overrideDegrees?: number, // - New parameter
  ): void => {
    if (!declaredPoses.has(variableName)) {
      allPoseDeclarations.push(`    private Pose ${variableName};`);

      if (hardcodeValues && point) {
        // Use exact values
        // Use overrideDegrees if provided, otherwise default to 0
        const degrees =
          overrideDegrees !== undefined
            ? overrideDegrees
            : (point as any).degrees || 0;

        if (coordinateSystem === "FTC") {
          const userPt = toUser(point, "FTC");
          const userHead = toUserHeading(degrees, "FTC");
          const px =
            codeUnits === "metric"
              ? `cmToInches(${(userPt.x * 2.54).toFixed(3)})`
              : userPt.x.toFixed(3);
          const py =
            codeUnits === "metric"
              ? `cmToInches(${(userPt.y * 2.54).toFixed(3)})`
              : userPt.y.toFixed(3);
          allPoseInitializations.push(
            `        ${variableName} = buildPose(${px}, ${py}, Math.toRadians(${userHead.toFixed(3)}));`,
          );
        } else {
          const px =
            codeUnits === "metric"
              ? `cmToInches(${(point.x * 2.54).toFixed(3)})`
              : point.x.toFixed(3);
          const py =
            codeUnits === "metric"
              ? `cmToInches(${(point.y * 2.54).toFixed(3)})`
              : point.y.toFixed(3);
          allPoseInitializations.push(
            `        ${variableName} = new Pose(${px}, ${py}, Math.toRadians(${degrees}));`,
          );
        }
      } else {
        // Use pp.get
        allPoseInitializations.push(
          `        ${variableName} = pp.get("${lookupName}");`,
        );
      }
      declaredPoses.add(variableName);
    }
  };

  // Determine start degrees
  let startDegrees = 0;
  if (startPoint.heading === "constant" && startPoint.degrees !== undefined) {
    startDegrees = startPoint.degrees;
  } else if (
    startPoint.heading === "linear" &&
    startPoint.startDeg !== undefined
  ) {
    startDegrees = startPoint.startDeg;
  }

  // Add start point
  addPose("startPoint", "startPoint", startPoint, startDegrees);
  poseVariableNames.set("startPoint", "startPoint");

  // Track used path chain names to handle duplicates
  const usedPathChainNames = new Map<string, number>();
  const pathChainVariables: string[] = []; // Stores the variable name for each line index

  // Process each line
  lines.forEach((line, lineIdx) => {
    const endPointName = line.name
      ? line.name.replace(/[^a-zA-Z0-9]/g, "")
      : `point${lineIdx + 1}`;

    // Determine end degrees
    let endDegrees = 0;
    if (
      line.endPoint.heading === "constant" &&
      line.endPoint.degrees !== undefined
    ) {
      endDegrees = line.endPoint.degrees;
    } else if (
      line.endPoint.heading === "linear" &&
      line.endPoint.endDeg !== undefined
    ) {
      endDegrees = line.endPoint.endDeg;
    }

    // Add end point declaration (shared poses)
    // Note: line.endPoint includes degrees from BasePoint
    addPose(endPointName, endPointName, line.endPoint, endDegrees);
    poseVariableNames.set(`point${lineIdx + 1}`, endPointName);

    if (line.controlPoints && line.controlPoints.length > 0) {
      line.controlPoints.forEach((cp, controlIdx) => {
        const controlPointName = `${endPointName}_control${controlIdx + 1}`;
        const uniqueControlVar = `${endPointName}_line${lineIdx}_control${controlIdx + 1}`;

        allPoseDeclarations.push(`    private Pose ${uniqueControlVar};`);

        if (hardcodeValues) {
          allPoseInitializations.push(
            `        ${uniqueControlVar} = new Pose(${cp.x.toFixed(3)}, ${cp.y.toFixed(3)});`,
          );
        } else {
          allPoseInitializations.push(
            `        ${uniqueControlVar} = pp.get(\"${controlPointName}\");`,
          );
        }

        // Store for use in path building
        // Key: identifying the control point for this specific line/index
        poseVariableNames.set(
          `${lineIdx}_control${controlIdx}`, // Use line index to disambiguate
          uniqueControlVar,
        );
      });
    }
  });

  // Generate path chain declarations
  const pathChainDeclarations = lines
    .map((line, idx) => {
      const startPoseName =
        idx === 0
          ? "startPoint"
          : lines[idx - 1]?.name
            ? lines[idx - 1]!.name!.replace(/[^a-zA-Z0-9]/g, "")
            : `point${idx}`;
      const endPoseName = lines[idx].name
        ? lines[idx].name.replace(/[^a-zA-Z0-9]/g, "")
        : `point${idx + 1}`;

      let pathName = `${startPoseName}TO${endPoseName}`;

      // Handle duplicates
      if (usedPathChainNames.has(pathName)) {
        const count = usedPathChainNames.get(pathName)!;
        usedPathChainNames.set(pathName, count + 1);
        pathName = `${pathName}_${count}`;
      } else {
        usedPathChainNames.set(pathName, 1);
      }

      pathChainVariables.push(pathName);

      // If this line is chained to the previous, it does not get its own PathChain variable
      if (line.isChain) {
        return "";
      }

      return `    private PathChain ${pathName};`;
    })
    .filter(Boolean)
    .join("\n");

  // Generate ProgressTracker field
  const progressTrackerField = `    private final ProgressTracker progressTracker;`;

  // Define library-specific names
  const isNextFTC = targetLibrary === "NextFTC";
  const SequentialGroupClass = isNextFTC
    ? "SequentialGroup"
    : "SequentialCommandGroup";
  const ParallelRaceClass = isNextFTC
    ? "ParallelRaceGroup"
    : "ParallelRaceGroup";
  const WaitCmdClass = isNextFTC ? "Delay" : "WaitCommand";
  const InstantCmdClass = "InstantCommand";
  const WaitUntilCmdClass = isNextFTC ? "WaitUntil" : "WaitUntilCommand"; // NextFTC has similar or user maps it
  const FollowPathCmdClass = isNextFTC ? "FollowPath" : "FollowPathCommand";

  // Generate addCommands calls with event handling; iterate sequence if provided
  const commands: string[] = [];

  const defaultSequence: SequenceItem[] = lines.map((ln, idx) => ({
    kind: "path",
    lineId: ln.id || `line-${idx + 1}`,
  }));

  const flattenSequence = (seq: SequenceItem[]): SequenceItem[] => {
    const result: SequenceItem[] = [];
    seq.forEach((item) => {
      if (item.kind === "macro") {
        if (item.sequence && item.sequence.length > 0) {
          result.push(...flattenSequence(item.sequence));
        }
      } else {
        result.push(item);
      }
    });
    return result;
  };

  const seq = flattenSequence(
    sequence && sequence.length ? sequence : defaultSequence,
  );

  seq.forEach((item, idx) => {
    // Registry Check
    const action = actionRegistry.get(item.kind);
    if (action && action.toSequentialCommand) {
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

    // The name of the entire PathChain is the pathName of the root path
    const pathName = pathChainVariables[lineIdx];
    const pathDisplayName = pathName;

    // Gather all event markers for the entire chain starting at this root line
    let allEventMarkers = [...(line.eventMarkers || [])];
    let nextIdx = lineIdx + 1;
    while (nextIdx < lines.length && lines[nextIdx].isChain) {
      const nextMarkers = lines[nextIdx].eventMarkers;
      if (nextMarkers && nextMarkers.length > 0) {
        allEventMarkers.push(...nextMarkers);
      }
      nextIdx++;
    }

    // Construct FollowPath instantiation
    const followPathInstance = isNextFTC
      ? `new ${FollowPathCmdClass}(${pathName})`
      : `new ${FollowPathCmdClass}(follower, ${pathName})`;

    if (isNextFTC) {
      commands.push(followPathInstance);
    } else {
      if (allEventMarkers && allEventMarkers.length > 0) {
        // Path has event markers

        // First: InstantCommand to set up tracker
        commands.push(
          `                new ${InstantCmdClass}(
                    () -> {
                        progressTracker.setCurrentChain(${pathName});
                        progressTracker.setCurrentPathName("${pathDisplayName}");`,
        );

        // Add event registrations
        allEventMarkers.forEach((event) => {
          commands[commands.length - 1] += `
                        progressTracker.registerEvent("${event.name}", ${event.position.toFixed(3)});`;
        });

        commands[commands.length - 1] += `
                    })`;

        // Second: ParallelRaceGroup for following path with event handling
        commands.push(`                new ${ParallelRaceClass}(
                    ${followPathInstance},
                    new ${SequentialGroupClass}(`);

        // Add WaitUntilCommand for each event
        allEventMarkers.forEach((event, eventIdx) => {
          if (eventIdx > 0) commands[commands.length - 1] += ",";
          commands[commands.length - 1] += `
                        new ${WaitUntilCmdClass}(() -> progressTracker.shouldTriggerEvent("${event.name}")),
                        new ${InstantCmdClass}(
                            () -> {
                                progressTracker.executeEvent("${event.name}");
                            })`;
        });

        commands[commands.length - 1] += `
                    ))`;
      } else {
        // No event markers - simple InstantCommand + FollowPathCommand
        commands.push(
          `                new ${InstantCmdClass}(
                    () -> {
                        progressTracker.setCurrentChain(${pathName});
                        progressTracker.setCurrentPathName("${pathDisplayName}");
                    }),
                ${followPathInstance}`,
        );
      }
    }
  });

  // Generate path building
  const pathBuildersArr: string[] = [];
  let currentBuilderStr = "";

  lines.forEach((line, idx) => {
    const startPoseVar =
      idx === 0 ? "startPoint" : poseVariableNames.get(`point${idx}`);
    // Fallback if something is wrong, though logic aligns with declaration loop
    const actualStartPose = startPoseVar || "startPoint";

    const endPoseName = line.name
      ? line.name.replace(/[^a-zA-Z0-9]/g, "")
      : `point${idx + 1}`;

    const endPoseVar = endPoseName;

    const pathName = pathChainVariables[idx];

    const isCurve = line.controlPoints.length > 0;
    const curveType = isCurve ? "BezierCurve" : "BezierLine";

    // Build control points string (instantiate inline as new Pose(x, y))
    let controlPointsStr = "";
    if (isCurve) {
      const controlPoints: string[] = [];
      line.controlPoints.forEach((cp) => {
        controlPoints.push(`new Pose(${cp.x.toFixed(3)}, ${cp.y.toFixed(3)})`);
      });
      controlPointsStr = controlPoints.join(", ") + ", ";
    }

    // Determine heading interpolation
    let headingConfig = "";
    if (line.endPoint.heading === "constant") {
      if (hardcodeValues) {
        headingConfig = `setConstantHeadingInterpolation(Math.toRadians(${line.endPoint.degrees || 0}))`;
      } else {
        headingConfig = `setConstantHeadingInterpolation(${endPoseVar}.getHeading())`;
      }
    } else if (line.endPoint.heading === "linear") {
      if (hardcodeValues) {
        headingConfig = `setLinearHeadingInterpolation(Math.toRadians(${line.endPoint.startDeg || 0}), Math.toRadians(${line.endPoint.endDeg || 0}))`;
      } else {
        headingConfig = `setLinearHeadingInterpolation(${actualStartPose}.getHeading(), ${endPoseVar}.getHeading())`;
      }
    } else if (line.endPoint.heading === "facingPoint") {
      let hxStr = "0";
      let hyStr = "0";
      if (coordinateSystem === "FTC") {
        const uTarget = toUser(
          {
            x: line.endPoint.targetX || 0,
            y: line.endPoint.targetY || 0,
          },
          "FTC",
        );
        hxStr = uTarget.x.toFixed(3);
        hyStr = uTarget.y.toFixed(3);
      } else {
        let targetX = line.endPoint.targetX || 0;
        let targetY = line.endPoint.targetY || 0;
        hxStr =
          codeUnits === "metric"
            ? `cmToInches(${(targetX * 2.54).toFixed(3)})`
            : targetX.toFixed(3);
        hyStr =
          codeUnits === "metric"
            ? `cmToInches(${(targetY * 2.54).toFixed(3)})`
            : targetY.toFixed(3);
      }
      headingConfig = `setHeadingInterpolation(HeadingInterpolator.facingPoint(new Pose(${hxStr}, ${hyStr})))`;
    } else {
      headingConfig = `setTangentHeadingInterpolation()`;
    }

    // Build reverse config
    const reverseConfig = line.endPoint.reverse
      ? "\n                .setReversed()"
      : "";

    if (!line.isChain) {
      if (currentBuilderStr !== "") {
        currentBuilderStr += "\n            .build();";
        pathBuildersArr.push(currentBuilderStr);
      }
      currentBuilderStr = `        ${pathName} = follower.pathBuilder()
            .addPath(new ${curveType}(${actualStartPose}, ${controlPointsStr}${endPoseVar}))
            .${headingConfig}${reverseConfig}`;
    } else {
      currentBuilderStr += `
            .addPath(new ${curveType}(${actualStartPose}, ${controlPointsStr}${endPoseVar}))
            .${headingConfig}${reverseConfig}`;
    }
  });

  if (currentBuilderStr !== "") {
    currentBuilderStr += "\n            .build();";
    pathBuildersArr.push(currentBuilderStr);
  }

  const pathBuilders = pathBuildersArr.join("\n\n");

  // Generate imports based on library
  let imports = "";
  if (isNextFTC) {
    imports = `
import dev.nextftc.core.commands.Command;
import dev.nextftc.core.commands.groups.SequentialGroup;
import dev.nextftc.core.commands.groups.ParallelRaceGroup;
import dev.nextftc.core.commands.delays.Delay;
import dev.nextftc.core.commands.utility.InstantCommand;
import dev.nextftc.core.commands.delays.WaitUntil;
import org.firstinspires.ftc.teamcode.pedroPathing.FollowPath;
`;
  } else {
    imports = `
import com.seattlesolvers.solverslib.command.SequentialCommandGroup;
import com.seattlesolvers.solverslib.command.ParallelRaceGroup;
import com.seattlesolvers.solverslib.command.WaitUntilCommand;
import com.seattlesolvers.solverslib.command.WaitCommand;
import com.seattlesolvers.solverslib.command.InstantCommand;
import com.seattlesolvers.solverslib.pedroCommand.FollowPathCommand;
`;
  }

  const ppReaderImport = hardcodeValues
    ? ""
    : "import com.turtletracerlib.PedroPathReader;";
  const ppReaderInit = hardcodeValues
    ? ""
    : (() => {
        const rawName = fileName ? fileName.split(/[\\/]/).pop() || "" : "";
        const baseName =
          stripProjectExtension(rawName || "AutoPath") || "AutoPath";
        const ext =
          getProjectExtensionFromPath(rawName) || DEFAULT_PROJECT_EXTENSION;
        return `PedroPathReader pp = new PedroPathReader("${baseName}${ext}", hw.appContext);`;
      })();

  let sequentialCommandCode = "";

  if (isNextFTC) {
    sequentialCommandCode = `
${AUTO_GENERATED_FILE_WARNING_MESSAGE}

package ${packageName};

import com.pedropathing.follower.Follower;
import com.pedropathing.geometry.BezierCurve;
import com.pedropathing.geometry.BezierLine;
import com.pedropathing.geometry.Pose;
import com.pedropathing.paths.PathChain;
import com.pedropathing.paths.HeadingInterpolator;
import com.qualcomm.robotcore.hardware.HardwareMap;
${imports}
${ppReaderImport}
import java.io.IOException;
import ${packageName.split(".").slice(0, 4).join(".")}.Subsystems.Drivetrain;

public class ${className} extends Command {

    private final Follower follower;
    private Command group;

    // Poses
${allPoseDeclarations.join("\n")}

    // Path chains
${pathChainDeclarations}

    public ${className}(final Drivetrain drive, HardwareMap hw) throws IOException {
        this.follower = drive.getFollower();

        ${ppReaderInit}

        // Load poses
${allPoseInitializations.join("\n")}

        follower.setStartingPose(startPoint);
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
}
`;
  } else {
    sequentialCommandCode = `
${AUTO_GENERATED_FILE_WARNING_MESSAGE}

package ${packageName};

import com.pedropathing.follower.Follower;
import com.pedropathing.geometry.BezierCurve;
import com.pedropathing.geometry.BezierLine;
import com.pedropathing.geometry.Pose;
import com.pedropathing.paths.PathChain;
import com.pedropathing.paths.HeadingInterpolator;
import com.qualcomm.robotcore.hardware.HardwareMap;
import com.pedropathing.ftc.InvertedFTCCoordinates;
import com.pedropathing.geometry.PedroCoordinates;
import com.pedropathing.ftc.PoseConverter;
${imports}
import org.firstinspires.ftc.robotcore.external.Telemetry;
${ppReaderImport}
import com.turtletracerlib.pathing.ProgressTracker;
import com.turtletracerlib.pathing.NamedCommands;
import java.io.IOException;
import ${packageName.split(".").slice(0, 4).join(".")}.Subsystems.Drivetrain;

public class ${className} extends ${SequentialGroupClass} {

    private final Follower follower;
${progressTrackerField}

    // Poses
${allPoseDeclarations.join("\n")}

    // Path chains
${pathChainDeclarations}

    public ${className}(final Drivetrain drive, HardwareMap hw, Telemetry telemetry) throws IOException {
        this.follower = drive.getFollower();
        this.progressTracker = new ProgressTracker(follower, telemetry);

        ${ppReaderInit}

        // Load poses
${allPoseInitializations.join("\n")}

        follower.setStartingPose(startPoint);

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
        return PoseConverter.pose2DToPose(
            new org.firstinspires.ftc.robotcore.external.navigation.Pose2D(
                org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit.INCH,
                x, y,
                org.firstinspires.ftc.robotcore.external.navigation.AngleUnit.RADIANS,
                heading
            ),
            InvertedFTCCoordinates.INSTANCE
        ).getAsCoordinateSystem(PedroCoordinates.INSTANCE);
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

  try {
    const formattedCode = await prettier.format(sequentialCommandCode, {
      parser: "java",
      plugins: [prettierJavaPlugin],
    });
    return formattedCode;
  } catch (error) {
    console.error("Code formatting error:", error);
    return sequentialCommandCode;
  }
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
      settings.packageName ?? "org.firstinspires.ftc.teamcode.Commands.AutoCommands",
      settings.hardcodeValues ?? false,
      settings.coordinateSystem ?? "Pedro",
      settings.codeUnits ?? "imperial"
    );
  }
});
