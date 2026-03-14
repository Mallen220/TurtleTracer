// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import prettier from "prettier";
import prettierJavaPlugin from "prettier-plugin-java";
import type { Point, Line, BasePoint, SequenceItem } from "../types";
import { getCurvePoint, getLineStartHeading } from "./math";
import pkg from "../../package.json";
import { actionRegistry } from "../lib/actionRegistry";
import { toUser, toUserHeading, type CoordinateSystem } from "./coordinates";

/**
 * Generate Java code from path data
 */

const AUTO_GENERATED_FILE_WARNING_MESSAGE: string = `
/* ============================================================= *
 *        Turtle Tracer — Auto-Generated         *
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
  coordinateSystem: CoordinateSystem = "Pedro",
  codeUnits: "imperial" | "metric" = "imperial",
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

          let startCode, controlPointsCode, endCode, headingConfig;

          if (coordinateSystem === "FTC") {
            // Helper to format buildPose call
            const formatPose = (
              pt: { x: number; y: number },
              h: number = 0,
            ) => {
              const u = toUser(pt, "FTC");
              const uh = toUserHeading(h, "FTC");
              const px =
                codeUnits === "metric"
                  ? `cmToInches(${(u.x * 2.54).toFixed(3)})`
                  : u.x.toFixed(3);
              const py =
                codeUnits === "metric"
                  ? `cmToInches(${(u.y * 2.54).toFixed(3)})`
                  : u.y.toFixed(3);
              return `buildPose(${px}, ${py}, Math.toRadians(${uh.toFixed(3)}))`;
            };

            const startPt = idx === 0 ? startPoint : lines[idx - 1].endPoint;

            startCode = formatPose(startPt, 0);

            controlPointsCode =
              line.controlPoints.length > 0
                ? `${line.controlPoints
                    .map((point) => formatPose(point, 0))
                    .join(",\n")},`
                : "";

            endCode = formatPose(line.endPoint, 0);

            // Heading configurations
            if (line.endPoint.heading === "constant") {
              const uh = toUserHeading(line.endPoint.degrees || 0, "FTC");
              headingConfig = `Math.toRadians(${uh.toFixed(3)})`;
            } else if (line.endPoint.heading === "linear") {
              const uhStart = toUserHeading(line.endPoint.startDeg || 0, "FTC");
              const uhEnd = toUserHeading(line.endPoint.endDeg || 0, "FTC");
              headingConfig = `Math.toRadians(${uhStart.toFixed(3)}), Math.toRadians(${uhEnd.toFixed(3)})`;
            } else if (line.endPoint.heading === "facingPoint") {
              const uTarget = toUser(
                {
                  x: line.endPoint.targetX || 0,
                  y: line.endPoint.targetY || 0,
                },
                "FTC",
              );
              headingConfig = `new Pose(${uTarget.x.toFixed(3)}, ${uTarget.y.toFixed(3)})`;
            } else {
              headingConfig = "";
            }
          } else {
            // Standard Pedro (0-144)
            const startPt = idx === 0 ? startPoint : lines[idx - 1].endPoint;
            const sx =
              codeUnits === "metric"
                ? `cmToInches(${(startPt.x * 2.54).toFixed(3)})`
                : startPt.x.toFixed(3);
            const sy =
              codeUnits === "metric"
                ? `cmToInches(${(startPt.y * 2.54).toFixed(3)})`
                : startPt.y.toFixed(3);
            startCode = `new Pose(${sx}, ${sy})`;

            controlPointsCode =
              line.controlPoints.length > 0
                ? `${line.controlPoints
                    .map((point) => {
                      const px =
                        codeUnits === "metric"
                          ? `cmToInches(${(point.x * 2.54).toFixed(3)})`
                          : point.x.toFixed(3);
                      const py =
                        codeUnits === "metric"
                          ? `cmToInches(${(point.y * 2.54).toFixed(3)})`
                          : point.y.toFixed(3);
                      return `new Pose(${px}, ${py})`;
                    })
                    .join(",\n")},`
                : "";

            const ex =
              codeUnits === "metric"
                ? `cmToInches(${(line.endPoint.x * 2.54).toFixed(3)})`
                : line.endPoint.x.toFixed(3);
            const ey =
              codeUnits === "metric"
                ? `cmToInches(${(line.endPoint.y * 2.54).toFixed(3)})`
                : line.endPoint.y.toFixed(3);
            endCode = `new Pose(${ex}, ${ey})`;

            let hx = line.endPoint.targetX
              ? codeUnits === "metric"
                ? `cmToInches(${(line.endPoint.targetX * 2.54).toFixed(3)})`
                : line.endPoint.targetX.toFixed(3)
              : "0";
            let hy = line.endPoint.targetY
              ? codeUnits === "metric"
                ? `cmToInches(${(line.endPoint.targetY * 2.54).toFixed(3)})`
                : line.endPoint.targetY.toFixed(3)
              : "0";

            headingConfig =
              line.endPoint.heading === "constant"
                ? `Math.toRadians(${line.endPoint.degrees})`
                : line.endPoint.heading === "linear"
                  ? `Math.toRadians(${line.endPoint.startDeg}), Math.toRadians(${line.endPoint.endDeg})`
                  : line.endPoint.heading === "facingPoint"
                    ? `new Pose(${hx}, ${hy})`
                    : "";
          }

          const curveType =
            line.controlPoints.length === 0
              ? `new BezierLine`
              : `new BezierCurve`;

          let headingMethodCode = "";
          if (line.endPoint.reverse) {
            // Reversed: use setHeadingInterpolation(HeadingInterpolator.xxx).setReversed()
            if (line.endPoint.heading === "constant") {
              headingMethodCode = `.setHeadingInterpolation(HeadingInterpolator.constant(${headingConfig}))\n        .setReversed()`;
            } else if (line.endPoint.heading === "linear") {
              headingMethodCode = `.setHeadingInterpolation(HeadingInterpolator.linear(${headingConfig}))\n        .setReversed()`;
            } else if (line.endPoint.heading === "tangential") {
              // tangent is a field, not a method
              headingMethodCode = `.setHeadingInterpolation(HeadingInterpolator.tangent)\n        .setReversed()`;
            } else if (line.endPoint.heading === "facingPoint") {
              headingMethodCode = `.setHeadingInterpolation(HeadingInterpolator.facingPoint(${headingConfig}))\n        .setReversed()`;
            }
          } else {
            // No reverse: use shorthand setters
            if (line.endPoint.heading === "constant") {
              headingMethodCode = `.setConstantHeadingInterpolation(${headingConfig})`;
            } else if (line.endPoint.heading === "linear") {
              headingMethodCode = `.setLinearHeadingInterpolation(${headingConfig})`;
            } else if (line.endPoint.heading === "tangential") {
              headingMethodCode = `.setTangentHeadingInterpolation()`;
            } else if (line.endPoint.heading === "facingPoint") {
              headingMethodCode = `.setHeadingInterpolation(HeadingInterpolator.facingPoint(${headingConfig}))`;
            }
          }

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
            ${startCode},
            ${controlPointsCode}
            ${endCode}
          )
        )${headingMethodCode}${eventMarkerCode}
        .build();`;
        })
        .join("\n\n")}
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

    // compute heading used in exported Java before building the file template
    const startDegForExport = ((): number => {
      if (
        lines &&
        lines.length > 0 &&
        lines[0].endPoint.heading === "tangential"
      ) {
        return getLineStartHeading(lines[0], startPoint);
      }

      if (
        startPoint.heading === "constant" &&
        typeof (startPoint as any).degrees === "number"
      ) {
        return (startPoint as any).degrees;
      }

      if (lines && lines.length > 0) {
        return getLineStartHeading(lines[0], startPoint);
      }

      if (
        startPoint.heading === "linear" &&
        typeof (startPoint as any).startDeg === "number"
      ) {
        return (startPoint as any).startDeg;
      }

      return (startPoint as any).degrees ?? 90;
    })();

    file = `
    ${AUTO_GENERATED_FILE_WARNING_MESSAGE}

    package ${packageName};
    import com.qualcomm.robotcore.eventloop.opmode.OpMode;
    import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
    import com.qualcomm.robotcore.util.ElapsedTime;
    import com.pedropathing.ftc.InvertedFTCCoordinates;
    import com.pedropathing.geometry.PedroCoordinates;
    import org.firstinspires.ftc.teamcode.pedroPathing.PedroConstants;
    import com.pedropathing.ftc.PoseConverter;
    ${extraImports}
    import com.pedropathing.geometry.BezierCurve;
    import com.pedropathing.geometry.BezierLine;
    import com.pedropathing.follower.Follower;
    import com.pedropathing.paths.PathChain;
    import com.pedropathing.geometry.Pose;
    import com.pedropathing.paths.HeadingInterpolator;
    ${eventMarkerNames.size > 0 ? "import com.pedropathing.NamedCommands;" : ""}
    
    @Autonomous(name = "Turtle Tracer Autonomous", group = "Autonomous")
    ${classAnnotations}
    public class TurtleTracerAutonomous extends OpMode {
      ${telemetryField}
      public Follower follower; // Pathing follower instance
      private int pathState; // Current autonomous path state (state machine)
      private ElapsedTime pathTimer; // Timer for path state machine
      private Paths paths; // Paths defined in the Paths class
      
      @Override
      public void init() {
        ${telemetryInit}

        follower = PedroConstants.createFollower(hardwareMap);
        // Determine starting heading: prefer geometric heading when a path exists, otherwise fall back to explicit startPoint values
        ${
          coordinateSystem === "FTC"
            ? (() => {
                const uStart = toUser(startPoint, "FTC");
                const uHead = toUserHeading(startDegForExport, "FTC");
                const px =
                  codeUnits === "metric"
                    ? `cmToInches(${(uStart.x * 2.54).toFixed(3)})`
                    : uStart.x.toFixed(3);
                const py =
                  codeUnits === "metric"
                    ? `cmToInches(${(uStart.y * 2.54).toFixed(3)})`
                    : uStart.y.toFixed(3);
                return `follower.setStartingPose(new Paths(follower).buildPose(${px}, ${py}, Math.toRadians(${uHead.toFixed(3)})));`;
              })()
            : (() => {
                const px =
                  codeUnits === "metric"
                    ? `cmToInches(${(startPoint.x * 2.54).toFixed(3)})`
                    : startPoint.x.toFixed(3);
                const py =
                  codeUnits === "metric"
                    ? `cmToInches(${(startPoint.y * 2.54).toFixed(3)})`
                    : startPoint.y.toFixed(3);
                return `follower.setStartingPose(new Pose(${px}, ${py}, Math.toRadians(${startDegForExport.toFixed(3)})));`;
              })()
        }

        pathTimer = new ElapsedTime();
        paths = new Paths(follower); // Build paths
      }
      
      @Override
      public void loop() {
        follower.update(); // Update follower
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
export function generatePointsArray(
  startPoint: Point,
  lines: Line[],
  codeUnits: "imperial" | "metric" = "imperial",
): string {
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
      let xVal = point.x;
      let yVal = point.y;
      if (codeUnits === "metric") {
        xVal *= 2.54;
        yVal *= 2.54;
      }
      const x = Number.isInteger(xVal) ? xVal.toFixed(1) : xVal.toFixed(3);
      const y = Number.isInteger(yVal) ? yVal.toFixed(1) : yVal.toFixed(3);
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
  coordinateSystem: CoordinateSystem = "Pedro",
  codeUnits: "imperial" | "metric" = "imperial",
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

    const pathName = pathChainVariables[lineIdx];
    const pathDisplayName = pathName;

    // Construct FollowPath instantiation
    const followPathInstance = isNextFTC
      ? `new ${FollowPathCmdClass}(${pathName})`
      : `new ${FollowPathCmdClass}(follower, ${pathName})`;

    if (isNextFTC) {
      commands.push(followPathInstance);
    } else {
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
          controlPoints.push(
            `new Pose(${cp.x.toFixed(3)}, ${cp.y.toFixed(3)})`,
          );
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
        ? "\n                .setReversed()"
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
    : `PedroPathReader pp = new PedroPathReader("${fileName ? fileName.split(/[\\/]/).pop() + ".pp" || "AutoPath.pp" : "AutoPath.pp"}", hw.appContext);`;

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
