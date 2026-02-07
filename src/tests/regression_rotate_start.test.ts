
import { describe, it, expect } from "vitest";
import { calculatePathTime } from "../utils/timeCalculator";
import { RotateAction } from "../lib/actions/RotateAction";
import { PathAction } from "../lib/actions/PathAction";
import { actionRegistry } from "../lib/actionRegistry";
import type { Point, Line, SequenceItem, SequenceRotateItem, SequencePathItem } from "../types/index";

// Mock Two.js since it's used in RotateAction
vi.mock("two.js", () => {
  return {
    default: class Two {
      static Group = class Group {
        add() {}
      };
      static Circle = class Circle {};
      static Path = class Path {};
      static Anchor = class Anchor {};
    }
  };
});

describe("Rotation Issue Reproduction", () => {
  // Register actions
  actionRegistry.register(RotateAction);
  actionRegistry.register(PathAction);

  it("should respect the first rotate action", () => {
    const startPoint: Point = {
      x: 0,
      y: 0,
      heading: "constant",
      degrees: 0
    };

    const line: Line = {
      id: "line1",
      endPoint: {
        x: 10,
        y: 0,
        heading: "constant",
        degrees: 0
      },
      controlPoints: [],
      color: "red"
    };

    const rotateItem: SequenceRotateItem = {
      kind: "rotate",
      id: "rotate1",
      name: "Rotate 90",
      degrees: 90
    };

    const pathItem: SequencePathItem = {
      kind: "path",
      lineId: "line1"
    };

    const sequence: SequenceItem[] = [rotateItem, pathItem];
    const lines = [line];
    const settings: any = {
      xVelocity: 10,
      yVelocity: 10,
      aVelocity: 180, // 180 deg/sec
      maxVelocity: 10,
      maxAcceleration: 10,
      rWidth: 10,
      rLength: 10
    };

    const result = calculatePathTime(startPoint, lines, settings, sequence);

    // Timeline events should show:
    // 1. Wait event (Rotate 90) - startHeading: 0, targetHeading: 90
    // 2. Wait event (implicit rotation for path) OR Travel event.

    // If the path starts with heading 0 (constant), and we rotated to 90.
    // The path requires heading 0. So we should see a rotation back to 0.
    // IF the bug exists, we might see the rotation from the first action ignored, or snapped.

    const events = result.timeline;
    console.log("Events:", events.map(e => ({ type: e.type, startHeading: e.startHeading, targetHeading: e.targetHeading })));

    const rotateEvent = events.find(e => e.type === "wait" && e.name === "Rotate 90");
    expect(rotateEvent).toBeDefined();
    expect(rotateEvent?.targetHeading).toBe(90);

    // The next event should be a wait to rotate back to 0, because the path requires 0 (constant).
    // If the bug exists (snapping), we might not see a wait event to rotate back to 0, or we might see weird behavior.

    // BUT wait, if the path requires 0, and we are at 90. We should rotate back to 0.
    // If `isFirstPathItem` is true, calculatePathTime says:
    // currentHeading = requiredStartHeading; (which is 0)
    // So currentHeading becomes 0 instantly.
    // The diff is abs(0 - 0) = 0. So NO rotation wait is added.

    // So if we don't see a wait event to rotate back to 0, it confirms the bug.

    // Let's check for a second wait event.
    const rotationBackEvent = events.find((e, idx) => idx > 0 && e.type === "wait");

    // If the bug exists, this will be undefined because currentHeading was snapped to 0.
    expect(rotationBackEvent).toBeDefined();
    if (rotationBackEvent) {
        expect(rotationBackEvent.startHeading).toBe(90);
        expect(rotationBackEvent.targetHeading).toBe(0);
    }
  });
});
