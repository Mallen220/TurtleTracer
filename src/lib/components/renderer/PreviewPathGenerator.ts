import Two from "two.js";
import type { Path } from "two.js/src/path";
import type { Line as PathLine } from "two.js/src/shapes/line";
import type { Line, Point } from "../../../types";
import { type RenderContext, createPathAnchors } from "./GeneratorUtils";
import { LINE_WIDTH } from "../../../config";

export function generatePreviewPathElements(
  previewOptimizedLines: Line[] | null,
  startPoint: Point,
  ctx: RenderContext,
) {
  let _previewPaths: Path[] = [];
  const { x, y, uiLength } = ctx;

  if (previewOptimizedLines && previewOptimizedLines.length > 0) {
    previewOptimizedLines.forEach((line, idx) => {
      if (!line || !line.endPoint) return;
      let _startPoint =
        idx === 0
          ? startPoint
          : previewOptimizedLines[idx - 1]?.endPoint || null;
      if (!_startPoint) return;

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
      lineElem.id = `preview-line-${idx + 1}`;
      lineElem.stroke = "#60a5fa";
      lineElem.linewidth = uiLength(LINE_WIDTH);
      lineElem.noFill();
      lineElem.dashes = [uiLength(4), uiLength(4)];
      lineElem.opacity = 0.7;
      _previewPaths.push(lineElem);
    });
  }
  return _previewPaths;
}
