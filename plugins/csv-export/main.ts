// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
/// <reference path="../turtle.d.ts" />
// Exports the routine as CSV. Times and poses come from Turtle Tracer's own
// timing (`plan`), so they match playback.

const round = (value: number, places = 3) => Number(value.toFixed(places));

/** One row per `interval` seconds: time, x, y, heading. */
function timelineCsv(plan: Turtle.Plan, interval: number): string {
  const rows = ["time,x,y,heading"];
  const { t, x, y, heading } = plan.poses;
  let next = 0;
  for (let i = 0; i < t.length; i++) {
    const last = i === t.length - 1;
    if (t[i] + 1e-9 < next && !last) continue;
    rows.push([t[i], x[i], y[i], heading[i]].map((v) => round(v)).join(","));
    next = t[i] + interval;
  }
  return rows.join("\n");
}

/** One row per waypoint: the start, then the end of each path. */
function waypointsCsv(project: Turtle.ProjectSnapshot): string {
  const describe = (heading: Turtle.HeadingInfo) =>
    heading.mode === "constant" ? String(heading.degrees) : heading.mode;
  const rows = ["name,x,y,heading"];
  rows.push(
    `Start,${project.start.x},${project.start.y},${round(project.start.heading)}`,
  );
  project.paths.forEach((path, i) => {
    const name = (path.name || `Path ${i + 1}`).replaceAll(",", " ");
    rows.push(`${name},${path.to.x},${path.to.y},${describe(path.heading)}`);
  });
  return rows.join("\n");
}

turtle.exporters.register({
  name: "csv",
  label: "CSV",
  extension: "csv",
  export({ project, plan }) {
    const settings = turtle.settings.get();
    return settings.rows === "waypoints"
      ? waypointsCsv(project)
      : timelineCsv(plan, Number(settings.interval) || 0.1);
  },
});
