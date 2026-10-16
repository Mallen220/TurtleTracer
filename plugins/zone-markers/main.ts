// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
/// <reference path="../turtle.d.ts" />
// New kinds of event marker. Each says when, within its step, it fires;
// Turtle Tracer saves that as the marker's position, so the marker exports
// like an ordinary one (and still does for people without this plugin).

/** Whether `p` is inside the polygon `vertices` (ray casting). */
function inside(p: Turtle.FieldPoint, vertices: Turtle.FieldPoint[]): boolean {
  let result = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i];
    const b = vertices[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    ) {
      result = !result;
    }
  }
  return result;
}

/** The planned poses during `step`, as [time since the step started, pose]. */
function posesDuring(plan: Turtle.Plan, step: Turtle.PlanStep) {
  const { t, x, y } = plan.poses;
  const poses: [number, Turtle.FieldPoint][] = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] >= step.start && t[i] <= step.end) {
      poses.push([t[i] - step.start, { x: x[i], y: y[i] }]);
    }
  }
  return poses;
}

turtle.markers.register({
  name: "enter-zone",
  label: "When entering a zone",
  fields: [
    {
      key: "zone",
      type: "text",
      label: "Zone name",
      help: "The name of an obstacle or keep-in shape.",
      placeholder: "Scoring zone",
    },
  ],
  resolve({ marker, step, plan, project }) {
    const zone = project.shapes.find((s) => s.name === marker.values.zone);
    if (!zone) return null;
    const entry = posesDuring(plan, step).find(([, pose]) =>
      inside(pose, zone.vertices),
    );
    return entry ? entry[0] : null;
  },
});

turtle.markers.register({
  name: "before-end",
  label: "Before the end of the path",
  fields: [
    {
      key: "distance",
      type: "number",
      unit: "distance",
      label: "Distance before the end",
      min: 0,
      default: 6,
    },
  ],
  resolve({ marker, step, plan }) {
    const poses = posesDuring(plan, step);
    const end = poses.at(-1)?.[1];
    if (!end) return null;
    const distance = Number(marker.values.distance);
    const reached = poses.find(
      ([, pose]) => Math.hypot(pose.x - end.x, pose.y - end.y) <= distance,
    );
    return reached ? reached[0] : null;
  },
});
