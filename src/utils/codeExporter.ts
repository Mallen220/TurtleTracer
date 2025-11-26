import prettier from "prettier";
import prettierJavaPlugin from "prettier-plugin-java";
import type { Point, Line, BasePoint } from "../types";
import { getCurvePoint } from "./math";

/**
 * Generate Java code from path data
 */
export async function generateJavaCode(
  startPoint: Point,
  lines: Line[],
  exportFullCode: boolean
): Promise<string> {
  const headingTypeToFunctionName = {
    constant: "setConstantHeadingInterpolation",
    linear: "setLinearHeadingInterpolation",
    tangential: "setTangentHeadingInterpolation",
  };

  let pathsClass = `
  public static class Paths {
    ${lines.map((line, idx) => {
      const variableName = line.name ? line.name.replace(/[^a-zA-Z0-9]/g, '') : `line${idx + 1}`;
      return `public PathChain ${variableName};`
    }).join("\n")}
    
    public Paths(Follower follower) {
      ${lines.map((line, idx) => {
        const variableName = line.name ? line.name.replace(/[^a-zA-Z0-9]/g, '') : `line${idx + 1}`;
        const start = idx === 0 
          ? `new Pose(${startPoint.x.toFixed(3)}, ${startPoint.y.toFixed(3)})`
          : `new Pose(${lines[idx - 1].endPoint.x.toFixed(3)}, ${lines[idx - 1].endPoint.y.toFixed(3)})`;
        
        const controlPoints = line.controlPoints.length > 0
          ? `${line.controlPoints
              .map(point => `new Pose(${point.x.toFixed(3)}, ${point.y.toFixed(3)})`)
              .join(",\n")},`
          : "";
        
        const curveType = line.controlPoints.length === 0 ? `new BezierLine` : `new BezierCurve`;
        
        const headingConfig = line.endPoint.heading === "constant" 
          ? `Math.toRadians(${line.endPoint.degrees})`
          : line.endPoint.heading === "linear" 
            ? `Math.toRadians(${line.endPoint.startDeg}), Math.toRadians(${line.endPoint.endDeg})`
            : "";
        
        const reverseConfig = line.endPoint.reverse ? ".setReversed(true)" : "";
        
        return `${variableName} = follower.pathBuilder().addPath(
          ${curveType}(
            ${start},
            ${controlPoints}
            new Pose(${line.endPoint.x.toFixed(3)}, ${line.endPoint.y.toFixed(3)})
          )
        ).${headingTypeToFunctionName[line.endPoint.heading]}(${headingConfig})
        ${reverseConfig}
        .build();`;
      }).join("\n\n")}
    }
  }
  `;

  let file = '';
  if (!exportFullCode) {
    file = pathsClass;
  } else {
    file = `
    package org.firstinspires.ftc.teamcode;
    import com.qualcomm.robotcore.eventloop.opmode.OpMode;
    import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
    import com.bylazar.configurables.annotations.Configurable;
    import com.bylazar.telemetry.TelemetryManager;
    import com.bylazar.telemetry.PanelsTelemetry;
    import org.firstinspires.ftc.teamcode.pedroPathing.Constants;
    import com.pedropathing.geometry.BezierCurve;
    import com.pedropathing.geometry.BezierLine;
    import com.pedropathing.follower.Follower;
    import com.pedropathing.paths.PathChain;
    import com.pedropathing.geometry.Pose;
    
    @Autonomous(name = "Pedro Pathing Autonomous", group = "Autonomous")
    @Configurable // Panels
    public class PedroAutonomous extends OpMode {
      private TelemetryManager panelsTelemetry; // Panels Telemetry instance
      public Follower follower; // Pedro Pathing follower instance
      private int pathState; // Current autonomous path state (state machine)
      private Paths paths; // Paths defined in the Paths class
      
      @Override
      public void init() {
        panelsTelemetry = PanelsTelemetry.INSTANCE.getTelemetry();

        follower = Constants.createFollower(hardwareMap);
        follower.setStartingPose(new Pose(72, 8, Math.toRadians(90)));

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
          // Add your state machine Here
          // Access paths with paths.pathName
          // Refer to the Pedro Pathing Docs (Auto Example) for an example state machine
          return pathState;
      }
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
  lines: Line[]
): string {
  const points: BasePoint[] = [];
  
  // Add start point
  points.push(startPoint);
  
  // Add all waypoints (end points and control points)
  lines.forEach((line) => {
    // Add control points for this line
    line.controlPoints.forEach(controlPoint => {
      points.push(controlPoint);
    });
    
    // Add end point of this line
    points.push(line.endPoint);
  });
  
  // Format as string array, removing decimal places for whole numbers
  const pointsString = points.map(point => {
    const x = Number.isInteger(point.x) ? point.x.toFixed(1) : point.x.toFixed(3);
    const y = Number.isInteger(point.y) ? point.y.toFixed(1) : point.y.toFixed(3);
    return `(${x}, ${y})`;
  }).join(", ");
  
  return `[${pointsString}]`;
}

/**
 * Generate Sequential Command code
 */
export async function generateSequentialCommandCode(
  startPoint: Point,
  lines: Line[],
  fileName: string | null = null
): Promise<string> {
  // Determine class name from file name or use default
  let className = "AutoPath";
  if (fileName) {
    // Extract file name without extension and replace spaces with underscores
    const baseName = fileName.split(/[\\/]/).pop() || "";
    className = baseName.replace('.pp', '').replace(/[^a-zA-Z0-9]/g, '_');
    if (!className) className = "AutoPath";
  }

  // Generate pose declarations without initialization
  const allPoses: string[] = [];
  
  // Add start point
  allPoses.push('  private Pose startPoint;');
  
  // Add end points
  lines.forEach((line, idx) => {
    const endPointName = line.name ? line.name.replace(/[^a-zA-Z0-9]/g, '') : `point${idx + 1}`;
    allPoses.push(`  private Pose ${endPointName};`);
  });

  // Generate path chain declarations using FirstPointTOLastPoint naming
  const pathChainDeclarations = lines.map((line, idx) => {
    const startPoseName = idx === 0 ? "startPoint" : (lines[idx - 1].name ? lines[idx - 1].name.replace(/[^a-zA-Z0-9]/g, '') : `point${idx}`);
    const endPoseName = line.name ? line.name.replace(/[^a-zA-Z0-9]/g, '') : `point${idx + 1}`;
    const pathName = `${startPoseName}TO${endPoseName}`;
    return `  private PathChain ${pathName};`;
  }).join("\n");

  // Generate addCommands calls using FirstPointTOLastPoint naming
  const addCommandsCalls = lines.map((line, idx) => {
    const startPoseName = idx === 0 ? "startPoint" : (lines[idx - 1].name ? lines[idx - 1].name.replace(/[^a-zA-Z0-9]/g, '') : `point${idx}`);
    const endPoseName = line.name ? line.name.replace(/[^a-zA-Z0-9]/g, '') : `point${idx + 1}`;
    const pathName = `${startPoseName}TO${endPoseName}`;
    return `        new FollowPathCommand(follower, ${pathName})`;
  }).join(",\n");

  // Generate buildPaths method using FirstPointTOLastPoint naming
  const pathBuilders = lines.map((line, idx) => {
    const startPoseName = idx === 0 ? "startPoint" : (lines[idx - 1].name ? lines[idx - 1].name.replace(/[^a-zA-Z0-9]/g, '') : `point${idx}`);
    const endPoseName = line.name ? line.name.replace(/[^a-zA-Z0-9]/g, '') : `point${idx + 1}`;
    const pathName = `${startPoseName}TO${endPoseName}`;
    
    const isCurve = line.controlPoints.length > 0;
    const curveType = isCurve ? "BezierCurve" : "BezierLine";
    
    // Build control point names for this path
    const controlPointNames = line.controlPoints.map((_, cpIdx) => 
      `${endPoseName}_control${cpIdx + 1}`
    );
    
    const curvePoints = isCurve 
      ? [startPoseName, ...controlPointNames, endPoseName].join(", ")
      : `${startPoseName}, ${endPoseName}`;
    
    const headingType = line.endPoint.heading === "constant" 
      ? `setConstantHeadingInterpolation(${endPoseName}.getHeading())`
      : line.endPoint.heading === "linear"
        ? `setLinearHeadingInterpolation(${startPoseName}.getHeading(), ${endPoseName}.getHeading())`
        : `setTangentHeadingInterpolation()`;
    
    return `    ${pathName} =
        follower
            .pathBuilder()
            .addPath(new ${curveType}(${curvePoints}))
            .${headingType}
            .build();`;
  }).join("\n\n");

  // Generate pose assignments in constructor
  const poseAssignments: string[] = [];
  poseAssignments.push('    startPoint = pp.get("startPoint");');
  lines.forEach((line, idx) => {
    const endPointName = line.name ? line.name.replace(/[^a-zA-Z0-9]/g, '') : `point${idx + 1}`;
    poseAssignments.push(`    ${endPointName} = pp.get("${endPointName}");`);
  });

  const sequentialCommandCode = `
package org.firstinspires.ftc.teamcode.Commands.AutoCommands;

import com.pedropathing.follower.Follower;
import com.pedropathing.geometry.BezierCurve;
import com.pedropathing.geometry.BezierLine;
import com.pedropathing.geometry.Pose;
import com.pedropathing.paths.PathChain;
import com.qualcomm.robotcore.hardware.HardwareMap;
import com.seattlesolvers.solverslib.command.SequentialCommandGroup;
import com.seattlesolvers.solverslib.pedroCommand.FollowPathCommand;
import java.io.IOException;
import org.firstinspires.ftc.teamcode.Subsystems.Drivetrain;
import org.firstinspires.ftc.teamcode.Utils.PedroPathReader;

public class ${className} extends SequentialCommandGroup {

  private final Follower follower;

  // Poses
${allPoses.join("\n")}

  // Path chains
${pathChainDeclarations}

  public ${className}(final Drivetrain drive, HardwareMap hw) throws IOException {
    this.follower = drive.getFollower();

    PedroPathReader pp = new PedroPathReader("${fileName ? fileName.split(/[\\/]/).pop() + '.pp' || 'AutoPath.pp' : 'AutoPath.pp'}", hw.appContext);

${poseAssignments.join("\n")}

    follower.setStartingPose(startPoint);

    buildPaths();

    addCommands(
${addCommandsCalls});
  }

  public void buildPaths() {
${pathBuilders}

    /*
    -----PATHS TEMPLATE-----
    LINEAR PATH:
    pathName =
        follower
            .pathBuilder()
            .addPath(new BezierLine(firstPose, secondPose))
            .setLinearHeadingInterpolation(firstPose.getHeading(), secondPose.getHeading())
            .build();

    TANGENTIAL PATH:
    pathName =
        follower
            .pathBuilder()
            .addPath(new BezierLine(firstPose, secondPose))
            .setTangentHeadingInterpolation()
            .build();

    CURVE PATH:
    pathName =
        follower
            .pathBuilder()
            .addPath(new BezierCurve(firstPose, curveControlPoint, secondPose))
            .setLinearHeadingInterpolation(firstPose.getHeading(), secondPose.getHeading())
            .build();
     */
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