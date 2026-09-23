// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import prettier from "prettier";
import prettierJavaPlugin from "prettier-plugin-java";
import type { Point, Line, SequenceItem, TurtleData } from "../../types";
import { getLineStartHeading } from "../../utils/math";
import pkg from "../../../package.json";
import { actionRegistry } from "../../lib/actionRegistry";
import { generateTrackerEventRegistrationCode } from "./eventMarkerUtils";
import {
  toUser,
  toUserHeading,
  type CoordinateSystem,
} from "../../utils/coordinates";

import { exporterRegistry } from "./index";

/**
 * Generate Java code from path data
 */

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

  const pathChainNames: string[] = [];
  const usedPathNames = new Map<string, number>();

  // First pass: generate unique variable names for all lines
  lines.forEach((line, idx) => {
    let baseName = line.name
      ? line.name.replaceAll(/[^a-zA-Z0-9]/g, "")
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
    private static final PoseFactory p = PoseFactory.degrees();
    ${pathChainNames
      .map((variableName, idx) => {
        if (lines[idx].isChain) return "";
        return `public Path ${variableName};`;
      })
      .filter(Boolean)
      .join("\n")}

    public Paths(Follower follower) {
      ${(() => {
        const pathData = lines.map((line, idx) => {
          const variableName = pathChainNames[idx];

          let startCode, controlPointsCode, endCode;

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
              return `buildPose(${px}, ${py}, ${uh.toFixed(3)})`;
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
            startCode = `p.of(${sx}, ${sy}, 0.0)`;

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
                      return `p.of(${px}, ${py}, 0.0)`;
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
            endCode = `p.of(${ex}, ${ey}, 0.0)`;
          }

          const pathCall =
            line.controlPoints.length === 0
              ? `line(\n          ${startCode},\n          ${endCode}\n        )`
              : `curve(\n          ${startCode},\n          ${controlPointsCode}${endCode}\n        )`;

          let headingMethodCode = "";
          let globalHeadingCode = "";

          const generateInterpolatorString = (pointDef: any) => {
            let config = "";
            if (coordinateSystem === "FTC") {
              if (pointDef.heading === "constant") {
                const uh = toUserHeading(pointDef.degrees || 0, "FTC");
                config = `Math.toRadians(${uh.toFixed(3)})`;
              } else if (pointDef.heading === "linear") {
                const uhStart = toUserHeading(pointDef.startDeg || 0, "FTC");
                const uhEnd = toUserHeading(pointDef.endDeg || 0, "FTC");
                config = `Math.toRadians(${uhStart.toFixed(3)}), Math.toRadians(${uhEnd.toFixed(3)})`;
              } else if (pointDef.heading === "facingPoint") {
                const uTarget = toUser(
                  { x: pointDef.targetX || 0, y: pointDef.targetY || 0 },
                  "FTC",
                );
                config = `p.of(${uTarget.x.toFixed(3)}, ${uTarget.y.toFixed(3)}, 0.0)`;
              }
            } else if (pointDef.heading === "constant") {
              config = `Math.toRadians(${pointDef.degrees || 0})`;
            } else if (pointDef.heading === "linear") {
              config = `Math.toRadians(${pointDef.startDeg || 0}), Math.toRadians(${pointDef.endDeg || 0})`;
            } else if (pointDef.heading === "facingPoint") {
              const hx =
                codeUnits === "metric"
                  ? `cmToInches(${((pointDef.targetX || 0) * 2.54).toFixed(3)})`
                  : (pointDef.targetX || 0).toFixed(3);
              const hy =
                codeUnits === "metric"
                  ? `cmToInches(${((pointDef.targetY || 0) * 2.54).toFixed(3)})`
                  : (pointDef.targetY || 0).toFixed(3);
              config = `p.of(${hx}, ${hy}, 0.0)`;
            }

            let baseName = "";
            if (pointDef.heading === "constant") {
              baseName = `Interpolator.constant(${config})`;
            } else if (pointDef.heading === "linear") {
              baseName = `Interpolator.linear(${config})`;
            } else if (pointDef.heading === "tangential") {
              baseName = `Interpolator.tangent`;
            } else if (pointDef.heading === "facingPoint") {
              baseName = `Interpolator.facingPoint(${config})`;
            }

            if (pointDef.reverse) {
              if (pointDef.heading === "tangential")
                return "Interpolator.tangent.reverse()";
              if (pointDef.heading === "linear")
                return `Interpolator.linear(${config}).reverse()`;
              if (pointDef.heading === "constant")
                return `Interpolator.constant(${config}).reverse()`;
              if (pointDef.heading === "facingPoint")
                return `Interpolator.facingPoint(${config}).reverse()`;
            }
            return baseName;
          };

          const constructHeadingMethod = (targetConfig: any) => {
            if (targetConfig.heading === "piecewise") {
              const segs = targetConfig.segments || [];
              if (segs.length === 0) {
                return ".tangent()";
              }
              const segmentsStr = segs
                .map((seg: any) => {
                  const interpStr = generateInterpolatorString(seg);
                  return `.until(${seg.tEnd}, ${interpStr})`;
                })
                .join("\n          ");
              if (targetConfig.reverse) {
                return `.heading(Interpolator.piecewise()\n          ${segmentsStr}\n          .reverse())`;
              }
              return `.heading(Interpolator.piecewise()\n          ${segmentsStr}\n        )`;
            }

            let hConfig = generateInterpolatorString(targetConfig);
            let args = "";
            if (hConfig.includes("(") && !hConfig.endsWith(".reverse()")) {
              args = hConfig.slice(
                hConfig.indexOf("(") + 1,
                hConfig.lastIndexOf(")"),
              );
            }

            if (targetConfig.reverse) {
              if (targetConfig.heading === "constant") {
                return `.heading(${hConfig})`;
              } else if (targetConfig.heading === "linear") {
                return `.heading(${hConfig})`;
              } else if (targetConfig.heading === "tangential") {
                return `.reverseTangent()`;
              } else if (targetConfig.heading === "facingPoint") {
                return `.heading(${hConfig})`;
              }
            } else if (targetConfig.heading === "constant") {
              return `.constant(${args})`;
            } else if (targetConfig.heading === "linear") {
              return `.linear(${args})`;
            } else if (targetConfig.heading === "tangential") {
              return `.tangent()`;
            } else if (targetConfig.heading === "facingPoint") {
              return `.facingPoint(${args})`;
            }
            return "";
          };

          let hasGlobalHeading = false;
          let tempIdx = idx;
          let rootLine = line;
          while (rootLine.isChain && tempIdx > 0) {
            tempIdx--;
            rootLine = lines[tempIdx];
          }
          if (
            rootLine.globalHeading &&
            rootLine.globalHeading !== ("none" as any)
          ) {
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
              globalHeadingCode = `\n        ${constructHeadingMethod(globalConfig)}`;
            }
          }

          if (!hasGlobalHeading) {
            headingMethodCode = constructHeadingMethod(line.endPoint);
          }

          return {
            line,
            variableName,
            pathCall,
            headingMethodCode,
            globalHeadingCode,
          };
        });

        // Consolidate chained paths
        const consolidatedBlocks: string[] = [];
        let i = 0;
        while (i < pathData.length) {
          const rootPd = pathData[i];
          const chainMembers = [rootPd];
          let j = i + 1;
          while (j < pathData.length && pathData[j].line.isChain) {
            chainMembers.push(pathData[j]);
            j++;
          }

          if (chainMembers.length === 1) {
            consolidatedBlocks.push(
              `${rootPd.variableName} = ${rootPd.pathCall}${rootPd.headingMethodCode};`,
            );
          } else {
            const childCalls = chainMembers.map((m) => {
              return `        ${m.pathCall}${m.headingMethodCode}`;
            });
            consolidatedBlocks.push(
              `${rootPd.variableName} = path(\n${childCalls.join(",\n")}\n      )${rootPd.globalHeadingCode};`,
            );
          }

          i = j;
        }

        return consolidatedBlocks.join("\n\n      ");
      })()}
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

  // Add NamedCommands registration instructions
  let namedCommandsSection = "";

  const hasEventMarkers = lines.some(
    (line) => line.eventMarkers && line.eventMarkers.length > 0,
  );

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
    if (action?.toJavaCode) {
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

      const idx = lineIndex === -1 ? -1 : lineIndex;

      if (idx === -1) {
        stateMachineCode += `\n          setPathState(${stateStep + 1});`;
        stateMachineCode += `\n          break;`;
        stateStep += 1;
      } else {
        const line = lines[idx];
        if (line.isChain) {
          // Chained paths don't get their own follow command in the state machine,
          // they are executed as part of the root chain path before them.
          stateMachineCode += `\n          // Handled by previous chained path`;
          stateMachineCode += `\n          setPathState(${stateStep + 1});`;
          stateMachineCode += `\n          break;`;
          stateStep += 1;
        } else {
          stateMachineCode += `\n          follower.follow(paths.${pathChainNames[idx]});`;
          if (hasEventMarkers) {
            stateMachineCode += `\n          tracker.setCurrentPath(paths.${pathChainNames[idx]});`;
          }
          stateMachineCode += `\n          setPathState(${stateStep + 1});`;
          stateMachineCode += `\n          break;`;

          stateMachineCode += `\n        case ${stateStep + 1}:`;
          stateMachineCode += `\n          if(!follower.isBusy()) {`;
          stateMachineCode += `\n            setPathState(${stateStep + 2});`;
          stateMachineCode += `\n          }`;
          stateMachineCode += `\n          break;`;
          stateStep += 2;
        }
      }
    }
  });

  stateMachineCode += `\n        case ${stateStep}:`;
  stateMachineCode += `\n          requestOpModeStop();`;
  stateMachineCode += `\n          pathState = -1;`;
  stateMachineCode += `\n          break;`;

  let file = "";
  if (exportFullCode) {
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

    const namedCommandsImport = hasEventMarkers
      ? "import com.turtletracerlib.pathing.NamedCommands;\nimport com.turtletracerlib.pathing.ProgressTracker;\n"
      : "";

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
        panelsTelemetry.debug("X", follower.pose().x());
        panelsTelemetry.debug("Y", follower.pose().y());
        panelsTelemetry.debug("Heading", follower.pose().heading());
        panelsTelemetry.update(telemetry);`;
    } else if (telemetryImpl === "Dashboard") {
      telemetryLoop = `
        // Log values to Dashboard and Driver Station
        telemetryA.addData("Path State", pathState);
        telemetryA.addData("X", follower.pose().x());
        telemetryA.addData("Y", follower.pose().y());
        telemetryA.addData("Heading", follower.pose().heading());
        telemetryA.update();`;
    } else if (telemetryImpl === "Standard") {
      telemetryLoop = `
        // Log values to Driver Station
        telemetry.addData("Path State", pathState);
        telemetry.addData("X", follower.pose().x());
        telemetry.addData("Y", follower.pose().y());
        telemetry.addData("Heading", follower.pose().heading());
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
    import org.firstinspires.ftc.teamcode.pedroPathing.PedroConstants;
    ${namedCommandsImport}${extraImports}
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
      ${telemetryField}
      public Follower follower; // Pathing follower instance
      private final PoseFactory p = PoseFactory.degrees();
      ${hasEventMarkers ? "private ProgressTracker tracker; // Progress tracker instance for event markers\n      " : ""}private int pathState; // Current autonomous path state (state machine)
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
                return `follower.setPose(buildPose(${px}, ${py}, ${uHead.toFixed(3)}));`;
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
                return `follower.setPose(p.of(${px}, ${py}, ${startDegForExport.toFixed(3)}));`;
              })()
        }

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

        ${telemetryLoop}
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
  } else {
    file =
      AUTO_GENERATED_FILE_WARNING_MESSAGE + pathsClass + namedCommandsSection;
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
