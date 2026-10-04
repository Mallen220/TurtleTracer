// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import Two from "two.js";
import type { Group } from "two.js/src/group";
import type { Shape } from "two.js/src/shape";
import type { FieldRenderEntry } from "../../registries";

/**
 * The field's drawing layers, bottom to top. Exports and CSS look them up
 * by these ids.
 */
export const FIELD_LAYERS = [
  "shape-group",
  "line-group",
  "event-group",
  "point-group",
  "collision-group",
  "snap-group",
] as const;

export type FieldLayer = (typeof FIELD_LAYERS)[number];

export interface FieldScenePayload {
  width: number;
  height: number;
  layers: Record<FieldLayer, readonly Shape[]>;
  /** Plugin drawing callbacks; they draw straight onto the scene. */
  fieldRenderers?: readonly FieldRenderEntry[];
}

/**
 * Keeps the Two.js scene in step with the field's drawings.
 *
 * The layer groups are made once. When a layer's shapes change, only the
 * shapes from the first difference onwards are swapped, so unchanged shapes
 * keep their SVG elements instead of being rebuilt on every redraw.
 */
export class FieldScene {
  #two: Two;
  #layers: Record<FieldLayer, Group>;
  /** What the plugins drew last time, removed before they draw again. */
  #pluginShapes: Shape[] = [];

  constructor(two: Two) {
    this.#two = two;
    this.#layers = Object.fromEntries(
      FIELD_LAYERS.map((id) => {
        const group = new Two.Group();
        group.id = id;
        two.add(group);
        return [id, group];
      }),
    ) as Record<FieldLayer, Group>;
  }

  sync({ width, height, layers, fieldRenderers }: FieldScenePayload): void {
    const two = this.#two;
    let changed = false;

    if (width && height && (two.width !== width || two.height !== height)) {
      if (two.renderer) two.renderer.setSize(width, height);
      two.width = width;
      two.height = height;
      changed = true;
    }

    for (const id of FIELD_LAYERS) {
      if (this.#setLayer(id, layers[id])) changed = true;
    }

    if (fieldRenderers?.length || this.#pluginShapes.length) {
      this.#drawPlugins(fieldRenderers ?? []);
      changed = true;
    }

    if (changed) two.update();
  }

  /** Makes a layer show `shapes`, in order. Returns whether it changed. */
  #setLayer(id: FieldLayer, shapes: readonly Shape[]): boolean {
    const children = this.#layers[id].children;
    let firstChange = 0;
    while (
      firstChange < children.length &&
      firstChange < shapes.length &&
      children[firstChange] === shapes[firstChange]
    ) {
      firstChange++;
    }
    if (firstChange === children.length && firstChange === shapes.length) {
      return false;
    }

    // Two.js can only append to a group, so everything from the first
    // change on is taken out and put back in the new order. Splicing by
    // index (rather than Group.remove, which goes by id) also copes with
    // shapes that share an id.
    if (firstChange < children.length) children.splice(firstChange);
    if (firstChange < shapes.length) {
      children.push(...shapes.slice(firstChange));
    }
    return true;
  }

  #drawPlugins(renderers: readonly FieldRenderEntry[]) {
    const scene = this.#two.scene;
    if (this.#pluginShapes.length) scene.remove(this.#pluginShapes);

    const before = new Set(scene.children);
    for (const entry of renderers) {
      try {
        entry.fn(this.#two);
      } catch (e) {
        console.error(`Error in field renderer ${entry.id}:`, e);
      }
    }
    this.#pluginShapes = scene.children.filter((child) => !before.has(child));
  }
}
