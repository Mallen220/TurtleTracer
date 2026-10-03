// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Line } from "../../types/index";
import {
  toUser,
  toUserHeading,
  type CoordinateSystem,
} from "../../utils/coordinates";
import { javaLength } from "./javaFormat";

/** The line at `rootIdx` and the lines chained after it, in follow order. */
function chainOf(lines: Line[], rootIdx: number): Line[] {
  const chain = [lines[rootIdx]];
  for (let i = rootIdx + 1; i < lines.length && lines[i].isChain; i++) {
    chain.push(lines[i]);
  }
  return chain;
}

/** Whether any line of the chain starting at `rootIdx` has event markers. */
export function chainHasEventMarkers(lines: Line[], rootIdx: number): boolean {
  return chainOf(lines, rootIdx).some((line) => line.eventMarkers?.length);
}

export type MarkerCodeOptions = {
  indent?: string;
  coordinateSystem?: CoordinateSystem;
  codeUnits?: "imperial" | "metric";
  /** Read the markers from the project file at runtime instead of writing them out. */
  fromReader?: boolean;
};

/**
 * Statements that register the event markers of the chain starting at
 * `rootIdx` with the `tracker` variable, one per line. A tracker only knows
 * about one path at a time, so these are emitted just before that path is
 * followed (after tracker.clearPathEvents()); registering every path's markers
 * up front would trigger them all during whichever path is running.
 *
 * Each marker is tied to its line's segment in the chain, since the follower
 * reports progress per segment.
 */
export function chainMarkerRegistrationCode(
  lines: Line[],
  rootIdx: number,
  {
    indent = "        ",
    coordinateSystem = "Pedro",
    codeUnits = "imperial",
    fromReader = false,
  }: MarkerCodeOptions = {},
): string {
  let code = "";
  chainOf(lines, rootIdx).forEach((line, segment) => {
    if (!line.eventMarkers?.length) return;

    if (fromReader) {
      code += `\n${indent}pp.registerLineEvents(tracker, ${rootIdx + segment}, ${segment});`;
      return;
    }

    line.eventMarkers.forEach((event) => {
      const type = event.type || "parametric";
      const action = `NamedCommands.getCommand("${event.name}")`;
      if (type === "parametric") {
        code += `\n${indent}tracker.onParametric(${segment}, ${event.position.toFixed(3)}, ${action});`;
      } else if (type === "temporal") {
        // Same fallback the project file reader uses.
        const timeMs =
          event.time && event.time > 0 ? event.time : (event.endTime ?? 500);
        code += `\n${indent}tracker.onTemporal(${timeMs}, ${action});`;
      } else if (type === "pose") {
        let poseArg: string;
        if (coordinateSystem === "FTC") {
          const u = toUser({ x: event.poseX ?? 0, y: event.poseY ?? 0 }, "FTC");
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
        code += `\n${indent}tracker.onSpatial(${poseArg}, ${radiusStr}, ${action});`;
      }
    });
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
