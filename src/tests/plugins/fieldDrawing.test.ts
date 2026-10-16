// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import * as d3 from "d3";
import {
  CLICKABLE_CLASS,
  generatePluginElements,
  layerMoves,
  type ClickTargets,
} from "../../lib/components/renderer/PluginLayerGenerator";
import type { FieldLayerDefinition } from "../../lib/registries";
import type { RenderContext } from "../../lib/components/renderer/GeneratorUtils";
import { poseOnTrack } from "../../utils/poseTrack";
import { DEFAULT_SETTINGS } from "../../config/defaults";

// 1 inch = 2 px, with y pointing up as on the field.
const ctx: RenderContext = {
  x: d3.scaleLinear().domain([0, 144]).range([0, 288]),
  y: d3.scaleLinear().domain([0, 144]).range([288, 0]),
  uiLength: (inches) => inches * 2,
  settings: { ...DEFAULT_SETTINGS, rLength: 18, rWidth: 12 } as any,
  timePrediction: null,
  dimmedIds: [],
  multiSelectedPointIds: [],
};

const layer = (
  primitives: FieldLayerDefinition["primitives"],
  extra: Partial<FieldLayerDefinition> = {},
): FieldLayerDefinition => ({
  id: "l",
  owner: "p",
  primitives,
  tracks: {},
  ...extra,
});

/** The corner points of a drawn path, in pixels. */
const corners = (shape: any) =>
  shape.vertices.map((v: any) => [Math.round(v.x), Math.round(v.y)]);

describe("plugin drawings on the field", () => {
  it("places shapes by field inches", () => {
    const [circle] = generatePluginElements(
      [layer([{ type: "circle", x: 10, y: 20, radius: 3, fill: "red" }])],
      ctx,
      null,
      new Map(),
    ) as any[];
    expect([circle.translation.x, circle.translation.y]).toEqual([20, 248]);
    expect(circle.radius).toBe(6);
    expect(circle.fill).toBe("red");
  });

  it("rotates rectangles counter-clockwise", () => {
    const [rect] = generatePluginElements(
      [
        layer([
          { type: "rect", x: 72, y: 72, width: 4, height: 2, rotation: 90 },
        ]),
      ],
      ctx,
      null,
      new Map(),
    );
    // A 4×2 rectangle turned a quarter turn is 2 wide and 4 tall.
    const points = corners(rect);
    const xs = points.map((p: number[]) => p[0]);
    const ys = points.map((p: number[]) => p[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBe(4);
    expect(Math.max(...ys) - Math.min(...ys)).toBe(8);
  });

  it("draws robot-relative shapes on the robot, and none without one", () => {
    const shapes = [
      layer([{ type: "circle", x: 10, y: 0, radius: 1, space: "robot" }]),
    ];
    expect(generatePluginElements(shapes, ctx, null, new Map())).toEqual([]);
    const [circle] = generatePluginElements(
      shapes,
      ctx,
      { robot: { x: 50, y: 50, heading: 90 }, time: 0 },
      new Map(),
    ) as any[];
    // 10 in ahead of a robot facing +y is (50, 60).
    expect([
      Math.round(circle.translation.x),
      Math.round(circle.translation.y),
    ]).toEqual([100, 168]);
  });

  it("moves robots along their track with the playhead", () => {
    const shapes = [
      layer([{ type: "robot", track: "sim" }], {
        tracks: { sim: { t: [0, 2], x: [0, 20], y: [0, 0], heading: [0, 0] } },
      }),
    ];
    expect(layerMoves(shapes[0])).toBe(true);
    const at = (time: number) =>
      generatePluginElements(
        shapes,
        ctx,
        { robot: { x: 0, y: 0, heading: 0 }, time },
        new Map(),
      );
    const centre = (group: any) => {
      const xs = group.children[0].vertices.map((v: any) => v.x);
      return (Math.max(...xs) + Math.min(...xs)) / 2;
    };
    expect(centre(at(1)[0])).toBeCloseTo(20); // 10 in
    expect(at(1)).toHaveLength(1);
    expect(generatePluginElements(shapes, ctx, null, new Map())).toEqual([]);
  });

  it("marks shapes the plugin listens to clicks on", () => {
    const targets: ClickTargets = new Map();
    const onClick = () => {};
    const definition = layer(
      [
        { type: "circle", x: 0, y: 0, radius: 1, id: "a" },
        { type: "circle", x: 0, y: 0, radius: 1 },
      ],
      { onClick },
    );
    const shapes = generatePluginElements(
      [definition],
      ctx,
      null,
      targets,
    ) as any[];
    expect(shapes[0].className).toBe(CLICKABLE_CLASS);
    expect(shapes[1].className).not.toBe(CLICKABLE_CLASS);
    expect(targets.get(shapes[0].id)).toEqual({
      layer: definition,
      primitiveId: "a",
    });
  });

  it("skips lines with fewer than two points", () => {
    expect(
      generatePluginElements(
        [layer([{ type: "line", points: [{ x: 1, y: 1 }] }])],
        ctx,
        null,
        new Map(),
      ),
    ).toEqual([]);
  });
});

describe("poseOnTrack", () => {
  const track = {
    t: [0, 1, 3],
    x: [0, 10, 10],
    y: [0, 0, 20],
    heading: [0, 90, 90],
  };

  it("interpolates between samples and holds at the ends", () => {
    expect(poseOnTrack(track, 0.5)).toEqual({ x: 5, y: 0, heading: 45 });
    expect(poseOnTrack(track, 2)).toEqual({ x: 10, y: 10, heading: 90 });
    expect(poseOnTrack(track, -1)).toEqual({ x: 0, y: 0, heading: 0 });
    expect(poseOnTrack(track, 9)).toEqual({ x: 10, y: 20, heading: 90 });
    expect(poseOnTrack({ t: [], x: [], y: [], heading: [] }, 0)).toBeNull();
  });
});
