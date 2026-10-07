// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  activeTravelLineIndex,
  generateOnionLayerElements,
} from "../../../lib/components/renderer/OnionLayerGenerator";
import type {
  Line,
  Point,
  Settings,
  TimelineEvent,
  TimePrediction,
} from "../../../types";

const startPoint = { x: 0, y: 0, heading: "tangential" } as Point;
const lineTo = (x: number): Line => ({
  endPoint: { x, y: 0, heading: "tangential" } as Point,
  controlPoints: [],
  color: "red",
});
const lines = [lineTo(20), lineTo(40)];

const prediction = (timeline: Partial<TimelineEvent>[]) =>
  ({ totalTime: 10, timeline }) as unknown as TimePrediction;
const travel = (lineIndex: number, startTime: number, endTime: number) => ({
  type: "travel" as const,
  lineIndex,
  startTime,
  endTime,
});

const settings = (over: Partial<Settings> = {}) =>
  ({
    showOnionLayers: true,
    onionLayerSpacing: 5,
    rLength: 10,
    rWidth: 10,
    ...over,
  }) as Settings;

describe("activeTravelLineIndex", () => {
  const timeline = prediction([
    travel(0, 0, 4),
    { type: "wait", startTime: 4, endTime: 6 },
    travel(1, 6, 10),
  ]);

  it("is the index of the line being driven", () => {
    expect(activeTravelLineIndex(timeline, 20)).toBe(0);
    expect(activeTravelLineIndex(timeline, 80)).toBe(1);
  });

  it("is null while no line is being driven", () => {
    expect(activeTravelLineIndex(timeline, 50)).toBeNull();
  });

  it("is undefined without a timeline", () => {
    expect(activeTravelLineIndex(null, 50)).toBeUndefined();
  });
});

describe("generateOnionLayerElements", () => {
  const all = generateOnionLayerElements(lines, startPoint, settings(), 0);
  const currentOnly = settings({ onionSkinCurrentPathOnly: true });

  it("draws nothing when onion layers are off", () => {
    const off = settings({ showOnionLayers: false });
    expect(generateOnionLayerElements(lines, startPoint, off, 0)).toEqual([]);
  });

  it("covers every line unless limited to the current one", () => {
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((layer) => layer.x <= 40)).toBe(true);
    expect(all.some((layer) => layer.x > 20)).toBe(true);
  });

  it("covers only the line being driven, starting where it starts", () => {
    const second = generateOnionLayerElements(
      lines,
      startPoint,
      currentOnly,
      1,
    );
    expect(second.length).toBeGreaterThan(0);
    expect(second.every((layer) => layer.x > 20)).toBe(true);
  });

  it("draws nothing while no line is being driven", () => {
    expect(
      generateOnionLayerElements(lines, startPoint, currentOnly, null),
    ).toEqual([]);
  });

  it("covers every line without a timeline, or when the line is missing", () => {
    expect(
      generateOnionLayerElements(lines, startPoint, currentOnly, undefined),
    ).toEqual(all);
    expect(
      generateOnionLayerElements(lines, startPoint, currentOnly, 5),
    ).toEqual(all);
  });
});
