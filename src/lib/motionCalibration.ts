// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Live measurement of the connected robot's motion. Every pose from the
// telemetry stream goes through a recorder; the events it finds, and the
// recent speed for the chart, are published a few times a second.

import { writable } from "svelte/store";
import { MotionRecorder } from "../utils/calibration/recorder";
import type { MotionEvent } from "../utils/calibration/events";
import type { RawSample } from "../utils/calibration/samples";
import type { TimeSource } from "../utils/calibration/estimates";

interface CalibrationSnapshot {
  sampleCount: number;
  /** Where the latest sample times came from, or null before any. */
  timeSource: TimeSource | null;
  /** Whether the robot sends Pedro's busy state. */
  hasBusy: boolean;
  events: MotionEvent[];
  /** Speed (in/s) over the last few seconds, oldest first. */
  trace: { t: number; speed: number }[];
}

/** Seconds of speed kept for the chart. */
export const TRACE_SECONDS = 10;
const PUBLISH_MS = 250;

const empty = (): CalibrationSnapshot => ({
  sampleCount: 0,
  timeSource: null,
  hasBusy: false,
  events: [],
  trace: [],
});

export const calibrationState = writable<CalibrationSnapshot>(empty());

let recorder: MotionRecorder | null = null;
/** Events from recorders replaced when the time source changed. */
let earlier: MotionEvent[] = [];
let sampleCount = 0;
let hasBusy = false;
let trace: { t: number; speed: number }[] = [];
let publishTimer: ReturnType<typeof setTimeout> | null = null;

function publish() {
  publishTimer = null;
  calibrationState.set({
    sampleCount,
    timeSource: recorder?.timeSource ?? null,
    hasBusy,
    events: [...earlier, ...(recorder?.events ?? [])],
    trace: [...trace],
  });
}

function schedulePublish() {
  publishTimer ??= setTimeout(publish, PUBLISH_MS);
}

/** Adds one pose from the robot. */
export function ingestMotion(sample: RawSample, timeSource: TimeSource) {
  if (recorder?.timeSource !== timeSource) {
    // The two clocks don't line up, so start a new stream.
    if (recorder) {
      recorder.finish();
      earlier = [...earlier, ...recorder.events];
    }
    recorder = new MotionRecorder(timeSource);
    trace = [];
  }
  sampleCount++;
  if (sample.busy !== undefined) hasBusy = true;
  for (const s of recorder.push(sample)) {
    // The chart restarts if the clock jumped (a new stream).
    if (trace.length > 0 && s.t < trace.at(-1)!.t) trace = [];
    trace.push({ t: s.t, speed: s.speed });
  }
  const newest = trace.at(-1)?.t;
  if (newest !== undefined) {
    const cut = trace.findIndex((p) => p.t >= newest - TRACE_SECONDS);
    if (cut > 0) trace = trace.slice(cut);
  }
  schedulePublish();
}

/** Forgets everything measured so far. */
export function resetCalibration() {
  if (publishTimer) clearTimeout(publishTimer);
  recorder = null;
  earlier = [];
  sampleCount = 0;
  hasBusy = false;
  trace = [];
  publish();
}
