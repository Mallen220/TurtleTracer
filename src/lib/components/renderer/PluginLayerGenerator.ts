// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Draws what plugins put on the field (fieldLayerRegistry) with Two.js. The
// shapes arrive already checked by the plugin host. Each point is converted
// with the field's scales, so rotations and robot-relative shapes come out
// right whichever way the field is shown.
import Two from "two.js";
import type { Shape } from "two.js/src/shape";
import type { FieldPrimitive, PoseTrack } from "../../../types";
import type { FieldLayerDefinition } from "../../registries";
import { poseOnTrack } from "../../../utils/poseTrack";
import type { RenderContext } from "./GeneratorUtils";

/** Where the robot is and when, for shapes that move with it. */
export interface PluginMotion {
  robot: { x: number; y: number; heading: number };
  /** Seconds into the routine. */
  time: number;
}

/** Class given to shapes a plugin wants to hear clicks on. */
export const CLICKABLE_CLASS = "plugin-clickable";

/** The layer and plugin id behind each clickable shape's element id. */
export type ClickTargets = Map<
  string,
  { layer: FieldLayerDefinition; primitiveId: string }
>;

const DEFAULT_STROKE = "#64748b";
const DEFAULT_STROKE_WIDTH = 0.4;
const DEFAULT_TEXT_SIZE = 3;

type Point = { x: number; y: number };

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** `p` rotated `degrees` counter-clockwise about the origin. */
function rotate(p: Point, degrees: number): Point {
  const r = toRadians(degrees);
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
}

/** Whether a layer has shapes that follow the robot or a track. */
export function layerMoves(layer: FieldLayerDefinition): boolean {
  return layer.primitives.some(
    (p) => p.space === "robot" || (p.type === "robot" && p.track !== undefined),
  );
}

function paint(
  shape: Shape & { fill?: unknown; stroke?: unknown; linewidth?: number },
  p: { fill?: string; stroke?: string; strokeWidth?: number },
  ctx: RenderContext,
  defaultFill = "none",
) {
  shape.fill = p.fill ?? defaultFill;
  shape.stroke = p.stroke ?? DEFAULT_STROKE;
  shape.linewidth = ctx.uiLength(p.strokeWidth ?? DEFAULT_STROKE_WIDTH);
}

function polygon(points: Point[], closed: boolean, ctx: RenderContext) {
  const anchors = points.map((p) => new Two.Anchor(ctx.x(p.x), ctx.y(p.y)));
  return new Two.Path(anchors, closed, false);
}

/** The corners of a w×h rectangle centred on (0, 0), rotated `degrees`. */
function rectCorners(width: number, height: number, degrees: number): Point[] {
  const w = width / 2;
  const h = height / 2;
  return [
    { x: -w, y: -h },
    { x: w, y: -h },
    { x: w, y: h },
    { x: -w, y: h },
  ].map((c) => rotate(c, degrees));
}

