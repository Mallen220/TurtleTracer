// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import Two from "two.js";
import type { Shape } from "two.js/src/shape";
import {
  FIELD_LAYERS,
  FieldScene,
  type FieldLayer,
} from "./FieldSceneRenderer";

function circle(id: string) {
  const c = new Two.Circle(10, 10, 5);
  c.id = id;
  return c;
}

const noLayers = (): Record<FieldLayer, Shape[]> =>
  Object.fromEntries(FIELD_LAYERS.map((id) => [id, []])) as unknown as Record<
    FieldLayer,
    Shape[]
  >;

describe("FieldScene", () => {
  let two: Two;
  let scene: FieldScene;
  const svg = () => two.renderer.domElement as SVGSVGElement;
  /** Ids of the SVG elements in a layer, in document order. */
  const drawn = (layer: FieldLayer) =>
    [...svg().querySelector(`#${layer}`)!.children].map((el) => el.id);

  function sync(layers: Partial<Record<FieldLayer, Shape[]>>, extra = {}) {
    scene.sync({
      width: 200,
      height: 100,
      layers: { ...noLayers(), ...layers },
      ...extra,
    });
  }

  beforeEach(() => {
    two = new Two({ type: Two.Types.svg, width: 100, height: 100 });
    scene = new FieldScene(two);
  });

  it("makes the layer groups once, bottom to top", () => {
    sync({});
    sync({ "point-group": [circle("p")] });
    expect(
      [...svg().querySelectorAll("g[id$='-group']")].map((g) => g.id),
    ).toEqual([...FIELD_LAYERS]);
  });

  it("resizes the renderer to the field", () => {
    const setSize = vi.spyOn(two.renderer, "setSize");
    sync({});
    expect(setSize).toHaveBeenCalledWith(200, 100);
    expect([two.width, two.height]).toEqual([200, 100]);
  });

  it("keeps the SVG elements of shapes that didn't change", () => {
    const a = circle("a");
    const b = circle("b");
    const c = circle("c");
    sync({ "line-group": [a, b, c] });
    const elementOf = (id: string) => svg().querySelector(`#${id}`);
    const [elA, elC] = [elementOf("a"), elementOf("c")];

    const b2 = circle("b");
    sync({ "line-group": [a, b2, c] });

    expect(drawn("line-group")).toEqual(["a", "b", "c"]);
    expect(elementOf("a")).toBe(elA);
    expect(elementOf("c")).toBe(elC);
    expect(svg().querySelectorAll("#b")).toHaveLength(1);
  });

  it("follows the new order, additions and removals", () => {
    const [a, b, c, d] = ["a", "b", "c", "d"].map(circle);
    sync({ "point-group": [a, b, c] });
    sync({ "point-group": [a, c, d] });
    expect(drawn("point-group")).toEqual(["a", "c", "d"]);
    sync({ "point-group": [d, a] });
    expect(drawn("point-group")).toEqual(["d", "a"]);
    sync({ "point-group": [] });
    expect(drawn("point-group")).toEqual([]);
  });

  it("can show a shape again after it was taken out", () => {
    // Cached points are hidden in presentation mode, then shown again.
    const a = circle("a");
    sync({ "point-group": [a] });
    sync({ "point-group": [] });
    sync({ "point-group": [a] });
    expect(drawn("point-group")).toEqual(["a"]);
  });

  it("removes shapes that share an id", () => {
    sync({ "collision-group": [circle("same"), circle("same")] });
    expect(drawn("collision-group")).toEqual(["same", "same"]);
    sync({ "collision-group": [] });
    expect(drawn("collision-group")).toEqual([]);
  });

  it("doesn't redraw when nothing changed", () => {
    const a = circle("a");
    sync({ "shape-group": [a] });
    const update = vi.spyOn(two, "update");
    sync({ "shape-group": [a] });
    expect(update).not.toHaveBeenCalled();
  });

  describe("plugin renderers", () => {
    it("replaces what plugins drew last time, above the layers", () => {
      let n = 0;
      const plugin = {
        id: "p",
        fn: (t: Two) => {
          t.add(circle(`plugin-${n++}`));
        },
      };
      sync({}, { fieldRenderers: [plugin] });
      sync({}, { fieldRenderers: [plugin] });

      const top = svg().querySelector(`#${two.scene.id}`)!.children;
      expect([...top].map((el) => el.id)).toEqual([
        ...FIELD_LAYERS,
        "plugin-1",
      ]);
    });

    it("clears plugin drawings once no plugins are left", () => {
      const plugin = { id: "p", fn: (t: Two) => t.add(circle("plugin")) };
      sync({}, { fieldRenderers: [plugin] });
      sync({}, { fieldRenderers: [] });
      expect(svg().querySelector("#plugin")).toBeNull();
    });

    it("leaves alone shapes added to the scene by others", () => {
      sync({});
      two.add(circle("box-select"));
      sync({}, { fieldRenderers: [{ id: "p", fn: () => {} }] });
      sync({}, { fieldRenderers: [{ id: "p", fn: () => {} }] });
      expect(svg().querySelector("#box-select")).not.toBeNull();
    });

    it("keeps drawing when a plugin throws", () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const good = vi.fn();
      sync(
        {},
        {
          fieldRenderers: [
            {
              id: "bad",
              fn: () => {
                throw new Error("Plugin crash");
              },
            },
            { id: "good", fn: good },
          ],
        },
      );
      expect(good).toHaveBeenCalledWith(two);
      expect(error).toHaveBeenCalledWith(
        "Error in field renderer bad:",
        expect.any(Error),
      );
      error.mockRestore();
    });
  });
});
