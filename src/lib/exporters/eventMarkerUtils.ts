import type { EventMarker } from "../../types/index";

export function generateEventMarkerCode(
  eventMarkers: EventMarker[] | undefined,
  indent: string
): string {
  let eventMarkerCode = "";
  if (eventMarkers && eventMarkers.length > 0) {
    eventMarkers.forEach((event) => {
      const type = event.type || "parametric";
      if (type === "parametric") {
        eventMarkerCode += `\n${indent}.addParametricCallback(${event.position.toFixed(3)}, () -> NamedCommands.getCommand("${event.name}").run())`;
      } else if (type === "temporal") {
        eventMarkerCode += `\n${indent}.addTemporalCallback(${event.time ?? 500}, () -> NamedCommands.getCommand("${event.name}").run())`;
      } else if (type === "pose") {
        const px = (event.poseX ?? 0).toFixed(3);
        const py = (event.poseY ?? 0).toFixed(3);
        const ph = (event.poseHeading ?? 0).toFixed(3);
        const pg = (event.poseGuess ?? 0.5).toFixed(3);
        const poseArg = `new Pose(${px}, ${py}, Math.toRadians(${ph}))`;
        eventMarkerCode += `\n${indent}.addPoseCallback(${poseArg}, () -> NamedCommands.getCommand("${event.name}").run(), ${pg})`;
      }
    });
  }
  return eventMarkerCode;
}
