// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { writable, derived } from "svelte/store";
import type { TelemetryPacket } from "../types/index";
import { ingestMotion } from "./motionCalibration";
import type { RawSample } from "../utils/calibration/samples";
import type { TimeSource } from "../utils/calibration/estimates";
import { LiveRun } from "../utils/liveRun";
import {
  TelemetryRecording,
  type RecordingSummary,
} from "../utils/telemetryRecording";

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
    // The last messages of a burst arrive too soon after the previous update to show.
    publishRecording(true);
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

const numberOr = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

/**
 * The pose and motion in a message, for measuring the robot. TurtleTracerLib
 * sends its clock as `t` (ms) and, with a follower, Pedro's velocity and busy
 * state, and while following a path the closest point on it (`cx`, `cy`),
 * the path's direction there (`tx`, `ty`) and `pathIndex`. Panels packets
 * carry a `timestamp`. Without either, the time it arrived is used.
 */
export function motionSampleOf(
  parsed: Record<string, unknown>,
  packet: TelemetryPacket,
  arrivedAt: number,
): { sample: RawSample; timeSource: TimeSource } | null {
  const pose = packet.robotPose;
  if (
    !pose ||
    !Number.isFinite(pose.x) ||
    !Number.isFinite(pose.y) ||
    !Number.isFinite(pose.heading)
  ) {
    return null;
  }
  const robotMs = numberOr(parsed.t) ?? numberOr(parsed.timestamp);
  return {
    sample: {
      t: (robotMs ?? arrivedAt) / 1000,
      x: pose.x,
      y: pose.y,
      heading: pose.heading,
      vx: numberOr(parsed.vx),
      vy: numberOr(parsed.vy),
      omega: numberOr(parsed.omega),
      busy: typeof parsed.busy === "boolean" ? parsed.busy : undefined,
      cx: numberOr(parsed.cx),
      cy: numberOr(parsed.cy),
      tx: numberOr(parsed.tx),
      ty: numberOr(parsed.ty),
      pathIndex: numberOr(parsed.pathIndex),
    },
    timeSource: robotMs === undefined ? "arrival" : "robot",
  };
}

export function processTelemetryMessage(raw: string) {
  try {
    const arrivedAt = Date.now();
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      recording.add(parsed, arrivedAt);
      publishRecording();
    }
    let packet: TelemetryPacket;

    // Normalize Data
    // Case 1: TurtleTracerLiveView (flat format: { x, y, heading, t? })
    // Its `t` is the robot clock, so the packet is stamped on arrival.
    if (
      typeof parsed.x === "number" &&
      typeof parsed.y === "number" &&
      typeof parsed.heading === "number" &&
      !parsed.robotPose
    ) {
      packet = {
        timestamp: arrivedAt,
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
      packet.timestamp = arrivedAt;
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

    const motion = motionSampleOf(parsed, packet, arrivedAt);
    if (motion) {
      ingestMotion(motion.sample, motion.timeSource);
      trackRun(motion.sample);
    }

    frameCount++;
  } catch (e) {
    console.warn("Failed to parse telemetry message:", e);
  }
}

const liveRun = new LiveRun();
let publishedTrail = liveRun.version;

/** The route the robot has driven since its run started, in inches. */
export const liveTrail = writable<{ x: number; y: number }[][]>([]);
/** Counts the times the robot has started the first path of an OpMode. */
export const liveRunStarts = writable(0);

function trackRun(sample: RawSample) {
  if (liveRun.push(sample)) {
    liveRunStarts.update((n) => n + 1);
    recording.markRunStart();
    publishRecording(true);
  }
  if (liveRun.version === publishedTrail) return;
  publishedTrail = liveRun.version;
  liveTrail.set([...liveRun.trail]);
}

export function clearLiveTrail() {
  liveRun.reset();
  publishedTrail = liveRun.version;
  liveTrail.set([]);
}

/** Everything received while connected, for exporting. */
export const recording = new TelemetryRecording();
/** How much has been recorded, updated a few times a second. */
export const recordingSummary = writable<RecordingSummary>(recording.summary);
const RECORDING_PUBLISH_MS = 250;
let recordingPublishedAt = 0;

function publishRecording(now = false) {
  const time = Date.now();
  if (!now && time - recordingPublishedAt < RECORDING_PUBLISH_MS) return;
  recordingPublishedAt = time;
  recordingSummary.set(recording.summary);
}

export function clearRecording() {
  recording.clear();
  publishRecording(true);
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
