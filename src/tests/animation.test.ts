// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { describe, it, expect, vi } from "vitest";
import {
  calculateRobotState,
  createAnimationController,
  generateOnionLayers,
} from "../utils/animation";
import { scaleLinear } from "d3";
import type { Line, TimelineEvent, Point } from "../types";

describe("animation", () => {
  const xScale = scaleLinear().domain([0, 144]).range([0, 1000]);
  const yScale = scaleLinear().domain([0, 144]).range([0, 1000]);
  const startPoint: Point = { x: 0, y: 0, heading: "constant", degrees: 0 };

  const simpleLines: Line[] = [
    {
      endPoint: { x: 10, y: 0, heading: "constant", degrees: 0 },
      controlPoints: [],
      color: "red",
    },
  ];

  const simpleTimeline: TimelineEvent[] = [
    {
      type: "travel",
      duration: 1.0,
      startTime: 0,
      endTime: 1.0,
      lineIndex: 0,
    },
  ];

  describe("calculateRobotState", () => {
    it("should return start point when timeline is empty", () => {
      const state = calculateRobotState(0, [], [], startPoint, xScale, yScale);
      expect(state.x).toBeCloseTo(xScale(0));
      expect(state.y).toBeCloseTo(yScale(0));
      expect(state.heading).toBe(0);
    });

    it("should calculate state at start of simple line", () => {
      const state = calculateRobotState(
        0,
        simpleTimeline,
        simpleLines,
        startPoint,
        xScale,
        yScale,
      );
      expect(state.x).toBeCloseTo(xScale(0));
      expect(state.y).toBeCloseTo(yScale(0));
    });

    it("should calculate state at end of simple line", () => {
      // Percent 100
      const state = calculateRobotState(
        100,
        simpleTimeline,
        simpleLines,
        startPoint,
        xScale,
        yScale,
      );
      // It uses easeInOutQuad, so at 100% (t=1), value is 1.
      // Expected x is 10
      expect(state.x).toBeCloseTo(xScale(10));
      expect(state.y).toBeCloseTo(yScale(0));
    });

    it("should handle wait events", () => {
      const waitTimeline: TimelineEvent[] = [
        {
          type: "wait",
          duration: 1.0,
          startTime: 0,
          endTime: 1.0,
          atPoint: { x: 5, y: 5 },
          startHeading: 0,
          targetHeading: 90,
        },
      ];

      // At 50%
      const state = calculateRobotState(
        50,
        waitTimeline,
        [],
        startPoint,
        xScale,
        yScale,
      );
      expect(state.x).toBeCloseTo(xScale(5));
      expect(state.y).toBeCloseTo(yScale(5));
      // Heading should be interpolated. 0 to 90. 50% -> 45.
      // The visualizer negates the heading. So -45.
      expect(state.heading).toBeCloseTo(-45);
    });

    it("should use motion profile if available", () => {
      // Mock motion profile: 2 steps. t=0 -> 0s, t=1 -> 1s.
      const profileTimeline: TimelineEvent[] = [
        {
          type: "travel",
          duration: 1.0,
          startTime: 0,
          endTime: 1.0,
          lineIndex: 0,
          motionProfile: [0, 1.0],
          headingProfile: [0, 90], // unwrapped heading
        },
      ];

      // At 50% (0.5s)
      // Profile is linear 0 to 1. So 0.5s matches index 0.5 roughly?
      // logic: finds segment. 0.5 is between 0 and 1.
      // localProgress = (0.5 - 0) / (1 - 0) = 0.5
      // linePercent = tStart + ... tStart=0, tEnd=1. So 0.5.
      // Curve point at 0.5 (linear line 0,0 to 10,0) -> 5,0

      const state = calculateRobotState(
        50,
        profileTimeline,
        simpleLines,
        startPoint,
        xScale,
        yScale,
      );
      expect(state.x).toBeCloseTo(xScale(5));
      expect(state.y).toBeCloseTo(yScale(0));

      // Heading interpolation: 0 to 90 at 0.5 -> 45. Negated -> -45.
      expect(state.heading).toBeCloseTo(-45);
    });
  });

  describe("createAnimationController", () => {
    it("should start not playing", () => {
      const controller = createAnimationController(10, () => {});
      expect(controller.isPlaying()).toBe(false);
    });

    it("should play and pause", () => {
      const controller = createAnimationController(10, () => {});
      controller.play();
      expect(controller.isPlaying()).toBe(true);
      controller.pause();
      expect(controller.isPlaying()).toBe(false);
    });

    // Testing async behavior of requestAnimationFrame is tricky in unit tests without fake timers.
    // We can rely on basic state checks here.
  });

  describe("generateOnionLayers", () => {
    it("should generate layers", () => {
      // Line length is 10. Spacing 4. Should have layers at ~4 and ~8.
      const layers = generateOnionLayers(startPoint, simpleLines, 10, 10, 4);
      expect(layers.length).toBeGreaterThanOrEqual(2);
    });
  });
});
