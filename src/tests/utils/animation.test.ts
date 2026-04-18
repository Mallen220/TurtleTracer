// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi } from "vitest";
import {
  calculateRobotState,
  createAnimationController,
  generateOnionLayers,
} from "../../utils/animation";

const mockScale = (val: number) => val;

describe("animation", () => {
  describe("calculateRobotState", () => {
    it("should return start point if timeline is empty", () => {
      const state = calculateRobotState(
        50,
        [],
        [],
        { x: 10, y: 20 } as any,
        mockScale as any,
        mockScale as any,
      );
      expect(state.x).toBe(10);
      expect(state.y).toBe(20);
      expect(state.heading).toBe(0);
    });

    it("should return final point if percentage is 100", () => {
      const timeline = [
        {
          type: "travel",
          startTime: 0,
          endTime: 10,
          prevPoint: { x: 0, y: 0 },
          lineIndex: 0,
          t_start: 0,
          t_end: 1,
          duration: 10,
          startHeading: 0,
          targetHeading: 90,
        },
      ] as any;
      const lines = [
        {
          endPoint: { x: 100, y: 100, heading: "constant", degrees: 90 },
          controlPoints: [],
        },
      ] as any;
      const state = calculateRobotState(
        100,
        timeline,
        lines,
        { x: 0, y: 0 } as any,
        mockScale as any,
        mockScale as any,
      );
      expect(state.x).toBeCloseTo(100);
      expect(state.y).toBeCloseTo(100);
      expect(state.heading).toBeCloseTo(-90);
    });

    it("should interpolate rotation correctly on wait", () => {
      const timeline = [
        {
          type: "wait",
          startTime: 0,
          endTime: 10,
          startHeading: 0,
          targetHeading: 90,
          duration: 10,
          atPoint: { x: 10, y: 10 },
        },
      ] as any;
      // 50% through a 10s rotate event
      const state = calculateRobotState(
        50,
        timeline,
        [],
        { x: 10, y: 10 } as any,
        mockScale as any,
        mockScale as any,
      );
      expect(state.x).toBe(10);
      expect(state.y).toBe(10);
      // Wait rotation interpolation is linear (shortestRotation just takes progress)
      // shortestRotation(0, 90, 0.5) = 45 -> Returns -45
      expect(state.heading).toBeCloseTo(-45);
    });

    it("should interpolate travel along line correctly", () => {
      const timeline = [
        {
          type: "travel",
          startTime: 0,
          endTime: 10,
          prevPoint: { x: 0, y: 0 },
          lineIndex: 0,
          duration: 10,
          t_start: 0,
          t_end: 1,
          startHeading: 0,
          targetHeading: 0,
        },
      ] as any;
      const lines = [
        {
          endPoint: { x: 100, y: 0, heading: "constant", degrees: 0 },
          controlPoints: [],
        },
      ] as any;

      const state = calculateRobotState(
        50,
        timeline,
        lines,
        { x: 0, y: 0 } as any,
        mockScale as any,
        mockScale as any,
      );
      // t mapping uses easeInOutQuad for fallback. progress=0.5 -> easeInOutQuad(0.5)=0.5
      expect(state.x).toBeCloseTo(50);
      expect(state.y).toBeCloseTo(0);
      expect(Math.abs(state.heading)).toBeCloseTo(0);
    });
  });

  describe("createAnimationController", () => {
    it("should play, pause, update percent", () => {
      const onPercentChange = vi.fn();
      const ctrl = createAnimationController(10, onPercentChange);

      expect(ctrl.isPlaying()).toBe(false);
      ctrl.play();
      expect(ctrl.isPlaying()).toBe(true);

      ctrl.seekToPercent(50);
      expect(ctrl.getPercent()).toBe(50);
      expect(onPercentChange).toHaveBeenCalledWith(50);

      ctrl.pause();
      expect(ctrl.isPlaying()).toBe(false);
    });
  });

  describe("generateOnionLayers", () => {
    it("should return empty array if no lines", () => {
      expect(generateOnionLayers({ x: 0, y: 0 } as any, [], 18, 18)).toEqual(
        [],
      );
    });

    it("should generate layers", () => {
      const startPoint = { x: 0, y: 0 } as any;
      const lines = [
        {
          controlPoints: [],
          endPoint: { x: 100, y: 0, heading: "constant", degrees: 0 },
        },
      ] as any[];

      const layers = generateOnionLayers(startPoint, lines, 18, 18, 50); // spacing 50
      // should have layers roughly at x=50, x=100
      expect(layers.length).toBeGreaterThan(0);
      expect(layers[0].x).toBeCloseTo(50, 0); // 1 decimal place tolerance might be needed depending on precision
    });
  });
});
