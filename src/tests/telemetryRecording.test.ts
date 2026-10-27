// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  MAX_RECORDED,
  TelemetryRecording,
  isTelemetryExport,
  pointsFromExport,
  recordingFileName,
} from "../utils/telemetryRecording";
import { DEFAULT_SETTINGS } from "../config/defaults";
import type { Settings } from "../types";

const context = (settings: Partial<Settings> = {}) => ({
  file: "auto.turt",
  startPoint: { x: 1, y: 2, heading: "constant" as const, degrees: 0 },
  lines: [],
  sequence: [],
  shapes: [],
  settings: { ...DEFAULT_SETTINGS, ...settings } as Settings,
  appVersion: "9.9.9",
  now: new Date("2026-10-24T18:00:00Z"),
});

describe("TelemetryRecording", () => {
  it("keeps every message as it was sent, with when it arrived", () => {
    const recording = new TelemetryRecording();
    recording.add({ x: 1, y: 2, heading: 0, t: 100, busy: false }, 5000);
    recording.add({ x: 2, y: 2, heading: 0, t: 120, busy: true }, 5020);
    recording.markRunStart();
    expect(recording.summary).toEqual({
      messages: 2,
      seconds: 0.02,
      runs: 1,
      trimmed: false,
    });
    const data = recording.toExport(context());
    expect(data.messages).toEqual([
      { at: 5000, message: { x: 1, y: 2, heading: 0, t: 100, busy: false } },
      { at: 5020, message: { x: 2, y: 2, heading: 0, t: 120, busy: true } },
    ]);
    expect(data.runStarts).toEqual([{ at: 5020, index: 1 }]);
  });

  it("saves the path and only the settings the simulation reads", () => {
    const recording = new TelemetryRecording();
    recording.add({ x: 0, y: 0, heading: 0 }, 0);
    const data = recording.toExport(
      context({
        maxVelocity: 61,
        translationalP: 0.3,
        githubToken: { encrypted: "secret" },
      } as Partial<Settings>),
    );
    expect(data.format).toBe("turtle-tracer-telemetry");
    expect(data.app).toEqual({ name: "Turtle Tracer", version: "9.9.9" });
    expect(data.exportedAt).toBe("2026-10-24T18:00:00.000Z");
    expect(data.project.file).toBe("auto.turt");
    expect(data.project.startPoint).toEqual(context().startPoint);
    expect(data.settings).toMatchObject({
      maxVelocity: 61,
      translationalP: 0.3,
    });
    expect(data.settings).not.toHaveProperty("githubToken");
    expect(data.settings).not.toHaveProperty("theme");
  });

  it("drops the oldest messages past the limit, keeping run starts in step", () => {
    const recording = new TelemetryRecording();
    for (let i = 0; i < MAX_RECORDED; i++) {
      recording.add({ x: i, y: 0, heading: 0 }, i);
      if (i === 5 || i === MAX_RECORDED - 5) recording.markRunStart();
    }
    recording.add({ x: -1, y: 0, heading: 0 }, MAX_RECORDED);
    const data = recording.toExport(context());
    expect(data.messages.length).toBeLessThanOrEqual(MAX_RECORDED);
    expect(data.trimmed).toBe(true);
    expect(data.runStarts).toHaveLength(1);
    expect(data.messages[data.runStarts[0].index].message.x).toBe(
      MAX_RECORDED - 5,
    );
    expect(recording.summary.trimmed).toBe(true);
  });

  it("starts again from nothing when cleared", () => {
    const recording = new TelemetryRecording();
    recording.add({ x: 0, y: 0, heading: 0 }, 0);
    recording.markRunStart();
    recording.clear();
    expect(recording.summary).toEqual({
      messages: 0,
      seconds: 0,
      runs: 0,
      trimmed: false,
    });
  });
});

describe("reading a recording back", () => {
  it("plays back from the robot's first path, with heading in degrees", () => {
    const recording = new TelemetryRecording();
    recording.add({ x: 0, y: 0, heading: 0, t: 1000, busy: false }, 50);
    recording.add(
      { x: 1, y: 0, heading: Math.PI / 2, t: 1020, busy: true },
      70,
    );
    recording.markRunStart();
    recording.add({ x: 2, y: 0, heading: Math.PI, t: 1040, busy: true }, 90);
    const data = JSON.parse(JSON.stringify(recording.toExport(context())));
    expect(isTelemetryExport(data)).toBe(true);
    expect(pointsFromExport(data)).toEqual([
      { time: 1.02, x: 1, y: 0, heading: 90 },
      { time: 1.04, x: 2, y: 0, heading: 180 },
    ]);
  });

  it("reads Panels packets, timed by their timestamp", () => {
    const recording = new TelemetryRecording();
    recording.add(
      { timestamp: 2000, robotPose: { x: 3, y: 4, heading: 0 }, data: {} },
      10,
    );
    recording.add({ data: { status: "no pose" } }, 20);
    const points = pointsFromExport(recording.toExport(context()));
    expect(points).toEqual([{ time: 2, x: 3, y: 4, heading: 0 }]);
  });

  it("isn't fooled by other JSON", () => {
    expect(isTelemetryExport([{ x: 1 }])).toBe(false);
    expect(isTelemetryExport({ format: "something else", messages: [] })).toBe(
      false,
    );
    expect(isTelemetryExport(null)).toBe(false);
  });
});

describe("recordingFileName", () => {
  const now = new Date(2026, 9, 24, 15, 4, 5);
  it("names the file after the project and the time", () => {
    expect(recordingFileName("/a/b/all heading types.turt", now)).toBe(
      "all_heading_types_telemetry_2026-10-24_150405.json",
    );
  });
  it("works with no project file and Windows paths", () => {
    expect(recordingFileName(null, now)).toBe(
      "robot_telemetry_2026-10-24_150405.json",
    );
    expect(recordingFileName(String.raw`C:\paths\auto.pp`, now)).toBe(
      "auto_telemetry_2026-10-24_150405.json",
    );
  });
});
