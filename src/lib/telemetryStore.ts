// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { writable, derived } from "svelte/store";
import type {
  TelemetryPacket,
  RobotPose,
  FieldOperation,
} from "../types/index";

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
if (typeof window !== "undefined") {
  setInterval(() => {
    if (frameCount > 0) {
      telemetryState.update((s) => ({ ...s, fps: frameCount }));
      frameCount = 0;
    } else {
        // If connected but no frames, FPS drops to 0
        telemetryState.update(s => {
            if (s.status === 'CONNECTED' && s.fps > 0) return { ...s, fps: 0 };
            return s;
        });
    }
  }, 1000);
}

export function processTelemetryMessage(raw: string) {
  try {
    const packet: TelemetryPacket = JSON.parse(raw);
    // Basic validation
    if (typeof packet.timestamp !== "number") {
      // console.warn('Invalid telemetry packet: missing timestamp');
      // Relax validation for now or check other fields
    }

    telemetryState.update((s) => ({
      ...s,
      packet,
    }));

    // Update history
    if (packet.robotPose) {
      const pt: TelemetryPoint = {
        time: packet.timestamp / 1000,
        x: packet.robotPose.x,
        y: packet.robotPose.y,
        heading: (packet.robotPose.heading * 180) / Math.PI,
      };
      telemetryData.update((current) => {
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
export const telemetryData = writable<TelemetryPoint[] | null>(null);
