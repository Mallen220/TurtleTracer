// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import Two from "two.js";

export interface FieldScenePayload {
  two: Two;
  width: number;
  height: number;
  shapeElements: any[];
  path: any[];
  diffPathElements: any[];
  previewPathElements: any[];
  points: any[];
  eventMarkerElements: any[];
  collisionElements: any[];
  diffEventMarkerElements: any[];
  snapGuides: InstanceType<typeof Two.Line>[];
  isPresentationMode: boolean;
  isDiffMode: boolean;
  fieldRenderers?: Array<{ id: string; fn: (two: Two) => void }>;
}

/**
 * Synchronizes elements and layers to the Two.js scene graph.
 */
export function syncFieldScene(payload: FieldScenePayload): void {
  const {
    two,
    width,
    height,
    shapeElements,
    path,
    diffPathElements,
    previewPathElements,
    points,
    eventMarkerElements,
    collisionElements,
    diffEventMarkerElements,
    snapGuides,
    isPresentationMode,
    isDiffMode,
    fieldRenderers,
  } = payload;

  if (width && height && (two.width !== width || two.height !== height)) {
    if (two.renderer) two.renderer.setSize(width, height);
    two.width = width;
    two.height = height;
  }

  const shapeGroup = new Two.Group();
  shapeGroup.id = "shape-group";
  const lineGroup = new Two.Group();
  lineGroup.id = "line-group";
  const pointGroup = new Two.Group();
  pointGroup.id = "point-group";
  const eventGroup = new Two.Group();
  eventGroup.id = "event-group";
  const collisionGroup = new Two.Group();
  collisionGroup.id = "collision-group";
  const snapGroup = new Two.Group();
  snapGroup.id = "snap-group";

  two.clear();

  if (Array.isArray(shapeElements)) {
    shapeElements.forEach((el) => shapeGroup.add(el));
  }

  path.forEach((el) => lineGroup.add(el));
  diffPathElements.forEach((el) => lineGroup.add(el));
  previewPathElements.forEach((el) => lineGroup.add(el));

  if (!isPresentationMode && !isDiffMode) {
    points.forEach((el) => pointGroup.add(el));
    eventMarkerElements.forEach((el) => eventGroup.add(el));
    collisionElements.forEach((el) => collisionGroup.add(el));
    snapGuides.forEach((el) => snapGroup.add(el));
  }

  if (isDiffMode) {
    diffEventMarkerElements.forEach((el) => eventGroup.add(el));
  }

  two.add(shapeGroup);
  two.add(lineGroup);
  two.add(eventGroup);
  two.add(pointGroup);
  two.add(collisionGroup);
  two.add(snapGroup);

  if (fieldRenderers) {
    fieldRenderers.forEach((entry) => {
      try {
        entry.fn(two);
      } catch (e) {
        console.error(`Error in field renderer ${entry.id}:`, e);
      }
    });
  }

  two.update();
}
