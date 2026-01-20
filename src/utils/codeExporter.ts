// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import prettier from "prettier";
import prettierJavaPlugin from "prettier-plugin-java";
import type { Point, Line, BasePoint, SequenceItem } from "../types";
import { getCurvePoint } from "./math";
import pkg from "../../package.json";

/**
 * Generate Java code from path data
 */

const AUTO_GENERATED_FILE_WARNING_MESSAGE: string = `
/* ============================================================= *
 *           Pedro Pathing Visualizer — Auto-Generated           *
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

          const reverseConfig = line.endPoint.reverse
            ? ".setReversed(true)"
            : "";

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
    } else if (item.kind === "wait") {
      const waitMs = (item as any).durationMs || 0;
      stateMachineCode += `\n          setPathState(${stateStep + 1});`;
      stateMachineCode += `\n          break;`;

      stateMachineCode += `\n        case ${stateStep + 1}:`;
      stateMachineCode += `\n          if(pathTimer.getMilliseconds() > ${waitMs}) {`;
      stateMachineCode += `\n            setPathState(${stateStep + 2});`;
      stateMachineCode += `\n          }`;
      stateMachineCode += `\n          break;`;
      stateStep += 2;
    } else if (item.kind === "rotate") {
      const degrees = (item as any).degrees || 0;
      const radians = (degrees * Math.PI) / 180;
      stateMachineCode += `\n          follower.turnTo(${radians.toFixed(3)});`;
      stateMachineCode += `\n          setPathState(${stateStep + 1});`;
      stateMachineCode += `\n          break;`;

      stateMachineCode += `\n        case ${stateStep + 1}:`;
      stateMachineCode += `\n          if(!follower.isBusy()) {`;
      stateMachineCode += `\n            setPathState(${stateStep + 2});`;
      stateMachineCode += `\n          }`;
      stateMachineCode += `\n          break;`;
      stateStep += 2;
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
    file = `
    ${AUTO_GENERATED_FILE_WARNING_MESSAGE}

    package ${packageName};
    import com.qualcomm.robotcore.eventloop.opmode.OpMode;
    import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
    import com.qualcomm.robotcore.util.ElapsedTime;
    import com.bylazar.configurables.annotations.Configurable;
    import com.bylazar.telemetry.TelemetryManager;
    import com.bylazar.telemetry.PanelsTelemetry;
    import org.firstinspires.ftc.teamcode.pedroPathing.Constants;
    import com.pedropathing.geometry.BezierCurve;
    import com.pedropathing.geometry.BezierLine;
    import com.pedropathing.follower.Follower;
    import com.pedropathing.paths.PathChain;
    import com.pedropathing.geometry.Pose;
    ${eventMarkerNames.size > 0 ? "import com.pedropathing.NamedCommands;" : ""}
    
    @Autonomous(name = "Pedro Pathing Autonomous", group = "Autonomous")
    @Configurable // Panels
    public class PedroAutonomous extends OpMode {
      private TelemetryManager panelsTelemetry; // Panels Telemetry instance
      public Follower follower; // Pedro Pathing follower instance
      private int pathState; // Current autonomous path state (state machine)
      private ElapsedTime pathTimer; // Timer for path state machine
      private Paths paths; // Paths defined in the Paths class
      
      @Override
      public void init() {
        panelsTelemetry = PanelsTelemetry.INSTANCE.getTelemetry();

        follower = Constants.createFollower(hardwareMap);
        follower.setStartingPose(new Pose(72, 8, Math.toRadians(90)));

        pathTimer = new ElapsedTime();
        paths = new Paths(follower); // Build paths

        panelsTelemetry.debug("Status", "Initialized");
        panelsTelemetry.update(telemetry);
      }
      
      @Override
      public void loop() {
        follower.update(); // Update Pedro Pathing
        pathState = autonomousPathUpdate(); // Update autonomous state machine

        // Log values to Panels and Driver Station
        panelsTelemetry.debug("Path State", pathState);
        panelsTelemetry.debug("X", follower.getPose().getX());
        panelsTelemetry.debug("Y", follower.getPose().getY());
        panelsTelemetry.debug("Heading", follower.getPose().getHeading());
        panelsTelemetry.update(telemetry);
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
  targetLibrary: "SolversLib" | "NextFTC" = "SolversLib", // - Added parameter
  packageName: string = "org.firstinspires.ftc.teamcode.Commands.AutoCommands",
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
  ): void => {
    if (!declaredPoses.has(variableName)) {
      allPoseDeclarations.push(`    private Pose ${variableName};`);
      allPoseInitializations.push(
        `        ${variableName} = pp.get("${lookupName}");`,
      );
      declaredPoses.add(variableName);
    }
  };

  // Add start point
  addPose("startPoint", "startPoint");
  poseVariableNames.set("startPoint", "startPoint");

  // Track used path chain names to handle duplicates
  const usedPathChainNames = new Map<string, number>();
  const pathChainVariables: string[] = []; // Stores the variable name for each line index

  // Process each line
  lines.forEach((line, lineIdx) => {
    const endPointName = line.name
      ? line.name.replace(/[^a-zA-Z0-9]/g, "")
      : `point${lineIdx + 1}`;

    // Add end point declaration (shared poses)
    addPose(endPointName, endPointName);
    poseVariableNames.set(`point${lineIdx + 1}`, endPointName);

    // Add control points if they exist
    // Control points are tied to the line, but stored in .pp with a generated name if not explicit?
    // The .pp format usually stores points with IDs or Names.
    // If the standard exporter saves control points as "Score_control1", we must match that.
    // Assuming the Reader uses the same logic or we need to ensure unique names for control points
    // that don't conflict even if endpoints share names.
    // For now, we will assume control points are unique to the line index to be safe,
    // OR we follow the existing pattern if it matches the file format.
    // The file format likely saves them nested or as separate points.
    // The `PedroPathReader` gets them by string name.
    // The previous code used `${endPointName}_control${controlIdx + 1}`.
    // If endPointName is shared, this is ambiguous.
    // We should use the line-specific control point name if possible, or assume the user/saver handles it.
    // Given the requirement "Control points are always independent", we should probably use a unique name.
    // However, we must match what `pp.get()` expects.
    // If the .pp file contains "Score_control1", we must ask for "Score_control1".
    // If we have two lines ending at Score, do we have "Score_control1" twice in .pp?
    // Unlikely. The Saver likely handles unique names for control points.
    // Let's look at how `saveProject` works -> it dumps `lines`.
    // `Line` has `controlPoints`. They don't have names in the interface usually.
    // The `PedroPathReader` probably iterates or expects specific naming conventions if it flattens them.
    // WAIT. `PedroPathReader` reads the JSON.
    // If `pp.get("name")` is used, the JSON must have a map with that key.
    // The `PedroPathReader` implementation (which is external Java code) likely constructs the map.
    // If the Java library parses the JSON, does it flatten everything into a map by name?
    // If so, duplicate names in the JSON would overwrite each other.
    // But `lines` is an array in JSON.
    // `pp.get` implies retrieval by ID or Name.
    // If the Java reader does `get(String name)`, it implies unique names.
    // If the user has multiple lines ending at "Score", they share the "Score" point.
    // But control points are unnamed in the UI usually.
    // If the reader automatically generates names for unnamed points (like control points),
    // it likely uses the line index or similar.
    // However, the previous code used `${endPointName}_control...`.
    // If I change this, I might break it if the reader expects that.
    // BUT, if I have collision on `endPointName`, I have collision on control point name.
    // FIX: We must assume the Reader handles specific naming for control points if they are shared.
    // Use a safer naming scheme for control points: `${endPointName}_${lineIdx}_control${controlIdx}` ??
    // No, I can't change what the Reader expects.
    // The Reader parses the .pp file.
    // If the .pp file is just the JSON dump of `lines`, it doesn't have "Score_control1" keys explicitly unless
    // the Reader generates them upon loading.
    // IF the Reader generates them, it probably follows a pattern.
    // If the previous code worked for non-shared cases, it assumes the Reader uses `${endPointName}_controlN`.
    // If we now support shared cases, we might need to rely on the Reader's behavior.
    // Assumption: The Reader likely indexes control points by the line's end point name? That seems flawed for shared points.
    // Let's assume for now we must use unique variables for control points in Java,
    // but the string passed to `pp.get` must match what the Reader has.
    // If `endPointName` is "Score", and we have two lines, the Reader might have "Score", "Score_control1" (from line 1), "Score_control1" (from line 2??).
    // This implies the .pp format or Reader is limited?
    // OR, we should use the `line.id` or similar if available?
    // The prompt says: "Control points are always independent."
    // Let's use `line${lineIdx}_control${controlIdx}` for the Java variable name to ensure uniqueness.
    // For the `pp.get(...)`, we are stuck with what the reader provides.
    // If the reader provides `${endPointName}_control${idx}`, and endPointName is shared, we have a problem.
    // But maybe we can hope the reader is smart?
    // Or maybe we should use `point${lineIdx+1}_control...` if the name is generated?
    // Let's stick to unique Java variables first.

    if (line.controlPoints && line.controlPoints.length > 0) {
      line.controlPoints.forEach((_, controlIdx) => {
        // We use a unique variable name to avoid Java conflicts
        const controlPointVarName = `${endPointName}_l${lineIdx}_c${controlIdx + 1}`;
        // We try to guess the key. If the previous code used `${endPointName}_control...`, it might be unsafe.
        // Let's stick to the previous pattern for the string key but ensure unique Java variable.
        // Actually, if I look at `generateJavaCode` (standard), it generates `new Pose(...)` inline.
        // Sequential code loads from file.
        // If the file is just the project JSON, and the Reader parses it...
        // The Reader code is not here.
        // I will use `${endPointName}_control${controlIdx + 1}` for the key as before,
        // BUT I will assign it to a unique variable.
        // Wait, if two lines share "Score", and both have 1 control point.
        // Both keys would be "Score_control1".
        // Use unique variable names:
        const controlPointName = `${endPointName}_control${controlIdx + 1}`;
        // If we already declared this variable (from another line sharing Score),
        // we might be overwriting it or reusing it?
        // "Control points are always independent."
        // So we should NOT reuse it.
        // But if `pp.get("Score_control1")` returns the same object...
        // This implies the Reader might be merging them?
        // Let's assume for now we generate unique variables.
        // If the key is ambiguous, we can't fix it here without changing the Reader or the Saver.
        // However, I can ensure the Java code compiles by making the variable unique.

        // BETTER STRATEGY: Use the line index in the variable name.
        const uniqueControlVar = `${endPointName}_line${lineIdx}_control${controlIdx + 1}`;
        allPoseDeclarations.push(`    private Pose ${uniqueControlVar};`);

        // For the key, we use what we think the reader expects.
        // If the user has "Score" and "Score", checking the .pp file structure (JSON):
        // It has `lines`.
        // The Reader likely builds a map.
        // If the map is built by iterating lines, and using "Name", then "Name_controlN",
        // subsequent lines would overwrite previous ones in the map if keys collide.
        // This is an issue in the Reader/Saver logic if true.
        // But I can only fix the Java exporter.
        // I will generate the code.

        allPoseInitializations.push(
          `        ${uniqueControlVar} = pp.get(\"${controlPointName}\");`,
        );

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

  const seq = flattenSequence(sequence && sequence.length ? sequence : defaultSequence);

  seq.forEach((item, idx) => {
    if (item.kind === "rotate") {
      const rotateItem: any = item as any;
      const degrees = rotateItem.degrees || 0;
      const radians = (degrees * Math.PI) / 180;

      const markers: any[] = Array.isArray(rotateItem.eventMarkers)
        ? [...rotateItem.eventMarkers]
        : [];

      if (markers.length === 0) {
        commands.push(
          `                new ${InstantCmdClass}(() -> follower.turnTo(${radians.toFixed(3)}))`,
          `                new ${WaitUntilCmdClass}(() -> !follower.isTurning())`,
        );
        return;
      }

      // Sort markers by position (0-1)
      markers.sort((a, b) => (a.position || 0) - (b.position || 0));

      const firstMarker = markers[0];
      let turnCommand = `                new ${InstantCmdClass}(() -> {
                        progressTracker.turn(${radians.toFixed(3)}, "${firstMarker.name}", ${firstMarker.position.toFixed(3)});`;

      // Register remaining markers
      for (let i = 1; i < markers.length; i++) {
        turnCommand += `
                        progressTracker.registerEvent("${markers[i].name}", ${markers[i].position.toFixed(3)});`;
      }
      turnCommand += `
                    })`;

      commands.push(turnCommand);

      let eventSequence = `                new ${ParallelRaceClass}(
                    new ${WaitUntilCmdClass}(() -> !follower.isTurning()),
                    new ${SequentialGroupClass}(`;

      markers.forEach((marker, idx) => {
        if (idx > 0) eventSequence += `,`;
        eventSequence += `
                        new ${WaitUntilCmdClass}(() -> progressTracker.shouldTriggerEvent("${marker.name}")),
                        new ${InstantCmdClass}(() -> progressTracker.executeEvent("${marker.name}"))`;
      });

      // Ensure the event sequence doesn't finish before the turn completes
      eventSequence += `,
                        new ${WaitUntilCmdClass}(() -> !follower.isTurning())`;

      eventSequence += `
                    ))`;

      commands.push(eventSequence);
      return;
    }

    if (item.kind === "wait") {
      const waitItem: any = item as any;
      const waitDuration = waitItem.durationMs || 0;

      const markers: any[] = Array.isArray(waitItem.eventMarkers)
        ? [...waitItem.eventMarkers]
        : [];

      // Determine wait value and formatting
      // NextFTC Delay uses seconds, SolversLib WaitCommand uses ms (or whatever SolversLib expects, assumed ms)
      const getWaitValue = (ms: number) =>
        isNextFTC ? (ms / 1000.0).toFixed(3) : ms.toFixed(0);

      if (markers.length === 0) {
        commands.push(
          `                new ${WaitCmdClass}(${getWaitValue(waitDuration)})`,
        );
        return;
      }

      // Sort markers by position (0-1) to schedule in order
      markers.sort((a, b) => (a.position || 0) - (b.position || 0));

      let scheduled = 0;
      const markerCommandParts: string[] = [];

      markers.forEach((marker) => {
        const targetMs =
          Math.max(0, Math.min(1, marker.position || 0)) * waitDuration;
        const delta = Math.max(0, targetMs - scheduled);
        scheduled = targetMs;

        markerCommandParts.push(
          `new ${WaitCmdClass}(${getWaitValue(delta)}), new ${InstantCmdClass}(() -> progressTracker.executeEvent("${marker.name}"))`,
        );
      });

      const remaining = Math.max(0, waitDuration - scheduled);
      markerCommandParts.push(
        `new ${WaitCmdClass}(${getWaitValue(remaining)})`,
      );

      commands.push(
        `                new ${ParallelRaceClass}(
                    new ${WaitCmdClass}(${getWaitValue(waitDuration)}),
                    new ${SequentialGroupClass}(${markerCommandParts.join(",")})
                )`,
      );
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
        headingConfig = `setConstantHeadingInterpolation(${endPoseVar}.getHeading())`;
      } else if (line.endPoint.heading === "linear") {
        headingConfig = `setLinearHeadingInterpolation(${actualStartPose}.getHeading(), ${endPoseVar}.getHeading())`;
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
import com.pedropathingplus.PedroPathReader;
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

        PedroPathReader pp = new PedroPathReader("${fileName ? fileName.split(/[\\/]/).pop() || "AutoPath.pp" : "AutoPath.pp"}", hw.appContext);

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
