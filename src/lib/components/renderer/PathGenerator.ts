import Two from "two.js";
import type { Path } from "two.js/src/path";
import type { Line as PathLine } from "two.js/src/shapes/line";
import type { Line, Point } from "../../../types";
import { getCurvePoint } from "../../../utils/math";
import { LINE_WIDTH } from "../../../config";
import { type RenderContext, createPathAnchors } from "./GeneratorUtils";

export function generatePathElements(
  targetLines: Line[],
  targetStartPoint: Point,
  getColor: (line: Line) => string,
  getWidth: (line: Line) => number,
  idPrefix: string,
  ctx: RenderContext,
  isHeatmapEnabled: boolean = false,
) {
  let _path: (Path | PathLine)[] = [];
  const { x, y, uiLength, settings, timePrediction, dimmedIds } = ctx;

  targetLines.forEach((line, idx) => {
    if (!line || !line.endPoint || line.hidden) return;
    let _startPoint =
      idx === 0 ? targetStartPoint : targetLines[idx - 1]?.endPoint || null;
    if (!_startPoint) return;

    // Check for Velocity Heatmap Mode (only for main path)
    const showHeatmap =
      isHeatmapEnabled && settings.showVelocityHeatmap && timePrediction;
    let heatmapSegments: (PathLine | Path)[] = [];

    if (showHeatmap) {
      // Try to find corresponding timeline event for velocity data
      // lineIndex matches the index in 'lines' array
      const event = timePrediction.timeline.find(
        (e: any) => e.type === "travel" && e.lineIndex === idx,
      );

      if (event && event.velocityProfile && event.velocityProfile.length > 0) {
        const vProfile = event.velocityProfile as number[];
        const maxVel = Math.max(1, settings.maxVelocity);

        // Re-sample geometry to match profile (100 samples)
        const samples = 100;
        let cps = [_startPoint, ...line.controlPoints, line.endPoint];
        let prevPt = getCurvePoint(0, cps);

        let currentAnchors: any[] = [];
        let currentColor: string | null = null;
        let segmentCounter = 0;

        const createHeatmapSegment = (
          anchors: any[],
          color: string,
          segIdx: number,
        ) => {
          const path = new Two.Path(anchors, false, false);
          path.noFill();
          path.linewidth = getWidth(line);
          path.id = `${idPrefix}-line-${idx + 1}-heatmap-${segIdx}`;

          const isDimmed = line.id && dimmedIds!.includes(line.id);
          path.stroke = isDimmed ? "#9ca3af" : color;

          if (line.locked) {
            path.dashes = [uiLength(2), uiLength(2)];
            path.opacity = 0.7;
          } else if (isDimmed) {
            path.dashes = [uiLength(1), uiLength(1)];
            path.opacity = 0.3;
          }
          return path;
        };

        for (let i = 1; i <= samples; i++) {
          const t = i / samples;
          const currPt = getCurvePoint(t, cps);

          // Calculate the proportional index in the velocity profile
          const profileIndex = Math.floor(t * (vProfile.length - 1));
          const safeIndex = Math.min(
            vProfile.length - 1,
            Math.max(0, profileIndex),
          );

          const vAvg = vProfile[safeIndex] || 0;
          const ratio = Math.min(1, Math.max(0, vAvg / maxVel));

          // Green (120) -> Red (0)
          const hue = 120 - ratio * 120;
          const color = `hsl(${hue}, 100%, 40%)`;

          if (color !== currentColor) {
            if (currentAnchors.length > 0) {
              heatmapSegments.push(
                createHeatmapSegment(
                  currentAnchors,
                  currentColor!,
                  segmentCounter++,
                ),
              );
            }

            // Start new path with previous point
            currentAnchors = [
              new Two.Anchor(
                x(prevPt.x),
                y(prevPt.y),
                0,
                0,
                0,
                0,
                Two.Commands.move,
              ),
              new Two.Anchor(
                x(currPt.x),
                y(currPt.y),
                0,
                0,
                0,
                0,
                Two.Commands.line,
              ),
            ];
            currentColor = color;
          } else {
            // Extend current path
            currentAnchors.push(
              new Two.Anchor(
                x(currPt.x),
                y(currPt.y),
                0,
                0,
                0,
                0,
                Two.Commands.line,
              ),
            );
          }

          prevPt = currPt;
        }

        // Flush last segment
        if (currentAnchors.length > 0 && currentColor) {
          heatmapSegments.push(
            createHeatmapSegment(
              currentAnchors,
              currentColor,
              segmentCounter++,
            ),
          );
        }
      }
    }

    if (heatmapSegments.length > 0) {
      heatmapSegments.forEach((seg) => _path.push(seg));
      return;
    }

    // Fallback: Standard Line Rendering
    let lineElem: Path | PathLine;
    const anchors = createPathAnchors(line, _startPoint, ctx);
    if (line.controlPoints.length === 0) {
      lineElem = new Two.Line(
        anchors[0].x,
        anchors[0].y,
        anchors[1].x,
        anchors[1].y,
      );
    } else {
      lineElem = new Two.Path(anchors);
      lineElem.automatic = false;
    }
    lineElem.id = `${idPrefix}-line-${idx + 1}`;

    const isDimmed = line.id && dimmedIds.includes(line.id);

    lineElem.stroke = isDimmed ? "#9ca3af" : getColor(line);
    lineElem.linewidth = getWidth(line);
    lineElem.noFill();
    if (line.locked) {
      lineElem.dashes = [uiLength(2), uiLength(2)];
      lineElem.opacity = 0.7;
    } else if (isDimmed) {
      lineElem.dashes = [uiLength(1), uiLength(1)];
    } else {
      lineElem.dashes = [];
      lineElem.opacity = 1;
    }
    _path.push(lineElem);
  });
  return _path;
}
