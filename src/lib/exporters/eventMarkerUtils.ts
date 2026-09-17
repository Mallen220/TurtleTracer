// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { EventMarker, Line } from "../../types/index";
import {
  toUser,
  toUserHeading,
  type CoordinateSystem,
} from "../../utils/coordinates";

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
            const px =
              codeUnits === "metric"
                ? `cmToInches(${(u.x * 2.54).toFixed(3)})`
                : u.x.toFixed(3);
            const py =
              codeUnits === "metric"
                ? `cmToInches(${(u.y * 2.54).toFixed(3)})`
                : u.y.toFixed(3);
            poseArg = `buildPose(${px}, ${py}, ${uh.toFixed(3)})`;
          } else {
            const px =
              codeUnits === "metric"
                ? `cmToInches(${((event.poseX ?? 0) * 2.54).toFixed(3)})`
                : (event.poseX ?? 0).toFixed(3);
            const py =
              codeUnits === "metric"
                ? `cmToInches(${((event.poseY ?? 0) * 2.54).toFixed(3)})`
                : (event.poseY ?? 0).toFixed(3);
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

/**
 * @deprecated Event methods are no longer chainable on PedroPathing 3.0.0 Path objects.
 */
export function generateEventMarkerCode(
  eventMarkers: EventMarker[] | undefined,
  indent: string,
  _pathPoints?: { x: number; y: number }[],
  _segmentIndex?: number,
  _totalSegments?: number,
): string {
  let eventMarkerCode = "";
  if (eventMarkers && eventMarkers.length > 0) {
    eventMarkers.forEach((event) => {
      const type = event.type || "parametric";
      if (type === "parametric") {
        eventMarkerCode += `\n${indent}.onParametric(${event.position.toFixed(3)}, NamedCommands.getCommand("${event.name}"))`;
      } else if (type === "temporal") {
        eventMarkerCode += `\n${indent}.onTemporal(${event.time ?? 500}, NamedCommands.getCommand("${event.name}"))`;
      } else if (type === "pose") {
        const px = (event.poseX ?? 0).toFixed(3);
        const py = (event.poseY ?? 0).toFixed(3);
        const ph = (event.poseHeading ?? 0).toFixed(3);
        const radius = (event as any).radius ?? 2;
        const radiusStr =
          typeof radius === "number" ? radius.toFixed(1) : radius;
        const poseArg = `new Pose(${px}, ${py}, Math.toRadians(${ph}))`;
        eventMarkerCode += `\n${indent}.onSpatial(${poseArg}, ${radiusStr}, NamedCommands.getCommand("${event.name}"))`;
      }
    });
  }
  return eventMarkerCode;
}
