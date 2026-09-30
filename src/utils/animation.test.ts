// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { scaleLinear } from "d3";
import {
  calculateRobotState,
  createAnimationController,
  robotPoseDuring,
  travelCurve,
} from "./animation";
import type { Line, Point, TimelineEvent } from "../types";

describe("playback controller", () => {
  // A hand-driven requestAnimationFrame: nothing runs until tick() is called.
  let pending = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  const tick = (timestamp: number) => {
    const callbacks = [...pending.values()];
    pending.clear();
    callbacks.forEach((cb) => cb(timestamp));
  };

  beforeEach(() => {
    vi.useFakeTimers();
    pending = new Map();
    nextId = 1;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      pending.set(nextId, cb);
      return nextId++;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => pending.delete(id));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** A 10 second controller that has started playing at timestamp 0. */
  function playing(options: { loop?: boolean } = {}) {
    const onPercent = vi.fn();
    const onComplete = vi.fn();
    const controller = createAnimationController(10, onPercent, onComplete);
    controller.setLoop(options.loop ?? true);
    controller.play();
    tick(0); // the first frame only sets the time origin
    onPercent.mockClear();
    return { controller, onPercent, onComplete };
  }

  it("advances with the clock, measured from the first frame", () => {
    const { controller, onPercent } = playing();
    tick(2500);
    expect(onPercent).toHaveBeenLastCalledWith(25);
    tick(5000);
    expect(onPercent).toHaveBeenLastCalledWith(50);
    expect(controller.getPercent()).toBe(50);
  });

  it("wraps back to the start when looping", () => {
    const { controller, onPercent } = playing({ loop: true });
    tick(12000);
    expect(onPercent).toHaveBeenLastCalledWith(20);
    expect(controller.isPlaying()).toBe(true);
  });

  it("stops at the end and reports completion when not looping", () => {
    const { controller, onPercent, onComplete } = playing({ loop: false });
    tick(10500);
    expect(onPercent).toHaveBeenLastCalledWith(100);
    expect(controller.isPlaying()).toBe(false);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(pending.size).toBe(0);
  });

  it("starts over from the beginning when played again after finishing", () => {
    const { controller, onPercent } = playing({ loop: false });
    tick(11000);
    onPercent.mockClear();
    controller.play();
    expect(onPercent).toHaveBeenCalledWith(0);
    expect(controller.isPlaying()).toBe(true);
  });

  it("ignores play() while already playing, and pause() while stopped", () => {
    const { controller } = playing();
    const frames = pending.size;
    controller.play();
    expect(pending.size).toBe(frames);
    controller.pause();
    controller.pause();
    expect(controller.isPlaying()).toBe(false);
    expect(pending.size).toBe(0);
  });

  it("keeps its place across a pause and resumes from there", () => {
    const { controller, onPercent } = playing();
    tick(3000);
    controller.pause();
    controller.play();
    tick(100000); // new origin frame, however late it arrives
    tick(101000);
    expect(onPercent).toHaveBeenLastCalledWith(40);
  });

  it("reports 0 and does no work when there is nothing to play", () => {
    const onPercent = vi.fn();
    const controller = createAnimationController(0, onPercent);
    controller.play();
    tick(0);
    tick(1000);
    expect(onPercent).toHaveBeenLastCalledWith(0);
    expect(controller.getPercent()).toBe(0);
  });

  it("reset pauses and goes back to zero", () => {
    const { controller, onPercent } = playing();
    tick(4000);
    controller.reset();
    expect(controller.isPlaying()).toBe(false);
    expect(onPercent).toHaveBeenLastCalledWith(0);
    expect(controller.getPercent()).toBe(0);
  });

  describe("seeking", () => {
    it("clamps to 0-100 and reports the clamped value", () => {
      const onPercent = vi.fn();
      const controller = createAnimationController(10, onPercent);
      controller.seekToPercent(-20);
      expect(onPercent).toHaveBeenLastCalledWith(0);
      controller.seekToPercent(250);
      expect(onPercent).toHaveBeenLastCalledWith(100);
      expect(controller.getPercent()).toBe(100);
    });

    it("carries on from the new spot if the animation is running", () => {
      const { controller, onPercent } = playing();
      tick(1000);
      controller.seekToPercent(80);
      vi.runAllTimers(); // the seek's "external change" flag clears
      onPercent.mockClear();
      tick(2000);
      expect(onPercent).toHaveBeenLastCalledWith(90);
    });

    it("doesn't let a frame overwrite the percent it was just told about", () => {
      const { controller, onPercent } = playing();
      controller.seekToPercent(80);
      onPercent.mockClear();
      tick(1000); // same tick as the seek: the flag hasn't cleared yet
      expect(onPercent).not.toHaveBeenCalled();
      vi.runAllTimers();
      tick(2000);
      expect(onPercent).toHaveBeenCalled();
    });
  });

  describe("setDuration", () => {
    it("keeps the same relative position", () => {
      const onPercent = vi.fn();
      const controller = createAnimationController(10, onPercent);
      controller.seekToPercent(50);
      controller.setDuration(20);
      expect(controller.getDuration()).toBe(20);
      expect(controller.getPercent()).toBe(50);
    });

    it("clamps the position when it starts from no duration", () => {
      const controller = createAnimationController(0, () => {});
      controller.setDuration(10);
      expect(controller.getPercent()).toBe(0);
    });
  });

  describe("playback range", () => {
    it("jumps to the start of the range when played from outside it", () => {
      const onPercent = vi.fn();
      const controller = createAnimationController(10, onPercent);
      controller.setPlaybackRange(20, 60, true);
      controller.play();
      expect(onPercent).toHaveBeenCalledWith(20);
    });

    it("loops inside the range", () => {
      const onPercent = vi.fn();
      const controller = createAnimationController(10, onPercent);
      controller.setPlaybackRange(20, 60, true);
      controller.play();
      tick(0);
      onPercent.mockClear();
      // Starts at 2 s; 7 s of clock is 2 + 7 = 9 s, which is 3 s past the
      // end of the range (6 s) and wraps to 2 + 3 = 5 s.
      tick(7000);
      expect(onPercent).toHaveBeenLastCalledWith(50);
    });

    it("stops at the end of the range when not looping", () => {
      const onComplete = vi.fn();
      const onPercent = vi.fn();
      const controller = createAnimationController(10, onPercent, onComplete);
      controller.setLoop(false);
      controller.setPlaybackRange(20, 60, true);
      controller.play();
      tick(0);
      tick(9000);
      expect(onPercent).toHaveBeenLastCalledWith(60);
      expect(onComplete).toHaveBeenCalled();
      expect(controller.isPlaying()).toBe(false);
    });

    it("clamps the range and ignores one that ends before it starts", () => {
      const onPercent = vi.fn();
      const controller = createAnimationController(10, onPercent);
      controller.setPlaybackRange(50, 30, true); // end before start: end becomes 100
      controller.play();
      tick(0);
      tick(7000); // 5 s + 7 s = 12 s wraps within 5-10 s: 5 + 2 = 7 s
      expect(onPercent).toHaveBeenLastCalledWith(70);
    });

    it("plays the whole timeline again once the range is switched off", () => {
      const onPercent = vi.fn();
      const controller = createAnimationController(10, onPercent);
      controller.setPlaybackRange(20, 60, true);
      controller.setPlaybackRange(20, 60, false);
      controller.play();
      expect(onPercent).not.toHaveBeenCalled(); // already within 0-100%
    });
  });

  it("reports whether it loops", () => {
    const controller = createAnimationController(10, () => {});
    expect(controller.isLooping()).toBe(true);
    controller.setLoop(false);
    expect(controller.isLooping()).toBe(false);
  });
});

describe("robot pose", () => {
  const start: Point = { x: 0, y: 0, heading: "constant", degrees: 0 };
  const xScale = scaleLinear().domain([0, 100]).range([0, 1000]);
  const yScale = scaleLinear().domain([0, 100]).range([1000, 0]);

  const line = (endPoint: Partial<Point>, over: Partial<Line> = {}): Line => ({
    id: "a",
    endPoint: { heading: "tangential", ...endPoint } as Point,
    controlPoints: [],
    color: "red",
    ...over,
  });
  const travel = (over: Partial<TimelineEvent> = {}): TimelineEvent => ({
    type: "travel",
    duration: 10,
    startTime: 0,
    endTime: 10,
    lineIndex: 0,
    ...over,
  });

  describe("turning in place", () => {
    const turn = (over: Partial<TimelineEvent> = {}): TimelineEvent => ({
      type: "wait",
      duration: 2,
      startTime: 0,
      endTime: 2,
      startHeading: 350,
      targetHeading: 10,
      atPoint: { x: 30, y: 40 },
      ...over,
    });

    it("turns the short way round at the wait's position", () => {
      const pose = robotPoseDuring(turn(), 1, [], start)!;
      expect(pose).toEqual({ x: 30, y: 40, heading: 360 });
    });

    it("finishes facing the target, even past the end", () => {
      expect(robotPoseDuring(turn(), 99, [], start)!.heading).toBe(370);
    });

    it("jumps straight to the target when the wait has no duration", () => {
      const pose = robotPoseDuring(turn({ duration: 0 }), 0, [], start)!;
      expect(pose.heading).toBe(370);
    });

    it("stays at the start point if the wait has no position", () => {
      const pose = robotPoseDuring(turn({ atPoint: undefined }), 0, [], {
        ...start,
        x: 5,
        y: 6,
      })!;
      expect(pose).toMatchObject({ x: 5, y: 6 });
    });
  });

  describe("travelCurve", () => {
    it("finds the line and its previous point from the event", () => {
      const l = line({ x: 10, y: 0 });
      const found = travelCurve(
        travel({ line: l, prevPoint: { x: 1, y: 2 } as Point }),
        [],
        start,
      )!;
      expect(found.line).toBe(l);
      expect(found.curve[0]).toEqual({ x: 1, y: 2 });
    });

    it("falls back to the lines list, starting from the previous line's end", () => {
      const lines = [line({ x: 10, y: 0 }), line({ x: 20, y: 0 })];
      const first = travelCurve(travel(), lines, start)!;
      expect(first.curve[0]).toBe(start);
      const second = travelCurve(travel({ lineIndex: 1 }), lines, start)!;
      expect(second.curve[0]).toBe(lines[0].endPoint);
    });

    it("is null when the line or its start can't be found", () => {
      expect(travelCurve(travel({ lineIndex: 4 }), [], start)).toBeNull();
      expect(
        travelCurve(travel({ lineIndex: 2 }), [line({ x: 1, y: 1 })], start),
      ).toBeNull();
    });
  });

  describe("headings while travelling", () => {
    const at = (l: Line, seconds: number, event: Partial<TimelineEvent> = {}) =>
      robotPoseDuring(travel(event), seconds, [l], start)!;

    it("tangential: faces along the path, or away from it when reversed", () => {
      const north = line({ x: 0, y: 40, heading: "tangential" });
      expect(at(north, 5).heading).toBeCloseTo(90, 0);
      const reversed = line({
        x: 0,
        y: 40,
        heading: "tangential",
        reverse: true,
      } as any);
      expect(at(reversed, 5).heading).toBeCloseTo(-90, 0);
    });

    it("constant: holds the heading, plus half a turn when reversed", () => {
      const plain = line({ x: 40, y: 0, heading: "constant", degrees: 30 });
      expect(at(plain, 5).heading).toBe(30);
      const reversed = line({
        x: 40,
        y: 0,
        heading: "constant",
        degrees: 30,
        reverse: true,
      } as any);
      expect(at(reversed, 5).heading).toBe(210);
    });

    it("linear: sweeps from the start to the end heading", () => {
      const sweep = line({
        x: 40,
        y: 0,
        heading: "linear",
        startDeg: 0,
        endDeg: 90,
      });
      expect(at(sweep, 0).heading).toBeCloseTo(0);
      expect(at(sweep, 5).heading).toBeCloseTo(45);
      expect(at(sweep, 10).heading).toBeCloseTo(90);
    });

    it("facingPoint: looks at the target, or away from it when reversed", () => {
      const facing = line({
        x: 40,
        y: 0,
        heading: "facingPoint",
        targetX: 20,
        targetY: 50,
      } as any);
      // Half way along, at (20, 0), the target is straight up.
      expect(at(facing, 5).heading).toBeCloseTo(90);
      const away = line({
        x: 40,
        y: 0,
        heading: "facingPoint",
        targetX: 20,
        targetY: 50,
        reverse: true,
      } as any);
      expect(at(away, 5).heading).toBeCloseTo(270);
    });

    it("keeps heading 0 when the target is exactly where the robot is", () => {
      const onTarget = line({
        x: 40,
        y: 0,
        heading: "facingPoint",
        targetX: 40,
        targetY: 0,
      } as any);
      expect(at(onTarget, 10).heading).toBe(0);
    });

    it("uses the time calculator's heading profile when it has one", () => {
      const l = line({ x: 40, y: 0, heading: "constant", degrees: 0 });
      const pose = at(l, 5, {
        motionProfile: [0, 10],
        headingProfile: [0, 90],
      });
      expect(pose.heading).toBeCloseTo(45);
    });

    it("ignores a heading profile that isn't usable", () => {
      const l = line({ x: 40, y: 0, heading: "constant", degrees: 12 });
      const wrongLength = at(l, 5, {
        motionProfile: [0, 10],
        headingProfile: [0],
      });
      expect(wrongLength.heading).toBe(12);
      const notANumber = at(l, 5, {
        motionProfile: [0, 10],
        headingProfile: [0, Number.NaN],
      });
      expect(notANumber.heading).toBe(12);
    });

    it("places the robot along the path using the motion profile", () => {
      const l = line({ x: 40, y: 0, heading: "constant", degrees: 0 });
      // The first half of the path takes 8 s, the second 2 s.
      const pose = at(l, 8, { motionProfile: [0, 8, 10] });
      expect(pose.x).toBeCloseTo(20);
    });

    it("is null if the line can't be found", () => {
      expect(
        robotPoseDuring(travel({ lineIndex: 3 }), 0, [], start),
      ).toBeNull();
    });
  });

  describe("calculateRobotState", () => {
    const lines = [line({ x: 40, y: 0, heading: "constant", degrees: 30 })];

    it("returns screen coordinates, with the heading flipped to clockwise", () => {
      const timeline = [travel({ duration: 10, endTime: 10 })];
      const state = calculateRobotState(
        50,
        timeline,
        lines,
        start,
        xScale,
        yScale,
      );
      expect(state.x).toBeCloseTo(xScale(20), 0);
      expect(state.y).toBeCloseTo(yScale(0));
      expect(state.heading).toBe(-30);
    });

    it("finds the right event among several", () => {
      const timeline: TimelineEvent[] = [
        {
          type: "wait",
          startTime: 0,
          endTime: 4,
          duration: 4,
          startHeading: 0,
          targetHeading: 0,
          atPoint: { x: 7, y: 7 },
        },
        travel({ startTime: 4, endTime: 14, duration: 10 }),
      ];
      const inWait = calculateRobotState(
        10,
        timeline,
        lines,
        start,
        xScale,
        yScale,
      );
      expect(inWait.x).toBeCloseTo(xScale(7));
      const inTravel = calculateRobotState(
        100,
        timeline,
        lines,
        start,
        xScale,
        yScale,
      );
      expect(inTravel.x).toBeCloseTo(xScale(40));
    });

    it("looks under a macro's wrapper event for the real one", () => {
      const timeline: TimelineEvent[] = [
        {
          type: "macro",
          startTime: 0,
          endTime: 10,
          duration: 10,
        } as TimelineEvent,
        travel({ startTime: 0, endTime: 10, duration: 10 }),
      ];
      const state = calculateRobotState(
        100,
        timeline,
        lines,
        start,
        xScale,
        yScale,
      );
      expect(state.x).toBeCloseTo(xScale(40));
    });

    it("sits at the start, facing as the start point does, if there's nothing to play", () => {
      const s = { x: 10, y: 20, heading: "constant", degrees: 45 } as Point;
      const empty = calculateRobotState(50, [], lines, s, xScale, yScale);
      expect(empty).toEqual({ x: xScale(10), y: yScale(20), heading: -45 });
      const missingLine = calculateRobotState(
        50,
        [travel({ lineIndex: 9 })],
        [],
        s,
        xScale,
        yScale,
      );
      expect(missingLine).toEqual(empty);
    });
  });
});
