// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import prettier from "prettier";
import prettierJavaPlugin from "prettier-plugin-java";
import type { Point, Line, BasePoint, SequenceItem } from "../types";
import { getCurvePoint } from "./math";
import pkg from "../../package.json";
import { actionRegistry } from "../lib/actionRegistry";

/**
 * Generate Java code from path data
 */

const AUTO_GENERATED_FILE_WARNING_MESSAGE: string = `
/* ============================================================= *
 *        Pedro Pathing Plus Visualizer — Auto-Generated         *
 *                                                               *
 *  Version: ${pkg.version}.                                              *
 *  Copyright (c) ${new Date().getFullYear()} Matthew Allen                             *
 *                                                               *
 *  THIS FILE IS AUTO-GENERATED — DO NOT EDIT MANUALLY.          *
 *  Changes will be overwritten when regenerated.                *
 * ============================================================= */
`;
export async function generateJavaCode(
  startPoint: Point,
  lines: Line[],
  exportFullCode: boolean,
  sequence?: SequenceItem[],
  packageName: string = "org.firstinspires.ftc.teamcode.Commands.AutoCommands",
  telemetryImpl: "Standard" | "Dashboard" | "Panels" | "None" = "Panels",
): Promise<string> {
  const headingTypeToFunctionName = {
    constant: "setConstantHeadingInterpolation",
    linear: "setLinearHeadingInterpolation",
    tangential: "setTangentHeadingInterpolation",
  };

  // Collect all unique event marker names
  const eventMarkerNames = new Set<string>();
  lines.forEach((line) => {
    line.eventMarkers?.forEach((event) => {
      eventMarkerNames.add(event.name);
    });
  });
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

  if (sequence) {
    const flatSeq = flattenSequence(sequence);
    flatSeq.forEach((item) => {
      if ((item as any).kind === "wait" && (item as any).eventMarkers) {
        (item as any).eventMarkers.forEach((event: any) => {
          eventMarkerNames.add(event.name);
        });
      }
    });
  }

  const pathChainNames: string[] = [];
  const usedPathNames = new Map<string, number>();

  // First pass: generate unique variable names for all lines
  lines.forEach((line, idx) => {
    let baseName = line.name
      ? line.name.replace(/[^a-zA-Z0-9]/g, "")
      : `line${idx + 1}`;

    // Ensure we preserve the base name but add suffix if needed
    if (usedPathNames.has(baseName)) {
      const count = usedPathNames.get(baseName)!;
      usedPathNames.set(baseName, count + 1);
      baseName = `${baseName}_${count}`;
    } else {
      usedPathNames.set(baseName, 1);
    }
    pathChainNames.push(baseName);
  });

  let pathsClass = `
  public static class Paths {
    ${pathChainNames
      .map((variableName) => {
        return `public PathChain ${variableName};`;
      })
      .join("\n")}
    
    public Paths(Follower follower) {
      ${lines
        .map((line, idx) => {
          const variableName = pathChainNames[idx];
          const start =
            idx === 0
              ? `new Pose(${startPoint.x.toFixed(3)}, ${startPoint.y.toFixed(3)})`
              : `new Pose(${lines[idx - 1].endPoint.x.toFixed(3)}, ${lines[idx - 1].endPoint.y.toFixed(3)})`;

          const controlPoints =
            line.controlPoints.length > 0
              ? `${line.controlPoints
                  .map(
                    (point) =>
                      `new Pose(${point.x.toFixed(3)}, ${point.y.toFixed(3)})`,
                  )
                  .join(",\n")},`
              : "";

          const curveType =
            line.controlPoints.length === 0
              ? `new BezierLine`
              : `new BezierCurve`;

          const headingConfig =
            line.endPoint.heading === "constant"
              ? `Math.toRadians(${line.endPoint.degrees})`
              : line.endPoint.heading === "linear"
                ? `Math.toRadians(${line.endPoint.startDeg}), Math.toRadians(${line.endPoint.endDeg})`
                : "";

          const reverseConfig = line.endPoint.reverse ? ".setReversed()" : "";

          // Add event markers to the path builder
          let eventMarkerCode = "";
          if (line.eventMarkers && line.eventMarkers.length > 0) {
            eventMarkerCode = line.eventMarkers
              .map(
                (event) =>
                  `\n        .addEventMarker(${event.position.toFixed(3)}, "${event.name}")`,
              )
              .join("");
          }

          return `${variableName} = follower.pathBuilder().addPath(
          ${curveType}(
            ${start},
            ${controlPoints}
            new Pose(${line.endPoint.x.toFixed(3)}, ${line.endPoint.y.toFixed(3)})
          )
        ).${headingTypeToFunctionName[line.endPoint.heading]}(${headingConfig})
        ${reverseConfig}${eventMarkerCode}
        .build();`;
        })
        .join("\n\n")}
    }
  }
  `;

  // Add NamedCommands registration instructions
  let namedCommandsSection = "";
  if (eventMarkerNames.size > 0) {
    namedCommandsSection = `
    
    // ===== NAMED COMMANDS REGISTRATION =====
    // In your RobotContainer class, register named commands like this:
    // 
    // NamedCommands.registerCommand("CommandName", yourCommand);
    // 
    // Example for the event markers in this path:
    ${Array.from(eventMarkerNames)
      .map(
        (name) =>
          `// NamedCommands.registerCommand("${name}", your${name.replace(/_/g, "")}Command);`,
      )
      .join("\n    ")}
    
    // Make sure to register all named commands BEFORE creating any paths or autos.
    `;
  }

  // Generate state machine logic
  let stateMachineCode = "";
  let stateStep = 0;

  const rawSequence =
    sequence && sequence.length > 0
      ? sequence
      : lines.map(
          (line, i) =>
            ({
              kind: "path",
              lineId: line.id || `line-${i + 1}`,
            }) as any,
        );

  const targetSequence = flattenSequence(rawSequence);

  targetSequence.forEach((item) => {
    // Check Registry
    const action = actionRegistry.get(item.kind);
    if (action && action.toJavaCode) {
      // Registry Action (e.g. Wait)
      // Note: we don't emit 'case stateStep:' here because toJavaCode is expected to generate it or return code block.
      // But my WaitAction implementation generates `case stateStep: ... case stateStep+1: ...`
      // So I should NOT emit `case stateStep:` before calling it if it handles it.
      // My implementation of WaitAction.ts DOES generate "case ${stateStep}:".
      // But the loop here previously emitted `stateMachineCode += ... case ...`.
      // I should remove the pre-emission for registry items.

      const res = action.toJavaCode(item, { stateStep });
      stateMachineCode += res.code;
      stateStep += res.stepsUsed;
      return;
    }

    stateMachineCode += `\n        case ${stateStep}:`;

    if (item.kind === "path") {
      const lineIndex = lines.findIndex(
        (l) =>
          (l.id || `line-${lines.indexOf(l) + 1}`) === (item as any).lineId,
      );

      const idx = lineIndex !== -1 ? lineIndex : -1;

      if (idx !== -1) {
        stateMachineCode += `\n          follower.followPath(paths.${pathChainNames[idx]}, true);`;
        stateMachineCode += `\n          setPathState(${stateStep + 1});`;
        stateMachineCode += `\n          break;`;

        stateMachineCode += `\n        case ${stateStep + 1}:`;
        stateMachineCode += `\n          if(!follower.isBusy()) {`;
        stateMachineCode += `\n            setPathState(${stateStep + 2});`;
        stateMachineCode += `\n          }`;
        stateMachineCode += `\n          break;`;
        stateStep += 2;
      } else {
        stateMachineCode += `\n          setPathState(${stateStep + 1});`;
        stateMachineCode += `\n          break;`;
        stateStep += 1;
      }
    }
  });

  stateMachineCode += `\n        case ${stateStep}:`;
  stateMachineCode += `\n          requestOpModeStop();`;
  stateMachineCode += `\n          pathState = -1;`;
  stateMachineCode += `\n          break;`;

  let file = "";
  if (!exportFullCode) {
    file =
      AUTO_GENERATED_FILE_WARNING_MESSAGE + pathsClass + namedCommandsSection;
  } else {
    // Determine imports based on telemetry implementation
    let extraImports = "";
    if (telemetryImpl === "Panels") {
      extraImports = `
    import com.bylazar.configurables.annotations.Configurable;
    import com.bylazar.telemetry.TelemetryManager;
    import com.bylazar.telemetry.PanelsTelemetry;`;
    } else if (telemetryImpl === "Dashboard") {
      extraImports = `
    import com.acmerobotics.dashboard.FtcDashboard;
    import com.acmerobotics.dashboard.telemetry.MultipleTelemetry;
    import org.firstinspires.ftc.robotcore.external.Telemetry;`;
    }

    const classAnnotations =
      telemetryImpl === "Panels" ? "@Configurable // Panels" : "";

    let telemetryField = "";
    if (telemetryImpl === "Panels") {
      telemetryField =
        "private TelemetryManager panelsTelemetry; // Panels Telemetry instance";
    } else if (telemetryImpl === "Dashboard") {
      telemetryField = "private Telemetry telemetryA;";
    }

    let telemetryInit = "";
    if (telemetryImpl === "Panels") {
      telemetryInit = `
        panelsTelemetry = PanelsTelemetry.INSTANCE.getTelemetry();
        // ...
        panelsTelemetry.debug("Status", "Initialized");
        panelsTelemetry.update(telemetry);`;
    } else if (telemetryImpl === "Dashboard") {
      telemetryInit = `
        telemetryA = new MultipleTelemetry(this.telemetry, FtcDashboard.getInstance().getTelemetry());
        telemetryA.addData("Status", "Initialized");
        telemetryA.update();`;
    } else if (telemetryImpl === "Standard") {
      telemetryInit = `
        telemetry.addData("Status", "Initialized");
        telemetry.update();`;
    }

    let telemetryLoop = "";
    if (telemetryImpl === "Panels") {
      telemetryLoop = `
        // Log values to Panels and Driver Station
        panelsTelemetry.debug("Path State", pathState);
        panelsTelemetry.debug("X", follower.getPose().getX());
        panelsTelemetry.debug("Y", follower.getPose().getY());
        panelsTelemetry.debug("Heading", follower.getPose().getHeading());
        panelsTelemetry.update(telemetry);`;
    } else if (telemetryImpl === "Dashboard") {
      telemetryLoop = `
        // Log values to Dashboard and Driver Station
        telemetryA.addData("Path State", pathState);
        telemetryA.addData("X", follower.getPose().getX());
        telemetryA.addData("Y", follower.getPose().getY());
        telemetryA.addData("Heading", follower.getPose().getHeading());
        telemetryA.update();`;
    } else if (telemetryImpl === "Standard") {
      telemetryLoop = `
        // Log values to Driver Station
        telemetry.addData("Path State", pathState);
        telemetry.addData("X", follower.getPose().getX());
        telemetry.addData("Y", follower.getPose().getY());
        telemetry.addData("Heading", follower.getPose().getHeading());
        telemetry.update();`;
    }

    file = `
    ${AUTO_GENERATED_FILE_WARNING_MESSAGE}

    package ${packageName};
    import com.qualcomm.robotcore.eventloop.opmode.OpMode;
    import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
    import com.qualcomm.robotcore.util.ElapsedTime;
    ${extraImports}
    import org.firstinspires.ftc.teamcode.pedroPathing.Constants;
    import com.pedropathing.geometry.BezierCurve;
    import com.pedropathing.geometry.BezierLine;
    import com.pedropathing.follower.Follower;
    import com.pedropathing.paths.PathChain;
    import com.pedropathing.geometry.Pose;
    ${eventMarkerNames.size > 0 ? "import com.pedropathing.NamedCommands;" : ""}
    
    @Autonomous(name = "Pedro Pathing Autonomous", group = "Autonomous")
    ${classAnnotations}
    public class PedroAutonomous extends OpMode {
      ${telemetryField}
      public Follower follower; // Pedro Pathing follower instance
      private int pathState; // Current autonomous path state (state machine)
      private ElapsedTime pathTimer; // Timer for path state machine
      private Paths paths; // Paths defined in the Paths class
      
      @Override
      public void init() {
        ${telemetryInit}

        follower = Constants.createFollower(hardwareMap);
        follower.setStartingPose(new Pose(72, 8, Math.toRadians(90)));

        pathTimer = new ElapsedTime();
        paths = new Paths(follower); // Build paths
      }
      
      @Override
      public void loop() {
        follower.update(); // Update Pedro Pathing
        pathState = autonomousPathUpdate(); // Update autonomous state machine

        ${telemetryLoop}
      }

      ${pathsClass}

      public int autonomousPathUpdate() {
        switch (pathState) {
          ${stateMachineCode}
        }
        return pathState;
      }

      public void setPathState(int pState) {
        pathState = pState;
        pathTimer.reset();
      }
      
      ${namedCommandsSection}
    }
    `;
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

/**
 * Generate an array of waypoints (not sampled points) along the path
 */
export function generatePointsArray(startPoint: Point, lines: Line[]): string {
  const points: BasePoint[] = [];

  // Add start point
  points.push(startPoint);

  // Add all waypoints (end points and control points)
  lines.forEach((line) => {
    // Add control points for this line
    line.controlPoints.forEach((controlPoint) => {
      points.push(controlPoint);
    });

    // Add end point of this line
    points.push(line.endPoint);
  });

  // Format as string array, removing decimal places for whole numbers
  const pointsString = points
    .map((point) => {
      const x = Number.isInteger(point.x)
        ? point.x.toFixed(1)
        : point.x.toFixed(3);
      const y = Number.isInteger(point.y)
        ? point.y.toFixed(1)
        : point.y.toFixed(3);
      return `(${x}, ${y})`;
    })
    .join(", ");

  return `[${pointsString}]`;
}

/**
 * Generate Sequential Command code
 */
export async function generateSequentialCommandCode(
  startPoint: Point,
  lines: Line[],
  fileName: string | null = null,
  sequence?: SequenceItem[],
  targetLibrary: "SolversLib" | "NextFTC" = "SolversLib",
  packageName: string = "org.firstinspires.ftc.teamcode.Commands.AutoCommands",
  hardcodeValues: boolean = false,
): Promise<string> {
  // Determine class name from file name or use default
  let className = "AutoPath";
  if (fileName) {
    const baseName = fileName.split(/[\\/]/).pop() || "";
    className = baseName.replace(".pp", "").replace(/[^a-zA-Z0-9]/g, "_");
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
    point?: BasePoint,
    overrideDegrees?: number, // - New parameter
  ): void => {
    if (!declaredPoses.has(variableName)) {
      allPoseDeclarations.push(`    private Pose ${variableName};`);

      if (hardcodeValues && point) {
        // Use exact values
        // Use overrideDegrees if provided, otherwise default to 0
        const degrees =
          overrideDegrees !== undefined ? overrideDegrees : point.degrees || 0;
        allPoseInitializations.push(
          `        ${variableName} = new Pose(${point.x.toFixed(3)}, ${point.y.toFixed(3)}, Math.toRadians(${degrees}));`,
        );
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
    .map((_, idx) => {
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

      return `    private PathChain ${pathName};`;
    })
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
  const WaitUntilCmdClass = isNextFTC ? "WaitUntil" : "WaitUntilCommand"; // Assuming NextFTC has similar or user maps it
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

    const pathName = pathChainVariables[lineIdx];
    const pathDisplayName = pathName;

    // Construct FollowPath instantiation
    const followPathInstance = isNextFTC
      ? `new ${FollowPathCmdClass}(${pathName})`
      : `new ${FollowPathCmdClass}(follower, ${pathName})`;

    if (line.eventMarkers && line.eventMarkers.length > 0) {
      // Path has event markers

      // First: InstantCommand to set up tracker
      commands.push(
        `                new ${InstantCmdClass}(
                    () -> {
                        progressTracker.setCurrentChain(${pathName});
                        progressTracker.setCurrentPathName("${pathDisplayName}");`,
      );

      // Add event registrations
      line.eventMarkers.forEach((event) => {
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
      line.eventMarkers.forEach((event, eventIdx) => {
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
  });

  // Generate path building
  const pathBuilders = lines
    .map((line, idx) => {
      const startPoseName =
        idx === 0
          ? "startPoint"
          : lines[idx - 1]?.name
            ? lines[idx - 1]!.name!.replace(/[^a-zA-Z0-9]/g, "")
            : `point${idx}`; // Uses 'pointN' which maps to endPointName in poseVariableNames?

      // Correctly resolve the variable name for start pose
      // In the loop above, we mapped `point${lineIdx+1}` -> `endPointName`
      // So `point${idx}` refers to the end point of the previous line (which is start of this one)
      // Special case: `point0` is not set, we use "startPoint" directly.

      const startPoseVar =
        idx === 0 ? "startPoint" : poseVariableNames.get(`point${idx}`);
      // Fallback if something is wrong, though logic aligns with declaration loop
      const actualStartPose = startPoseVar || "startPoint";

      const endPoseName = line.name
        ? line.name.replace(/[^a-zA-Z0-9]/g, "")
        : `point${idx + 1}`;

      // We already know the unique end pose variable name is just the cleaned name
      // Because we declared it as such in the set/addPose
      const endPoseVar = endPoseName;

      const pathName = pathChainVariables[idx];

      const isCurve = line.controlPoints.length > 0;
      const curveType = isCurve ? "BezierCurve" : "BezierLine";

      // Build control points string
      let controlPointsStr = "";
      if (isCurve) {
        const controlPoints: string[] = [];
        line.controlPoints.forEach((_, cpIdx) => {
          // Retrieve the unique variable we created
          const cpVar = poseVariableNames.get(`${idx}_control${cpIdx}`);
          if (cpVar) {
            controlPoints.push(cpVar);
          }
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
      } else {
        headingConfig = `setTangentHeadingInterpolation()`;
      }

      // Build reverse config
      const reverseConfig = line.endPoint.reverse
        ? "\n                .setReversed(true)"
        : "";

      return `        ${pathName} = follower.pathBuilder()
            .addPath(new ${curveType}(${actualStartPose}, ${controlPointsStr}${endPoseVar}))
            .${headingConfig}${reverseConfig}
            .build();`;
    })
    .join("\n\n        ");

  // Generate imports based on library
  let imports = "";
  if (isNextFTC) {
    imports = `
import dev.nextftc.core.command.groups.SequentialGroup;
import dev.nextftc.core.command.groups.ParallelRaceGroup;
import dev.nextftc.core.command.Delay;
import dev.nextftc.core.command.WaitUntil;
import dev.nextftc.core.command.InstantCommand;
import dev.nextftc.extensions.pedro.command.FollowPath;
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
    : "import com.pedropathingplus.PedroPathReader;";
  const ppReaderInit = hardcodeValues
    ? ""
    : `PedroPathReader pp = new PedroPathReader("${fileName ? fileName.split(/[\\/]/).pop() + ".pp" || "AutoPath.pp" : "AutoPath.pp"}", hw.appContext);`;

  const sequentialCommandCode = `
${AUTO_GENERATED_FILE_WARNING_MESSAGE}

package ${packageName};
    
import com.pedropathing.follower.Follower;
import com.pedropathing.geometry.BezierCurve;
import com.pedropathing.geometry.BezierLine;
import com.pedropathing.geometry.Pose;
import com.pedropathing.paths.PathChain;
import com.qualcomm.robotcore.hardware.HardwareMap;
${imports}
import org.firstinspires.ftc.robotcore.external.Telemetry;
${ppReaderImport}
import com.pedropathingplus.pathing.ProgressTracker;
import com.pedropathingplus.pathing.NamedCommands;
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
}
`;

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
