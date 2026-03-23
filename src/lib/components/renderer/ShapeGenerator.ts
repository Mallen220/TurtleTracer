// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import Two from "two.js";
import type { Path } from "two.js/src/path";
import type { Shape } from "../../../types";

interface RenderContext {
  x: d3.ScaleLinear<number, number>;
  y: d3.ScaleLinear<number, number>;
  uiLength: (inches: number) => number;
}

export function generateShapeElements(shapes: Shape[], ctx: RenderContext) {
  let _shapes: Path[] = [];
  const { x, y, uiLength } = ctx;

  shapes.forEach((shape, idx) => {
    if (shape.visible === false) return; // Skip hidden shapes

    if (shape.vertices.length >= 3) {
      let vertices = [];
      vertices.push(
        new Two.Anchor(
          x(shape.vertices[0].x),
          y(shape.vertices[0].y),
          0,
          0,
          0,
          0,
          Two.Commands.move,
        ),
      );
      for (let i = 1; i < shape.vertices.length; i++) {
        vertices.push(
          new Two.Anchor(
            x(shape.vertices[i].x),
            y(shape.vertices[i].y),
            0,
            0,
            0,
            0,
            Two.Commands.line,
          ),
        );
      }
      vertices.push(
        new Two.Anchor(
          x(shape.vertices[0].x),
          y(shape.vertices[0].y),
          0,
          0,
          0,
          0,
          Two.Commands.close,
        ),
      );
      vertices.forEach((point) => (point.relative = false));
      let shapeElement = new Two.Path(vertices);
      shapeElement.id = `shape-${idx}`;

      // Styling based on type
      if (shape.type === "keep-in") {
        shapeElement.stroke = shape.color;
        shapeElement.fill = shape.color;
        shapeElement.opacity = 0.1; // Low occupancy fill 10%
        shapeElement.linewidth = uiLength(1.0);
        shapeElement.dashes = [uiLength(4), uiLength(4)]; // Dashed lines
      } else {
        // Standard Obstacle
        shapeElement.stroke = shape.color;
        shapeElement.fill = shape.color;
        shapeElement.opacity = 0.4;
        shapeElement.linewidth = uiLength(0.8);
        shapeElement.dashes = [];
      }

      shapeElement.automatic = false;
      _shapes.push(shapeElement);
    }
  });
  return _shapes;
}
