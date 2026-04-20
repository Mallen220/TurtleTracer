import type { EventMarker } from "../../types/index";
import { findClosestT } from "../../utils/math";

export function generateEventMarkerCode(
  eventMarkers: EventMarker[] | undefined,
  indent: string,
  pathPoints?: { x: number; y: number }[],
  segmentIndex?: number,
  totalSegments?: number,
): string {
  let eventMarkerCode = "";
  if (eventMarkers && eventMarkers.length > 0) {
    eventMarkers.forEach((event) => {
      const type = event.type || "parametric";
      if (type === "parametric") {
        eventMarkerCode += `\n${indent}.addParametricCallback(${event.position.toFixed(3)}, () -> NamedCommands.getCommand("${event.name}"))`;
      } else if (type === "temporal") {
        eventMarkerCode += `\n${indent}.addTemporalCallback(${event.time ?? 500}, () -> NamedCommands.getCommand("${event.name}"))`;
      } else if (type === "pose") {
        const px = (event.poseX ?? 0).toFixed(3);
        const py = (event.poseY ?? 0).toFixed(3);
        const ph = (event.poseHeading ?? 0).toFixed(3);
        let pgVal = event.poseGuess;

        if (pgVal === undefined && pathPoints && pathPoints.length > 0) {
          pgVal = findClosestT(
            { x: event.poseX ?? 0, y: event.poseY ?? 0 },
            pathPoints,
          );
        }

        let pgFinal = pgVal ?? 0.5;
        if (
          segmentIndex !== undefined &&
          totalSegments !== undefined &&
          totalSegments > 0
        ) {
          pgFinal = (segmentIndex + pgFinal) / totalSegments;
        }

        const pg = pgFinal.toFixed(3);
        const poseArg = `new Pose(${px}, ${py}, Math.toRadians(${ph}))`;
        eventMarkerCode += `\n${indent}.addPoseCallback(${poseArg}, () -> NamedCommands.getCommand("${event.name}"), ${pg})`;
      }
    });
  }
  return eventMarkerCode;
}
