// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
/// <reference path="../turtle.d.ts" />
// Draws other projects alongside the open one. Turtle Tracer reads and times
// each picked file (projects.analyze), and the ghost robots follow tracks,
// so they move during playback without the plugin doing anything per frame.

const COLORS = ["#f97316", "#0ea5e9", "#a855f7", "#eab308"];
const icon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" /></svg>`;

interface Shown {
  name: string;
  color: string;
  plan: Turtle.Plan;
}

let shown: Shown[] = [];

const layer = turtle.field.addLayer({
  draw: () =>
    shown.flatMap(({ name, color, plan }, i): Turtle.FieldPrimitive[] => [
      ...plan.paths.map(
        (path): Turtle.FieldPrimitive => ({
          type: "line",
          points: path.points,
          stroke: color,
          strokeWidth: 0.6,
          dash: [2, 1.5],
          opacity: 0.8,
        }),
      ),
      { type: "robot", track: `auto-${i}`, color, opacity: 0.7 },
      {
        type: "text",
        x: plan.poses.x[0],
        y: plan.poses.y[0] + 10,
        text: name.replace(/\.(turt|pp)$/, ""),
        size: 2.5,
        color,
        bold: true,
      },
    ]),
});

function show(next: Shown[]) {
  shown.forEach((_, i) => layer.setTrack(`auto-${i}`, null));
  shown = next;
  shown.forEach(({ plan }, i) => layer.setTrack(`auto-${i}`, plan.poses));
  layer.redraw();
}

turtle.commands.register({
  id: "show",
  label: "Show other autos…",
  async run() {
    const files = await turtle.files.pickProjects({ multiple: true });
    if (files.length === 0) return;
    const added: Shown[] = [];
    for (const file of files) {
      try {
        const { plan } = await turtle.projects.analyze(file);
        added.push({ name: file.name, color: "", plan });
      } catch (error) {
        turtle.ui.toast(`Couldn't read ${file.name}: ${error}`, "error");
      }
    }
    show(
      [...shown, ...added]
        .slice(-COLORS.length)
        .map((auto, i) => ({ ...auto, color: COLORS[i] })),
    );
  },
});

turtle.commands.register({
  id: "hide",
  label: "Hide other autos",
  run: () => show([]),
});

turtle.ui.addNavbarButton({ command: "show", icon, title: "Show other autos" });
