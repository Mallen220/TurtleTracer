// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { get } from "svelte/store";

import {
  telemetryState,
  robotPose,
  telemetryLines,
  isConnected,
  fieldOverlay,
  processTelemetryMessage,
  setStatus,
  liveTelemetryData,
  motionSampleOf,
  liveTrail,
  liveRunStarts,
  clearLiveTrail,
  recording,
  recordingSummary,
  clearRecording,
} from "./telemetryStore";
import { calibrationState, resetCalibration } from "./motionCalibration";

describe("telemetryStore", () => {
  beforeEach(() => {
    telemetryState.set({ status: "DISCONNECTED", packet: null, fps: 0 });
    liveTelemetryData.set(null);
  });

  it("should have initial state", () => {
    const state = get(telemetryState);
    expect(state.status).toBe("DISCONNECTED");
    expect(state.packet).toBeNull();
    expect(state.fps).toBe(0);
  });

  it("should update status", () => {
    setStatus("CONNECTED");
    expect(get(telemetryState).status).toBe("CONNECTED");
    expect(get(isConnected)).toBe(true);
  });

  it("should process standard telemetry packet correctly", () => {
    const packet = {
      timestamp: 1000,
      robotPose: { x: 10, y: 20, heading: Math.PI },
      data: { some: "line" },
    };

    processTelemetryMessage(JSON.stringify(packet));

    const state = get(telemetryState);
    expect(state.packet).toMatchObject({ timestamp: 1000 });

    // Check derived stores
    expect(get(robotPose)).toEqual({ x: 10, y: 20, heading: Math.PI });
    expect(get(telemetryLines)).toEqual({ some: "line" });

    // Check live telemetry history
    const history = get(liveTelemetryData);
    expect(history).not.toBeNull();
    expect(history?.[0]).toMatchObject({ x: 10, y: 20, heading: 180 }); // Math.PI rads = 180 deg
  });

  it("should process TurtleTracerLiveView flat format correctly", () => {
    const flatData = {
      x: 5,
      y: 15,
      heading: Math.PI / 2,
    };

    processTelemetryMessage(JSON.stringify(flatData));

    const state = get(telemetryState);
    expect(state.packet?.robotPose).toEqual(flatData);
    expect(typeof state.packet?.timestamp).toBe("number"); // Auto-generated
  });

  it("should ignore invalid JSON silently without crashing", () => {
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    processTelemetryMessage("invalid-json");
    expect(consoleWarnSpy).toHaveBeenCalled();
    const state = get(telemetryState);
    expect(state.packet).toBeNull();
  });

  it("should correctly handle fieldOverlay derived store", () => {
    const packetWithOverlay = {
      timestamp: 123,
      fieldOverlay: [{ type: "point", x: 1, y: 1 }],
    };
    processTelemetryMessage(JSON.stringify(packetWithOverlay));

    expect(get(fieldOverlay)).toEqual([{ type: "point", x: 1, y: 1 }]);

    // Test coercion to array
    const packetWithSingleOverlay = {
      timestamp: 124,
      fieldOverlay: { type: "line", x: 2, y: 2 },
    };
    processTelemetryMessage(JSON.stringify(packetWithSingleOverlay));
    expect(get(fieldOverlay)).toEqual([{ type: "line", x: 2, y: 2 }]);
  });
});

describe("measuring the robot from telemetry", () => {
  beforeEach(() => resetCalibration());

  it("reads the robot clock, Pedro's velocity, busy state and path point", () => {
    const parsed = {
      x: 1,
      y: 2,
      heading: 0.5,
      t: 1500,
      vx: 3,
      vy: -4,
      omega: 0.2,
      busy: true,
      cx: 1.5,
      cy: 2.5,
      tx: 0,
      ty: 1,
      pathIndex: 2,
    };
    const packet = {
      timestamp: 99,
      robotPose: { x: 1, y: 2, heading: 0.5 },
      data: {},
    };
    expect(motionSampleOf(parsed, packet, 99_000)).toEqual({
      sample: {
        t: 1.5,
        x: 1,
        y: 2,
        heading: 0.5,
        vx: 3,
        vy: -4,
        omega: 0.2,
        busy: true,
        cx: 1.5,
        cy: 2.5,
        tx: 0,
        ty: 1,
        pathIndex: 2,
      },
      timeSource: "robot",
    });
  });

  it("falls back to the arrival time and skips packets without a pose", () => {
    const packet = {
      timestamp: 5,
      robotPose: { x: 1, y: 2, heading: 0 },
      data: {},
    };
    const motion = motionSampleOf({ x: 1, y: 2, heading: 0 }, packet, 2000);
    expect(motion?.timeSource).toBe("arrival");
    expect(motion?.sample.t).toBe(2);
    expect(motion?.sample.busy).toBeUndefined();
    expect(motionSampleOf({}, { timestamp: 5, data: {} }, 2000)).toBeNull();
  });

  it("takes a Panels timestamp as the robot's clock", () => {
    const packet = {
      timestamp: 4000,
      robotPose: { x: 0, y: 0, heading: 0 },
      data: {},
    };
    expect(motionSampleOf(packet, packet, 9000)?.timeSource).toBe("robot");
  });

  it("feeds every pose into the measurement", () => {
    vi.useFakeTimers();
    try {
      for (let i = 0; i < 10; i++) {
        processTelemetryMessage(
          JSON.stringify({ x: i, y: 0, heading: 0, t: i * 20 }),
        );
      }
      vi.advanceTimersByTime(300);
      const state = get(calibrationState);
      expect(state.sampleCount).toBe(10);
      expect(state.timeSource).toBe("robot");
      expect(state.trace.length).toBeGreaterThan(0);
      // 1 inch every 20 ms
      expect(state.trace[0].speed).toBeCloseTo(50);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the robot's live run", () => {
  beforeEach(() => clearLiveTrail());

  const send = (t: number, x: number, busy: boolean) =>
    processTelemetryMessage(JSON.stringify({ x, y: 0, heading: 0, t, busy }));

  it("counts the robot starting its first path, and draws its route from there", () => {
    const before = get(liveRunStarts);
    send(0, 0, false);
    send(20, 0, false);
    send(40, 1, true);
    send(60, 2, true);
    expect(get(liveRunStarts)).toBe(before + 1);
    expect(get(liveTrail)).toEqual([
      [
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
    ]);

    clearLiveTrail();
    expect(get(liveTrail)).toEqual([]);
  });

  it("records every message, marking where the run started", () => {
    clearRecording();
    send(0, 0, false);
    send(20, 0, true);
    processTelemetryMessage("not json");
    const data = recording.toExport({
      file: null,
      startPoint: { x: 0, y: 0, heading: "constant", degrees: 0 },
      lines: [],
      sequence: [],
      shapes: [],
      settings: {} as any,
      appVersion: "test",
    });
    expect(data.messages.map((m) => m.message)).toEqual([
      { x: 0, y: 0, heading: 0, t: 0, busy: false },
      { x: 0, y: 0, heading: 0, t: 20, busy: true },
    ]);
    expect(data.runStarts.map((r) => r.index)).toEqual([1]);
    expect(get(recordingSummary)).toMatchObject({ messages: 2, runs: 1 });

    clearRecording();
    expect(get(recordingSummary).messages).toBe(0);
  });
});
