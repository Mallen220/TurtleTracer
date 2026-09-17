// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi } from "vitest";
import { syncFieldScene } from "./FieldSceneRenderer";

describe("FieldSceneRenderer", () => {
  it("clears and adds groups to Two instance", () => {
    const addedGroups: any[] = [];
    const mockTwo: any = {
      width: 100,
      height: 100,
      renderer: { setSize: vi.fn() },
      clear: vi.fn(),
      add: vi.fn((group) => addedGroups.push(group)),
      update: vi.fn(),
    };

    const dummyEl = { id: "dummy" };

    syncFieldScene({
      two: mockTwo,
      width: 200,
      height: 200,
      shapeElements: [dummyEl],
      path: [dummyEl],
      diffPathElements: [],
      previewPathElements: [],
      points: [dummyEl],
      eventMarkerElements: [],
      collisionElements: [],
      diffEventMarkerElements: [],
      snapGuides: [],
      isPresentationMode: false,
      isDiffMode: false,
    });

    expect(mockTwo.clear).toHaveBeenCalled();
    expect(mockTwo.renderer.setSize).toHaveBeenCalledWith(200, 200);
    expect(mockTwo.add).toHaveBeenCalledTimes(6); // shape, line, event, point, collision, snap
    expect(mockTwo.update).toHaveBeenCalled();
  });

  it("handles custom fieldRenderers safely", () => {
    const mockTwo: any = {
      width: 100,
      height: 100,
      clear: vi.fn(),
      add: vi.fn(),
      update: vi.fn(),
    };

    const pluginFn = vi.fn();
    const brokenPlugin = vi.fn(() => {
      throw new Error("Plugin crash");
    });

    syncFieldScene({
      two: mockTwo,
      width: 100,
      height: 100,
      shapeElements: [],
      path: [],
      diffPathElements: [],
      previewPathElements: [],
      points: [],
      eventMarkerElements: [],
      collisionElements: [],
      diffEventMarkerElements: [],
      snapGuides: [],
      isPresentationMode: false,
      isDiffMode: false,
      fieldRenderers: [
        { id: "good", fn: pluginFn },
        { id: "bad", fn: brokenPlugin },
      ],
    });

    expect(pluginFn).toHaveBeenCalledWith(mockTwo);
    expect(brokenPlugin).toHaveBeenCalledWith(mockTwo);
    expect(mockTwo.update).toHaveBeenCalled();
  });
});
