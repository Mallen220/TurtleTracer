// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Path } from "two.js/src/path";
import type { Line as PathLine } from "two.js/src/shapes/line";
import type { Line, Point } from "../../../types";
import { type RenderContext, createLineElement } from "./GeneratorUtils";
import { LINE_WIDTH } from "../../../config";

/** Dashed blue outlines of the optimizer's suggested path. */
export function generatePreviewPathElements(
  previewOptimizedLines: Line[] | null,
  startPoint: Point,
  ctx: RenderContext,
): (Path | PathLine)[] {
  const { uiLength } = ctx;
  const elements: (Path | PathLine)[] = [];

  previewOptimizedLines?.forEach((line, idx) => {
    const start =
      idx === 0 ? startPoint : previewOptimizedLines[idx - 1]?.endPoint;
    if (!line?.endPoint || !start) return;

    const elem = createLineElement(line, start, ctx);
    elem.id = `preview-line-${idx + 1}`;
    elem.stroke = "#60a5fa";
    elem.linewidth = uiLength(LINE_WIDTH);
    elem.noFill();
    elem.dashes = [uiLength(4), uiLength(4)];
    elem.opacity = 0.7;
    elements.push(elem);
  });
  return elements;
}
