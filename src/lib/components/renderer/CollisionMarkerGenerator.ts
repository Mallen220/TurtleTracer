// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import Two from "two.js";
import type { Line, Point } from "../../../types";
import { getCurvePoint, easeInOutQuad } from "../../../utils/math";

interface RenderContext {
  x: d3.ScaleLinear<number, number>;
  y: d3.ScaleLinear<number, number>;
  uiLength: (inches: number) => number;
}

export function generateCollisionElements(
  markers: any[],
  lines: Line[],
  startPoint: Point,
  timePrediction: any,
  ctx: RenderContext,
) {
  let elems: InstanceType<typeof Two.Group>[] = [];
  const { x, y, uiLength } = ctx;

  if (markers && markers.length > 0) {
    markers.forEach((marker, idx) => {
      const group = new Two.Group();
      const isBoundary = marker.type === "boundary";
      const isZeroLength = marker.type === "zero-length";
      const isKeepIn = marker.type === "keep-in";

      let fillColor = "rgba(239, 68, 68, 0.5)"; // Red-500
      let strokeColor = "#ef4444";
      let glowFill = "rgba(239, 68, 68, 0.3)";
      let glowStroke = "rgba(239, 68, 68, 0.5)";

      if (isBoundary) {
        fillColor = "rgba(249, 115, 22, 0.5)"; // Orange-500
        strokeColor = "#f97316";
        glowFill = "rgba(249, 115, 22, 0.3)";
        glowStroke = "rgba(249, 115, 22, 0.5)";
      } else if (isZeroLength) {
        fillColor = "rgba(217, 70, 239, 0.5)"; // Fuchsia-500
        strokeColor = "#d946ef";
        glowFill = "rgba(217, 70, 239, 0.3)";
        glowStroke = "rgba(217, 70, 239, 0.5)";
      } else if (isKeepIn) {
        fillColor = "rgba(59, 130, 246, 0.5)"; // Blue-500
        strokeColor = "#3b82f6";
        glowFill = "rgba(59, 130, 246, 0.3)";
        glowStroke = "rgba(59, 130, 246, 0.5)";
      }

      // Check for range
      if (
        marker.endTime !== undefined &&
        marker.endTime > marker.time &&
        timePrediction &&
        timePrediction.timeline
      ) {
        // Range Rendering
        const start = marker.time;
        const end = marker.endTime;

        const events = timePrediction.timeline.filter(
          (e: any) => e.endTime >= start && e.startTime <= end,
        );

        events.forEach((ev: any) => {
          const segStart = Math.max(start, ev.startTime);
          const segEnd = Math.min(end, ev.endTime);

          if (ev.type === "wait") {
            // Render point if wait is involved
            if (ev.atPoint) {
              const circle = new Two.Circle(
                x(ev.atPoint.x),
                y(ev.atPoint.y),
                uiLength(2),
              );
              circle.fill = fillColor;
              circle.stroke = strokeColor;
              circle.linewidth = uiLength(0.5);
              group.add(circle);
            }
          } else if (ev.type === "travel") {
            const lineIdx = ev.lineIndex;
            const line = lines[lineIdx];
            if (line) {
              // Use the exact prevPoint captured in the timeline to anchor
              // segment start; this stays correct across macro expansions and
              // translated macros where array order may not match execution.
              const lineStartPoint =
                ev.prevPoint ||
                (lineIdx === 0 ? startPoint : lines[lineIdx - 1].endPoint);
              let t1 = 0;
              let t2 = 1;

              if (ev.duration > 0) {
                t1 = Math.max(0, (segStart - ev.startTime) / ev.duration);
                t2 = Math.min(1, (segEnd - ev.startTime) / ev.duration);
              }

              // Generate segment points
              const samples = 30;
              const points = [];
              const cps = [
                lineStartPoint,
                ...line.controlPoints,
                line.endPoint,
              ];

              for (let i = 0; i <= samples; i++) {
                const t = t1 + (t2 - t1) * (i / samples);
                // Apply easing to match robot path movement
                const spatialT = easeInOutQuad(t);
                const pt = getCurvePoint(spatialT, cps);
                points.push(new Two.Anchor(x(pt.x), y(pt.y)));
              }

              const path = new Two.Path(points, false, false);
              path.noFill();
              path.stroke = strokeColor;
              path.linewidth = uiLength(2.0);
              path.cap = "round";
              path.join = "round";
              group.add(path);

              // Add glow
              const glowPath = new Two.Path(points, false, false);
              glowPath.noFill();
              glowPath.stroke = glowStroke;
              glowPath.linewidth = uiLength(6.0);
              glowPath.opacity = 0.5;
              glowPath.cap = "round";
              glowPath.join = "round";
              group.add(glowPath);
            }
          }
        });
      } else {
        // Point Rendering
        const circle = new Two.Circle(x(marker.x), y(marker.y), uiLength(2));
        circle.fill = fillColor;
        circle.stroke = strokeColor;
        circle.linewidth = uiLength(0.5);

        const crossLength = uiLength(1.5);
        const l1 = new Two.Line(
          x(marker.x) - crossLength,
          y(marker.y) - crossLength,
          x(marker.x) + crossLength,
          y(marker.y) + crossLength,
        );
        l1.stroke = "#ffffff";
        l1.linewidth = uiLength(0.5);

        const l2 = new Two.Line(
          x(marker.x) + crossLength,
          y(marker.y) - crossLength,
          x(marker.x) - crossLength,
          y(marker.y) + crossLength,
        );
        l2.stroke = "#ffffff";
        l2.linewidth = uiLength(0.5);

        const glow = new Two.Circle(x(marker.x), y(marker.y), uiLength(6));
        glow.fill = glowFill;
        glow.stroke = glowStroke;
        glow.linewidth = uiLength(0.5);

        group.add(glow, circle, l1, l2);
      }
      elems.push(group);
    });
  }
  return elems;
}