function drawPrimitive(
  p: FieldPrimitive,
  ctx: RenderContext,
  place: (local: Point) => Point,
  turn: number,
  tracks: Readonly<Record<string, PoseTrack>>,
  motion: PluginMotion | null,
  robotSize: { length: number; width: number },
): Shape | null {
  switch (p.type) {
    case "circle": {
      const c = place(p);
      const radius = Math.abs(ctx.x(p.radius) - ctx.x(0));
      const circle = new Two.Circle(ctx.x(c.x), ctx.y(c.y), radius);
      paint(circle, p, ctx);
      return circle;
    }
    case "rect": {
      const corners = rectCorners(p.width, p.height, (p.rotation ?? 0) + turn);
      const centre = place(p);
      const path = polygon(
        corners.map((c) => ({ x: centre.x + c.x, y: centre.y + c.y })),
        true,
        ctx,
      );
      paint(path, p, ctx);
      return path;
    }
    case "line": {
      if (p.points.length < 2) return null;
      const path = polygon(p.points.map(place), p.closed ?? false, ctx);
      paint(path, p, ctx);
      if (p.dash?.length) path.dashes = p.dash.map((d) => ctx.uiLength(d));
      return path;
    }
    case "text": {
      const at = place(p);
      const text = new Two.Text(p.text, ctx.x(at.x), ctx.y(at.y));
      text.fill = p.color ?? "#111827";
      text.size = ctx.uiLength(p.size ?? DEFAULT_TEXT_SIZE);
      text.alignment = p.align ?? "center";
      text.baseline = "middle";
      text.weight = p.bold ? 700 : 400;
      text.family = "system-ui, sans-serif";
      return text;
    }
    case "arrow": {
      const from = place(p.from);
      const to = place(p.to);
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const head = Math.min(4, Math.hypot(to.x - from.x, to.y - from.y) / 3);
      const barb = (offset: number) => ({
        x: to.x - head * Math.cos(angle + offset),
        y: to.y - head * Math.sin(angle + offset),
      });
      const color = p.color ?? DEFAULT_STROKE;
      const shaft = polygon([from, to], false, ctx);
      const tip = polygon([barb(0.5), to, barb(-0.5)], false, ctx);
      for (const part of [shaft, tip]) {
        paint(part, { stroke: color, strokeWidth: p.strokeWidth }, ctx);
        part.cap = "round";
        part.join = "round";
      }
      const group = new Two.Group();
      group.add(shaft, tip);
      return group;
    }
    case "robot": {
      let pose: { x: number; y: number; heading: number } | null = null;
      if (p.track === undefined) {
        const at = place({ x: p.x ?? 0, y: p.y ?? 0 });
        pose = { x: at.x, y: at.y, heading: (p.heading ?? 0) + turn };
      } else {
        const track = tracks[p.track];
        pose = track && motion ? poseOnTrack(track, motion.time) : null;
      }
      if (!pose) return null;
      const length = p.length ?? robotSize.length;
      const width = p.width ?? robotSize.width;
      const color = p.color ?? DEFAULT_STROKE;
      const body = polygon(
        rectCorners(length, width, pose.heading).map((c) => ({
          x: pose.x + c.x,
          y: pose.y + c.y,
        })),
        true,
        ctx,
      );
      paint(body, { stroke: color, fill: color, strokeWidth: 0.5 }, ctx);
      body.fill = color;
      const front = rotate({ x: length / 2, y: 0 }, pose.heading);
      const nose = polygon(
        [pose, { x: pose.x + front.x, y: pose.y + front.y }],
        false,
        ctx,
      );
      paint(nose, { stroke: "#ffffff", strokeWidth: 0.6 }, ctx);
      const group = new Two.Group();
      group.add(body, nose);
      // The body is translucent so the field shows through.
      body.opacity = 0.35;
      return group;
    }
  }
}

/**
 * The Two.js shapes for every plugin layer. Clickable shapes get element ids
 * listed in `targets`.
 */
export function generatePluginElements(
  layers: readonly FieldLayerDefinition[],
  ctx: RenderContext,
  motion: PluginMotion | null,
  targets: ClickTargets,
): Shape[] {
  targets.clear();
  const robotSize = {
    length: ctx.settings.rLength,
    width: ctx.settings.rWidth,
  };
  const shapes: Shape[] = [];

  layers.forEach((layer, layerIndex) => {
    layer.primitives.forEach((p, index) => {
      // Robot-relative shapes are placed from the robot's pose; with no pose
      // yet they aren't drawn.
      const inRobot = p.space === "robot";
      if (inRobot && !motion) return;
      const robot = motion?.robot;
      const place = (local: Point): Point => {
        if (!inRobot || !robot) return { x: local.x, y: local.y };
        const r = rotate(local, robot.heading);
        return { x: robot.x + r.x, y: robot.y + r.y };
      };
      const turn = inRobot && robot ? robot.heading : 0;

      let shape: Shape | null = null;
      try {
        shape = drawPrimitive(
          p,
          ctx,
          place,
          turn,
          layer.tracks,
          motion,
          robotSize,
        );
      } catch (error) {
        console.error(`Couldn't draw a shape from ${layer.owner}:`, error);
      }
      if (!shape) return;
      if (p.opacity !== undefined) {
        (shape as Shape & { opacity: number }).opacity = p.opacity;
      }
      shape.id = `plugin-${layerIndex}-${index}`;
      if (p.id !== undefined && layer.onClick) {
        shape.className = CLICKABLE_CLASS;
        targets.set(shape.id, { layer, primitiveId: p.id });
      }
      shapes.push(shape);
    });
  });
  return shapes;
}
