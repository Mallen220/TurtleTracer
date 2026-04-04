// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSelectableItems } from "../../../../lib/components/shortcuts/selection";
import {
  linesStore,
  sequenceStore,
  shapesStore,
} from "../../../../lib/projectStore";
import { actionRegistry } from "../../../../lib/actionRegistry";

describe("selection shortcuts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getSelectableItems", () => {
    it("should return start point when everything is empty", () => {
      linesStore.set([]);
      sequenceStore.set([]);
      shapesStore.set([]);
      const items = getSelectableItems();
      expect(items.length).toBe(1);
      expect(items[0]).toBe("point-0-0");
    });

    it("should return start point and lines elements based on sequence", () => {
      linesStore.set([
        {
          id: "line1",
          controlPoints: [{}, {}],
          endPoint: {},
        },
      ] as any[]);

      // Since it's actionRegistry map, we just mock the .get directly
      vi.spyOn(actionRegistry, "get").mockReturnValue({ isPath: true } as any);

      sequenceStore.set([{ kind: "path", lineId: "line1" }] as any[]);

      shapesStore.set([]);

      const items = getSelectableItems();
      expect(items.length).toBe(4);
      expect(items[0]).toBe("point-0-0");
      expect(items[1]).toBe("point-1-1");
      expect(items[2]).toBe("point-1-2");
      expect(items[3]).toBe("point-1-0");
    });
  });
});
