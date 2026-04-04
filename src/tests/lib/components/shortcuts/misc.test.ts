// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  cyclePathColor,
  toggleRobotVisibility,
  selectFirst,
  selectLast,
} from "../../../../lib/components/shortcuts/misc";
import { linesStore } from "../../../../lib/projectStore";
import { selectedLineId, selectedPointId, showRobot } from "../../../../stores";

vi.mock("../../../../lib/components/shortcuts/utils", () => ({
  isUIElementFocused: vi.fn(() => false),
}));

describe("misc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("cyclePathColor", () => {
    it("should update line color if line selected", () => {
      linesStore.set([{ id: "line1", color: "blue" }] as any[]);
      selectedLineId.set("line1");
      const cb = vi.fn();

      cyclePathColor(cb);

      expect(cb).toHaveBeenCalledWith("Cycle Path Color");
      let lines: any;
      linesStore.subscribe((v) => (lines = v))();
      expect(lines[0].color).not.toBe("blue");
    });
  });

  describe("toggleRobotVisibility", () => {
    it("should toggle showRobot store", () => {
      showRobot.set(false);
      toggleRobotVisibility();
      let sr;
      showRobot.subscribe((v) => (sr = v))();
      expect(sr).toBe(true);
      toggleRobotVisibility();
      showRobot.subscribe((v) => (sr = v))();
      expect(sr).toBe(false);
    });
  });

  describe("selectFirst", () => {
    it("should select start point if lines exist", () => {
      linesStore.set([{} as any]);
      selectFirst();
      let pid;
      selectedPointId.subscribe((v) => (pid = v))();
      expect(pid).toBe("point-0-0");
    });
  });

  describe("selectLast", () => {
    it("should select last point if lines exist", () => {
      linesStore.set([{} as any, {} as any]); // length 2
      selectLast();
      let pid;
      selectedPointId.subscribe((v) => (pid = v))();
      expect(pid).toBe("point-2-0");
    });
  });
});
