// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import prettier from "prettier";
import prettierJavaPlugin from "prettier-plugin-java";
import type { Point, Line, SequenceItem, TurtleData } from "../../types";
import pkg from "../../../package.json";
import { generateEventMarkerCode } from "./eventMarkerUtils";
import { actionRegistry } from "../../lib/actionRegistry";
import {
  toUser,
  toUserHeading,
  type CoordinateSystem,
} from "../../utils/coordinates";
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
    className = stripProjectExtension(baseName).replaceAll(
      /[^a-zA-Z0-9]/g,
      "_",
    );
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
          overrideDegrees === undefined
            ? (point as any).degrees || 0
            : overrideDegrees;

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
      ? line.name.replaceAll(/[^a-zA-Z0-9]/g, "")
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

  // Pre-calculate chain information
  const chainInfos = lines.map((line, idx) => {
    let rootIdx = idx;
    if (line.isChain) {
      for (let i = idx; i >= 0; i--) {
        if (!lines[i].isChain) {
          rootIdx = i;
          break;
        }
      }
    }

    // Find total count in this chain
    let totalInChain = 1;
    // Walk forward from root
    for (let i = rootIdx + 1; i < lines.length; i++) {
      if (lines[i].isChain) totalInChain++;
      else break;
    }

    // Find local index within chain
    let localIdx = idx - rootIdx;

    return { localIdx, totalInChain };
  });

  // Generate path chain declarations
  const pathChainDeclarations = lines
    .map((line, idx) => {
      const startPoseName =
        idx === 0
          ? "startPoint"
          : lines[idx - 1]?.name
            ? lines[idx - 1]!.name!.replaceAll(/[^a-zA-Z0-9]/g, "")
            : `point${idx}`;
      const endPoseName = lines[idx].name
        ? lines[idx].name.replaceAll(/[^a-zA-Z0-9]/g, "")
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

  // Define library-specific names
  const isNextFTC = targetLibrary === "NextFTC";
  const SequentialGroupClass = isNextFTC
    ? "SequentialGroup"
    : "SequentialCommandGroup";
  const WaitCmdClass = isNextFTC ? "Delay" : "WaitCommand";
  const InstantCmdClass = "InstantCommand";
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

  const seq = flattenSequence(sequence?.length ? sequence : defaultSequence);

  seq.forEach((item, idx) => {
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

    // The name of the entire PathChain is the pathName of the root path
    const pathName = pathChainVariables[lineIdx];

    // Construct FollowPath instantiation
    const followPathInstance = isNextFTC
      ? `new ${FollowPathCmdClass}(${pathName})`
      : `new ${FollowPathCmdClass}(follower, ${pathName})`;

    commands.push(`                ${followPathInstance}`);
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
      ? line.name.replaceAll(/[^a-zA-Z0-9]/g, "")
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

    let headingConfig = "";
    // Helper to generate a HeadingInterpolator string representation (e.g. "HeadingInterpolator.tangent")
    const generateInterpolatorString = (
      pointDef: any,
      startPoseVarInner: string,
      endPoseVarInner: string,
    ) => {
      let config = "";
      if (coordinateSystem === "FTC") {
        if (pointDef.heading === "constant") {
          // If hardcode values is disabled, we don't have access to .getHeading() on the fly easily for just the segment string unless we map it
          // But Piecewise with variables might be tricky, so we rely on hardcoding or variables.
          if (hardcodeValues || pointDef.degrees !== undefined)
            config = `Math.toRadians(${toUserHeading(pointDef.degrees || 0, "FTC").toFixed(3)})`;
          else config = `${endPoseVarInner}.getHeading()`;
        } else if (pointDef.heading === "linear") {
          if (
            hardcodeValues ||
            (pointDef.startDeg !== undefined && pointDef.endDeg !== undefined)
          )
            config = `Math.toRadians(${toUserHeading(pointDef.startDeg || 0, "FTC").toFixed(3)}), Math.toRadians(${toUserHeading(pointDef.endDeg || 0, "FTC").toFixed(3)})`;
          else
            config = `${startPoseVarInner}.getHeading(), ${endPoseVarInner}.getHeading()`;
        } else if (pointDef.heading === "facingPoint") {
          const uTarget = toUser(
            { x: pointDef.targetX || 0, y: pointDef.targetY || 0 },
            "FTC",
          );
          config = `new Pose(${uTarget.x.toFixed(3)}, ${uTarget.y.toFixed(3)})`;
        }
      } else if (pointDef.heading === "constant") {
        if (hardcodeValues || pointDef.degrees !== undefined)
          config = `Math.toRadians(${pointDef.degrees || 0})`;
        else config = `${endPoseVarInner}.getHeading()`;
      } else if (pointDef.heading === "linear") {
        if (
          hardcodeValues ||
          (pointDef.startDeg !== undefined && pointDef.endDeg !== undefined)
        )
          config = `Math.toRadians(${pointDef.startDeg || 0}), Math.toRadians(${pointDef.endDeg || 0})`;
        else
          config = `${startPoseVarInner}.getHeading(), ${endPoseVarInner}.getHeading()`;
      } else if (pointDef.heading === "facingPoint") {
        const targetX = pointDef.targetX || 0;
        const targetY = pointDef.targetY || 0;
        const hx =
          codeUnits === "metric"
            ? `cmToInches(${(targetX * 2.54).toFixed(3)})`
            : targetX.toFixed(3);
        const hy =
          codeUnits === "metric"
            ? `cmToInches(${(targetY * 2.54).toFixed(3)})`
            : targetY.toFixed(3);
        config = `new Pose(${hx}, ${hy})`;
      }

      let baseName = "";
      if (pointDef.heading === "constant") {
        baseName = `HeadingInterpolator.constant(${config})`;
      } else if (pointDef.heading === "linear") {
        baseName = `HeadingInterpolator.linear(${config})`;
      } else if (pointDef.heading === "tangential") {
        baseName = `HeadingInterpolator.tangent`;
      } else if (pointDef.heading === "facingPoint") {
        baseName = `HeadingInterpolator.facingPoint(${config})`;
      }

      if (pointDef.reverse) {
        if (pointDef.heading === "tangential")
          return "HeadingInterpolator.reversedTangent";
        if (pointDef.heading === "linear")
          return `HeadingInterpolator.reversedLinear(${config})`;
        if (pointDef.heading === "constant")
          return `HeadingInterpolator.reversedConstant(${config})`;
        if (pointDef.heading === "facingPoint")
          return `HeadingInterpolator.reversedFacingPoint(${config})`;
      }
      return baseName;
    };

    let headingMethodCode = "";
    let globalHeadingCode = "";

    const constructHeadingMethod = (targetConfig: any) => {
      if (targetConfig.heading === "piecewise") {
        const segmentsStr = (targetConfig.segments || [])
          .map((seg: any) => {
            const interpStr = generateInterpolatorString(
              seg,
              actualStartPose,
              endPoseVar,
            );
            return `\n                new HeadingInterpolator.PiecewiseNode(${seg.tStart}, ${seg.tEnd}, ${interpStr})`;
          })
          .join(",");
        return `.setHeadingInterpolation(HeadingInterpolator.piecewise(${segmentsStr}\n            ))`;
      }

      let hConfig = generateInterpolatorString(
        targetConfig,
        actualStartPose,
        endPoseVar,
      );
      let args = "";
      if (hConfig.includes("(")) {
        args = hConfig.slice(
          hConfig.indexOf("(") + 1,
          hConfig.lastIndexOf(")"),
        );
      }

      if (targetConfig.reverse) {
        if (targetConfig.heading === "constant") {
          return `.setHeadingInterpolation(HeadingInterpolator.constant(${args}))\n            .setReversed()`;
        } else if (targetConfig.heading === "linear") {
          return `.setHeadingInterpolation(HeadingInterpolator.linear(${args}))\n            .setReversed()`;
        } else if (targetConfig.heading === "tangential") {
          return `.setHeadingInterpolation(HeadingInterpolator.tangent)\n            .setReversed()`;
        } else if (targetConfig.heading === "facingPoint") {
          return `.setHeadingInterpolation(HeadingInterpolator.facingPoint(${args}))\n            .setReversed()`;
        }
      } else if (targetConfig.heading === "constant") {
        return `.setConstantHeadingInterpolation(${args})`;
      } else if (targetConfig.heading === "linear") {
        return `.setLinearHeadingInterpolation(${args})`;
      } else if (targetConfig.heading === "tangential") {
        return `.setTangentHeadingInterpolation()`;
      } else if (targetConfig.heading === "facingPoint") {
        return `.setHeadingInterpolation(HeadingInterpolator.facingPoint(${args}))`;
      }
      return "";
    };

    const isChainRoot =
      !line.isChain && idx + 1 < lines.length && lines[idx + 1].isChain;
    let hasGlobalHeading = false;

    let tempIdx = idx;
    let rootLine = line;
    while (rootLine.isChain && tempIdx > 0) {
      tempIdx--;
      rootLine = lines[tempIdx];
    }
    if (rootLine.globalHeading && rootLine.globalHeading !== ("none" as any)) {
      hasGlobalHeading = true;
      if (!line.isChain) {
        const globalConfig = {
          heading: rootLine.globalHeading,
          reverse: rootLine.globalReverse,
          degrees: rootLine.globalDegrees,
          startDeg: rootLine.globalStartDeg,
          endDeg: rootLine.globalEndDeg,
          targetX: rootLine.globalTargetX,
          targetY: rootLine.globalTargetY,
          segments: rootLine.globalSegments,
        };
        const globalInterpStr = constructHeadingMethod(globalConfig).replaceAll(
          /set(Constant|Linear|Tangent|Heading)Interpolation\(/g,
          "setGlobalHeadingInterpolation(",
        );
        globalHeadingCode = `\n            ${globalInterpStr}`;
      }
    }

    if (!hasGlobalHeading) {
      headingMethodCode = constructHeadingMethod(line.endPoint);
    }

    // Add event markers to the path builder
    const _startP =
      idx === 0 ? startPoint : lines[idx - 1]?.endPoint || startPoint;
    const _cps = [_startP, ...line.controlPoints, line.endPoint];
    const _info = chainInfos[idx];

    const eventMarkerCode = generateEventMarkerCode(
      line.eventMarkers,
      "            ",
      _cps,
      _info.localIdx,
      _info.totalInChain,
    );

    if (line.isChain) {
      currentBuilderStr += `
            .addPath(new ${curveType}(${actualStartPose}, ${controlPointsStr}${endPoseVar}))
            ${headingMethodCode}${eventMarkerCode}`;
    } else {
      if (currentBuilderStr !== "") {
        currentBuilderStr += "\n            .build();";
        pathBuildersArr.push(currentBuilderStr);
      }
      currentBuilderStr = `        ${pathName} = follower.pathBuilder()
            .addPath(new ${curveType}(${actualStartPose}, ${controlPointsStr}${endPoseVar}))
            ${headingMethodCode}${eventMarkerCode}${globalHeadingCode}`;
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
import dev.nextftc.core.commands.delays.Delay;
import dev.nextftc.core.commands.utility.InstantCommand;
import org.firstinspires.ftc.teamcode.pedroPathing.FollowPath;
`;
  } else {
    imports = `
import com.seattlesolvers.solverslib.command.SequentialCommandGroup;
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
import com.turtletracerlib.pathing.NamedCommands;
import java.io.IOException;
import ${packageName.split(".").slice(0, 4).join(".")}.Subsystems.Drivetrain;

public class ${className} extends ${SequentialGroupClass} {

    private final Follower follower;

    // Poses
${allPoseDeclarations.join("\n")}

    // Path chains
${pathChainDeclarations}

    public ${className}(final Drivetrain drive, HardwareMap hw, Telemetry telemetry) throws IOException {
        this.follower = drive.getFollower();

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
      settings.packageName ??
        "org.firstinspires.ftc.teamcode.Commands.AutoCommands",
      settings.hardcodeValues ?? false,
      settings.coordinateSystem ?? "Pedro",
      settings.codeUnits ?? "imperial",
    );
  },
});
