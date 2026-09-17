// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Line, Point, SequenceItem, Shape } from "../../../types/index";
import type { RenderContext } from "./GeneratorUtils";
import {
  buildStandardPathElements,
  buildDiffPathElements,
} from "./FieldPathLayer";
import { generateEventMarkerElements } from "./EventMarkerGenerator";
import { generateShapeElements } from "./ShapeGenerator";
import { generatePreviewPathElements } from "./PreviewPathGenerator";
import { generatePointElements } from "./PointGenerator";
import { generateDiffEventMarkerElements } from "./DiffEventMarkerGenerator";
import { generateCollisionElements } from "./CollisionMarkerGenerator";
import { generateOnionLayerElements } from "./OnionLayerGenerator";
import { generateFacingLineElements } from "./FacingLineGenerator";
import { actionRegistry } from "../../actionRegistry";

export interface FieldSceneDataOptions {
  lines: Line[];
  sequencedLines: Line[];
  startPoint: Point;
  shapes: Shape[];
  sequence: SequenceItem[];
  markers: any[];
  isDiffMode: boolean;
  diffData: any;
  oldData: any;
  previewOptimizedLines: Line[] | null;
  effectiveTimePrediction: any;
  selectedLineId: string | null;
  selectedPointId: string | null;
  hoveredMarkerId: string | null;
  ppI: number;
  ctx: RenderContext;
}

export interface FieldSceneElements {
  points: ReturnType<typeof generatePointElements>;
  facingLineElements: ReturnType<typeof generateFacingLineElements>;
  path: ReturnType<typeof buildStandardPathElements>;
  diffPathElements: ReturnType<typeof buildDiffPathElements>;
  diffEventMarkerElements: ReturnType<typeof generateDiffEventMarkerElements>;
  shapeElements: ReturnType<typeof generateShapeElements>;
  onionLayerElements: ReturnType<typeof generateOnionLayerElements>;
  previewPathElements: ReturnType<typeof generatePreviewPathElements>;
  eventMarkerElements: ReturnType<typeof generateEventMarkerElements>;
  collisionElements: ReturnType<typeof generateCollisionElements>;
}

/**
 * Generates all field scene Two.js and SVG elements for rendering.
 */
export function generateAllSceneElements(
  options: FieldSceneDataOptions,
): FieldSceneElements {
  const {
    lines,
    sequencedLines,
    startPoint,
    shapes,
    sequence,
    markers,
    isDiffMode,
    diffData,
    oldData,
    previewOptimizedLines,
    effectiveTimePrediction,
    selectedLineId,
    selectedPointId,
    hoveredMarkerId,
    ppI,
    ctx,
  } = options;

  const points = generatePointElements(
    startPoint,
    lines,
    shapes,
    sequence,
    ctx,
  );
  const facingLineElements = generateFacingLineElements(lines, ctx);
  const path = buildStandardPathElements({
    effectiveTimePrediction,
    lines,
    sequencedLines,
    startPoint,
    isDiffMode,
    selectedLineId,
    ctx,
  });
  const diffPathElements = buildDiffPathElements({
    isDiffMode,
    oldData,
    sequencedLines,
    startPoint,
    diffData,
    ctx,
  });
  const diffEventMarkerElements = generateDiffEventMarkerElements(
    isDiffMode,
    diffData,
    oldData,
    lines,
    startPoint,
    sequence,
    {
      ...ctx,
      hoveredMarkerId,
      ppI,
    },
  );
  const shapeElements = generateShapeElements(shapes, ctx);
  const onionLayerElements = generateOnionLayerElements(lines, startPoint, ctx);
  const previewPathElements = generatePreviewPathElements(
    previewOptimizedLines,
    startPoint,
    ctx,
  );
  const eventMarkerElements = generateEventMarkerElements(
    lines,
    startPoint,
    sequence,
    {
      ...ctx,
      hoveredMarkerId,
      selectedLineId,
      selectedPointId,
      actionRegistry,
    },
  );
  const collisionElements = generateCollisionElements(
    markers,
    lines,
    startPoint,
    effectiveTimePrediction,
    ctx,
  );

  return {
    points,
    facingLineElements,
    path,
    diffPathElements,
    diffEventMarkerElements,
    shapeElements,
    onionLayerElements,
    previewPathElements,
    eventMarkerElements,
    collisionElements,
  };
}
