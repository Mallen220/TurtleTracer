// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { LiveRun, NEW_OPMODE_GAP, type LiveSample } from "../utils/liveRun";

/** Feeds samples 20 ms apart from `t0`, returning the indices that started a run. */
function feed(run: LiveRun, samples: Omit<LiveSample, "t">[], t0 = 0) {
  const starts: number[] = [];
  samples.forEach((s, i) => {
    if (run.push({ t: t0 + i * 0.02, ...s })) starts.push(i);
  });
  return starts;
}

const still = (busy?: boolean, n = 5) =>
  Array.from({ length: n }, () => ({ x: 0, y: 0, busy }));

describe("LiveRun start", () => {
  it("starts when the robot starts its first path", () => {
    const run = new LiveRun();
    expect(feed(run, [...still(false), ...still(true)])).toEqual([5]);
  });

  it("doesn't start again for the later paths of the same OpMode", () => {
    const run = new LiveRun();
    const starts = feed(run, [
      ...still(false),
      ...still(true),
      ...still(false),
      ...still(true),
    ]);
    expect(starts).toEqual([5]);
  });

  it("doesn't start when connected part way through a path", () => {
    const run = new LiveRun();
    expect(feed(run, still(true, 10))).toEqual([]);
  });

  it("starts again in the next OpMode, after a pause in the stream", () => {
    const run = new LiveRun();
    feed(run, [...still(false), ...still(true), ...still(false)]);
    const later = 1 + NEW_OPMODE_GAP;
    expect(feed(run, [...still(false), ...still(true)], later)).toEqual([5]);
  });

  it("starts again when the robot's clock restarts", () => {
    const run = new LiveRun();
    feed(run, [...still(false), ...still(true)], 100);
    expect(feed(run, [...still(false), ...still(true)], 0)).toEqual([5]);
  });

  it("never starts when the robot doesn't send its busy state", () => {
    const run = new LiveRun();
    expect(feed(run, still(undefined, 20))).toEqual([]);
  });

  it("doesn't restart after the trail is cleared mid-path", () => {
    const run = new LiveRun();
    feed(run, [...still(false), ...still(true)]);
    run.reset();
    expect(feed(run, still(true), 1)).toEqual([]);
  });
});

describe("LiveRun trail", () => {
  const along = (from: number, to: number, busy?: boolean) =>
    Array.from({ length: to - from + 1 }, (_, i) => ({
      x: from + i,
      y: 0,
      busy,
    }));

  it("records the route, skipping points closer than half an inch", () => {
    const run = new LiveRun();
    feed(run, [
      { x: 0, y: 0 },
      { x: 0.2, y: 0 },
      { x: 1, y: 0 },
      { x: 1.3, y: 0 },
      { x: 2, y: 0 },
    ]);
    expect(run.trail).toEqual([
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
    ]);
  });

  it("starts afresh when the run starts", () => {
    const run = new LiveRun();
    feed(run, [...along(0, 5, false), ...along(5, 8, true)]);
    expect(run.trail).toEqual([
      [
        { x: 5, y: 0 },
        { x: 6, y: 0 },
        { x: 7, y: 0 },
        { x: 8, y: 0 },
      ],
    ]);
  });

  it("breaks where the robot jumps or the stream pauses", () => {
    const run = new LiveRun();
    feed(run, along(0, 2));
    feed(run, along(40, 41), 0.1);
    feed(run, along(42, 43), 0.2 + NEW_OPMODE_GAP);
    expect(run.trail.map((segment) => segment.length)).toEqual([3, 2, 2]);
  });

  it("keeps the latest points when it gets long", () => {
    const run = new LiveRun();
    feed(run, along(0, 6000));
    const points = run.trail.flat();
    expect(points).toHaveLength(5000);
    expect(points.at(-1)).toEqual({ x: 6000, y: 0 });
  });

  it("is emptied by reset", () => {
    const run = new LiveRun();
    feed(run, along(0, 5));
    const version = run.version;
    run.reset();
    expect(run.trail).toEqual([]);
    expect(run.version).toBeGreaterThan(version);
  });
});
