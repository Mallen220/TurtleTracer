// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Line } from "../../types/index";
import {
  toUser,
  toUserHeading,
  type CoordinateSystem,
} from "../../utils/coordinates";
import { javaLength } from "./javaFormat";

export function generateTrackerEventRegistrationCode(
  lines: Line[],
  indent: string = "        ",
  coordinateSystem: CoordinateSystem = "Pedro",
  codeUnits: "imperial" | "metric" = "imperial",
): string {
  let code = "";
  lines.forEach((line) => {
    if (line.eventMarkers && line.eventMarkers.length > 0) {
      line.eventMarkers.forEach((event) => {
        const type = event.type || "parametric";
        if (type === "parametric") {
          code += `\n${indent}tracker.onParametric(${event.position.toFixed(3)}, NamedCommands.getCommand("${event.name}"));`;
        } else if (type === "temporal") {
          code += `\n${indent}tracker.onTemporal(${event.time ?? 500}, NamedCommands.getCommand("${event.name}"));`;
        } else if (type === "pose") {
          let poseArg: string;
          if (coordinateSystem === "FTC") {
            const u = toUser(
              { x: event.poseX ?? 0, y: event.poseY ?? 0 },
              "FTC",
            );
            const uh = toUserHeading(event.poseHeading ?? 0, "FTC");
            const px = javaLength(u.x, codeUnits);
            const py = javaLength(u.y, codeUnits);
            poseArg = `buildPose(${px}, ${py}, ${uh.toFixed(3)})`;
          } else {
            const px = javaLength(event.poseX ?? 0, codeUnits);
            const py = javaLength(event.poseY ?? 0, codeUnits);
            poseArg = `p.of(${px}, ${py}, ${(event.poseHeading ?? 0).toFixed(3)})`;
          }
          const radius = (event as any).radius ?? 2;
          const radiusStr =
            typeof radius === "number" ? radius.toFixed(1) : radius;
          code += `\n${indent}tracker.onSpatial(${poseArg}, ${radiusStr}, NamedCommands.getCommand("${event.name}"));`;
        }
      });
    }
  });
  return code;
}

export function getUniqueEventMarkerNames(lines: Line[]): string[] {
  const names: string[] = [];
  lines.forEach((line) => {
    line.eventMarkers?.forEach((m) => {
      if (m.name && !names.includes(m.name)) {
        names.push(m.name);
      }
    });
  });
  return names;
}
