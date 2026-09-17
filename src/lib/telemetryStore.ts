// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { writable, derived } from "svelte/store";
import type { TelemetryPacket } from "../types/index";

export interface TelemetryPoint {
  time: number;
  x: number;
  y: number;
  heading: number;
  velocity?: number;
}

export interface TelemetryState {
  status: "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR";
  packet: TelemetryPacket | null;
  fps: number;
}

const initialState: TelemetryState = {
  status: "DISCONNECTED",
  packet: null,
  fps: 0,
};

export const telemetryState = writable<TelemetryState>(initialState);

// Derived stores
export const robotPose = derived(
  telemetryState,
  ($t) => $t.packet?.robotPose || null,
);
export const telemetryLines = derived(
  telemetryState,
  ($t) => $t.packet?.data || {},
);
export const isConnected = derived(
  telemetryState,
  ($t) => $t.status === "CONNECTED",
);
export const fieldOverlay = derived(telemetryState, ($t) => {
  if (!$t.packet?.fieldOverlay) return [];
  if (Array.isArray($t.packet.fieldOverlay)) return $t.packet.fieldOverlay;
  return [$t.packet.fieldOverlay];
});

// Helper variables for FPS calculation
let frameCount = 0;

// Only start interval if in browser environment
if (typeof globalThis !== "undefined") {
  const fpsInterval = setInterval(() => {
    if (frameCount > 0) {
      telemetryState.update((s) => ({ ...s, fps: frameCount }));
      frameCount = 0;
    } else {
      // If connected but no frames, FPS drops to 0
      telemetryState.update((s) => {
        if (s.status === "CONNECTED" && s.fps > 0) return { ...s, fps: 0 };
        return s;
      });
    }
  }, 1000);
  if (
    typeof fpsInterval === "object" &&
    fpsInterval &&
    "unref" in fpsInterval
  ) {
    (fpsInterval as NodeJS.Timeout).unref();
  }
}

export function processTelemetryMessage(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    let packet: TelemetryPacket;

    // Normalize Data
    // Case 1: TurtleTracerLiveView (flat format: { x, y, heading })
    // It doesn't have a timestamp, so synthesize it.
    if (
      typeof parsed.x === "number" &&
      typeof parsed.y === "number" &&
      typeof parsed.heading === "number" &&
      !parsed.robotPose
    ) {
      packet = {
        timestamp: Date.now(),
        robotPose: {
          x: parsed.x,
          y: parsed.y,
          heading: parsed.heading, // Assumed Radians from TurtleTracer logic
        },
        data: { ...parsed },
      };
    } else {
      // Case 2: Standard TelemetryPacket (Panels)
      packet = parsed as TelemetryPacket;
    }

    // Basic validation
    if (typeof packet.timestamp !== "number") {
      packet.timestamp = Date.now();
    }

    telemetryState.update((s) => ({
      ...s,
      packet,
    }));

    // Update live stream history (used by live telemetry features only)
    if (packet.robotPose) {
      const pt: TelemetryPoint = {
        time: packet.timestamp / 1000,
        x: packet.robotPose.x,
        y: packet.robotPose.y,
        heading: (packet.robotPose.heading * 180) / Math.PI,
      };
      liveTelemetryData.update((current) => {
        if (!current) return [pt];
        // Limit history size?
        if (current.length > 5000) return [...current.slice(1), pt];
        return [...current, pt];
      });
    }

    frameCount++;
  } catch (e) {
    console.warn("Failed to parse telemetry message:", e);
  }
}

export function setStatus(status: TelemetryState["status"]) {
  telemetryState.update((s) => ({ ...s, status }));
}

// UI Preference Stores
export const showTelemetry = writable<boolean>(true);
export const showTelemetryGhost = writable<boolean>(true);
export const telemetryOffset = writable<number>(0);
export const liveTelemetryData = writable<TelemetryPoint[] | null>(null);
export const importedTelemetryData = writable<TelemetryPoint[] | null>(null);

// Backward-compatible alias for older references. Prefer importedTelemetryData.
export const telemetryData = importedTelemetryData;

/**
 * Calculates ghost robot pose at the current playback time from imported telemetry data.
 */
export function calculateTelemetryGhostState(
  importedData: TelemetryPoint[] | null,
  isVisible: boolean,
  totalTime: number,
  percent: number,
  offset = 0,
): { x: number; y: number; heading: number } | null {
  if (!importedData || importedData.length === 0 || !isVisible) {
    return null;
  }
  const baseTime = importedData[0].time;
  const playbackTime = totalTime > 0 ? (percent / 100) * totalTime : 0;
  const targetTime = baseTime + playbackTime + offset;
  let target = importedData[0];
  for (const pt of importedData) {
    if (pt.time >= targetTime) {
      target = pt;
      break;
    }
  }
  return { x: target.x, y: target.y, heading: target.heading };
}
