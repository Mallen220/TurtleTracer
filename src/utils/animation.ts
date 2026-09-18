// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import {
  getCurvePoint,
  easeInOutQuad,
  shortestRotation,
  linearHeadingSweep,
  radiansToDegrees,
  interpolateTFromProfile,
  locateInProfile,
} from "./math";
import { getRobotCorners } from "./geometry";
import type { Point, Line, TimelineEvent, BasePoint } from "../types";
import type { ScaleLinear } from "d3";

export interface RobotState {
  x: number;
  y: number;
  heading: number;
}

type Scale = ScaleLinear<number, number>;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const isMotionEvent = (e: TimelineEvent) =>
  e.type === "travel" || e.type === "wait";

/**
 * Finds the travel or wait event that is happening at `seconds`.
 * Times past the end of the timeline resolve to the last event.
 */
function findMotionEventAt(
  timeline: TimelineEvent[],
  seconds: number,
): TimelineEvent | undefined {
  let found = timeline.at(-1)!;
  let left = 0;
  let right = timeline.length - 1;
  while (left <= right) {
    const mid = (left + right) >> 1;
    const e = timeline[mid];
    if (seconds < e.startTime) {
      right = mid - 1;
    } else if (seconds > e.endTime) {
      left = mid + 1;
    } else {
      found = e;
      break;
    }
  }
  if (isMotionEvent(found)) return found;

  // Macro wrapper events overlap the travel/wait events they contain but have
  // no geometry of their own, so look for the real event underneath.
  return timeline.find(
    (e) => isMotionEvent(e) && seconds >= e.startTime && seconds <= e.endTime,
  );
}

/**
 * Field-space heading (degrees) for linear and constant heading modes at
 * progress `t` along a line. Returns null for modes that depend on geometry.
 */
function getInterpolatedHeading(endPoint: Point, t: number): number | null {
  if (endPoint.heading === "constant") {
    return endPoint.reverse ? endPoint.degrees + 180 : endPoint.degrees;
  }
  if (endPoint.heading !== "linear") return null;

  const { startDeg, endDeg } = endPoint;
  return startDeg + linearHeadingSweep(startDeg, endDeg, endPoint.reverse) * t;
}

/**
 * Calculate the robot's on-screen position and heading at `percent` (0-100)
 * of the way through the timeline.
 */
export function calculateRobotState(
  percent: number,
  timeline: TimelineEvent[],
  lines: Line[],
  startPoint: Point,
  xScale: Scale,
  yScale: Scale,
): RobotState {
  const atStart = {
    x: xScale(startPoint.x),
    y: yScale(startPoint.y),
    heading: 0,
  };

  const lastEvent = timeline?.at(-1);
  if (!lastEvent) return atStart;

  const currentSeconds = (percent / 100) * lastEvent.endTime;
  const event = findMotionEventAt(timeline, currentSeconds);
  if (!event) return atStart;

  if (event.type === "wait") {
    // Turning in place
    const point = event.atPoint ?? startPoint;
    const progress = clamp01(
      (currentSeconds - event.startTime) / event.duration,
    );
    const heading = shortestRotation(
      event.startHeading ?? 0,
      event.targetHeading ?? 0,
      progress,
    );
    return { x: xScale(point.x), y: yScale(point.y), heading: -heading };
  }

  let line = event.line;
  let prevPoint = event.prevPoint;
  if (!line || !prevPoint) {
    const lineIdx = event.lineIndex ?? 0;
    line = lines[lineIdx];
    prevPoint = lineIdx === 0 ? startPoint : lines[lineIdx - 1].endPoint;
  }
  const curve = [prevPoint, ...line.controlPoints, line.endPoint];

  // Where along the line we are (0..1), and the heading if the time
  // calculator produced a heading profile for this segment.
  let linePercent: number;
  let profileHeading: number | null = null;
  const profile = event.motionProfile;
  if (profile && profile.length > 0) {
    const relativeTime = Math.max(0, currentSeconds - event.startTime);
    linePercent = interpolateTFromProfile(relativeTime, profile);

    const headings = event.headingProfile;
    if (headings?.length === profile.length) {
      const { index, fraction } = locateInProfile(relativeTime, profile);
      const hStart = headings[index];
      const hEnd = headings[index + 1];
      if (Number.isFinite(hStart) && Number.isFinite(hEnd)) {
        profileHeading = hStart + (hEnd - hStart) * fraction;
      }
    }
  } else {
    const timeProgress = (currentSeconds - event.startTime) / event.duration;
    linePercent = easeInOutQuad(clamp01(timeProgress));
  }
  linePercent = clamp01(linePercent);

  const posInches = getCurvePoint(linePercent, curve);
  const x = xScale(posInches.x);
  const y = yScale(posInches.y);

  if (profileHeading !== null && Number.isFinite(profileHeading)) {
    return { x, y, heading: -profileHeading };
  }

  const endPoint = line.endPoint;
  const interpolated = getInterpolatedHeading(endPoint, linePercent);
  if (interpolated !== null) return { x, y, heading: -interpolated };

  // Geometric headings are measured in screen space so they respect however
  // the scales flip the axes.
  let target: { x: number; y: number } | null = null;
  let offset = 0;
  if (endPoint.heading === "tangential") {
    const step = endPoint.reverse ? -0.01 : 0.01;
    target = getCurvePoint(linePercent + step, curve);
  } else if (endPoint.heading === "facingPoint") {
    target = { x: endPoint.targetX || 0, y: endPoint.targetY || 0 };
    offset = endPoint.reverse ? Math.PI : 0;
  }

  let heading = 0;
  if (target && (target.x !== posInches.x || target.y !== posInches.y)) {
    const angle = Math.atan2(yScale(target.y) - y, xScale(target.x) - x);
    heading = radiansToDegrees(angle + offset);
  }
  return { x, y, heading };
}

/**
 * Create an animation controller for the robot simulation
 */
export function createAnimationController(
  totalDuration: number,
  onPercentChange: (percent: number) => void,
  onComplete?: () => void,
) {
  const state = {
    playing: false,
    percent: 0,
    accumulatedSeconds: 0,
    lastTimestamp: null as number | null,
    animationFrameId: null as number | null,
    totalDuration,
    loop: true,
    loopRangeActive: false,
    loopMinPercent: 0,
    loopMaxPercent: 100,
  };

  // Set while seekToPercent is running so the frame loop doesn't report a
  // stale percent back over the one being seeked to.
  let isExternalChange = false;
  // The rAF timestamp that corresponds to accumulatedSeconds === 0. Measuring
  // from a fixed origin avoids drift from summing per-frame deltas.
  let absoluteStartTime: number | null = null;

  function notify(percent: number) {
    if (!isExternalChange) onPercentChange(percent);
  }

  function updatePercentFromAccumulated() {
    state.percent =
      state.totalDuration > 0
        ? 100 * clamp01(state.accumulatedSeconds / state.totalDuration)
        : 0;
  }

  function getPlaybackBounds() {
    const { totalDuration, loopRangeActive } = state;
    const startSec = loopRangeActive
      ? (state.loopMinPercent / 100) * totalDuration
      : 0;
    let endSec = loopRangeActive
      ? (state.loopMaxPercent / 100) * totalDuration
      : totalDuration;
    if (endSec <= startSec) endSec = totalDuration;
    return { startSec, endSec };
  }

  function resyncStartTime() {
    if (absoluteStartTime !== null && state.lastTimestamp !== null) {
      absoluteStartTime = state.lastTimestamp - state.accumulatedSeconds * 1000;
    }
  }

  function stop() {
    state.playing = false;
    if (state.animationFrameId !== null) {
      cancelAnimationFrame(state.animationFrameId);
      state.animationFrameId = null;
    }
    state.lastTimestamp = null;
    absoluteStartTime = null;
  }

  function animate(timestamp: number) {
    if (!state.playing) {
      stop();
      return;
    }

    state.animationFrameId = requestAnimationFrame(animate);

    if (absoluteStartTime === null) {
      state.lastTimestamp = timestamp;
      absoluteStartTime = timestamp - state.accumulatedSeconds * 1000;
      return;
    }

    state.lastTimestamp = timestamp;
    state.accumulatedSeconds = (timestamp - absoluteStartTime) / 1000;

    if (state.totalDuration <= 0) {
      state.percent = 0;
      notify(0);
      return;
    }

    const bounds = getPlaybackBounds();
    const startSec = isExternalChange ? 0 : bounds.startSec;
    const endSec = bounds.endSec;

    if (state.loop) {
      if (state.accumulatedSeconds > endSec) {
        state.accumulatedSeconds =
          startSec +
          ((state.accumulatedSeconds - endSec) % (endSec - startSec));
        absoluteStartTime = timestamp - state.accumulatedSeconds * 1000;
      } else if (state.accumulatedSeconds < startSec) {
        state.accumulatedSeconds = startSec;
        absoluteStartTime = timestamp - state.accumulatedSeconds * 1000;
      }
    } else if (state.accumulatedSeconds >= endSec) {
      state.accumulatedSeconds = endSec;
      updatePercentFromAccumulated();
      notify(state.loopRangeActive ? state.loopMaxPercent : 100);
      stop();
      onComplete?.();
      return;
    }

    updatePercentFromAccumulated();
    notify(state.percent);
  }

  function play() {
    if (state.playing) return;

    if (state.totalDuration > 0) {
      const { startSec, endSec } = getPlaybackBounds();
      const pastEnd = state.accumulatedSeconds >= endSec;
      const beforeStart = state.accumulatedSeconds < startSec;
      // Restart from the beginning of the range if we're outside it.
      if (
        (!state.loop && pastEnd) ||
        (state.loopRangeActive && (pastEnd || beforeStart))
      ) {
        state.accumulatedSeconds = startSec;
        updatePercentFromAccumulated();
        notify(state.percent);
      }
    }

    state.playing = true;
    if (state.animationFrameId === null) {
      state.animationFrameId = requestAnimationFrame(animate);
    }
  }

  function pause() {
    if (state.playing) stop();
  }

  return {
    play,
    pause,
    reset() {
      pause();
      state.accumulatedSeconds = 0;
      state.percent = 0;
      notify(0);
    },
    seekToPercent(targetPercent: number) {
      isExternalChange = true;
      const clamped = Math.max(0, Math.min(100, targetPercent));
      state.accumulatedSeconds =
        state.totalDuration > 0 ? (clamped / 100) * state.totalDuration : 0;
      resyncStartTime();
      updatePercentFromAccumulated();
      onPercentChange(clamped);

      setTimeout(() => {
        isExternalChange = false;
      }, 0);
    },
    setDuration(duration: number) {
      // Keep the same relative progress when the duration changes.
      const oldDuration = state.totalDuration;
      state.totalDuration = duration;
      state.accumulatedSeconds =
        oldDuration > 0
          ? (state.accumulatedSeconds / oldDuration) * Math.max(0, duration)
          : Math.min(state.accumulatedSeconds, Math.max(0, duration));
      resyncStartTime();
      updatePercentFromAccumulated();
      notify(state.percent);
    },
    setLoop(loop: boolean) {
      state.loop = loop;
    },
    setPlaybackRange(minPercent: number, maxPercent: number, active: boolean) {
      state.loopRangeActive = active;
      state.loopMinPercent = Math.max(0, Math.min(100, minPercent));
      state.loopMaxPercent = Math.max(0, Math.min(100, maxPercent));
      if (state.loopMaxPercent <= state.loopMinPercent)
        state.loopMaxPercent = 100;
    },
    isPlaying() {
      return state.playing;
    },
    getPercent() {
      updatePercentFromAccumulated();
      return state.percent;
    },
    getDuration() {
      return state.totalDuration;
    },
    isLooping() {
      return state.loop;
    },
  };
}

export type OnionLayer = {
  x: number;
  y: number;
  heading: number;
  corners: BasePoint[];
};

/**
 * Places a robot outline every `spacing` inches along the path so the whole
 * route can be seen at once. Positions and headings are in field inches.
 */
export function generateOnionLayers(
  startPoint: Point,
  lines: Line[],
  robotLength: number,
  robotWidth: number,
  spacing: number = 6,
): OnionLayer[] {
  if (spacing <= 0) return [];

  const layers: OnionLayer[] = [];
  const samplesPerLine = 100;

  let lineStart: Point = startPoint;
  let distanceTravelled = 0;
  let nextLayerDistance = spacing;

  for (const line of lines) {
    const curve = [lineStart, ...line.controlPoints, line.endPoint];
    const endPoint = line.endPoint;
    let prevPos = curve[0];
    let prevT = 0;

    // Walk the curve in small steps, dropping a layer each time we pass
    // another `spacing` inches.
    for (let i = 1; i <= samplesPerLine; i++) {
      const t = i / samplesPerLine;
      const pos = getCurvePoint(t, curve);
      const stepLength = Math.hypot(pos.x - prevPos.x, pos.y - prevPos.y);
      distanceTravelled += stepLength;

      while (distanceTravelled >= nextLayerDistance) {
        const overshoot = distanceTravelled - nextLayerDistance;
        const layerT = prevT + (t - prevT) * (1 - overshoot / stepLength);
        const layerPos = getCurvePoint(layerT, curve);

        let heading = getInterpolatedHeading(endPoint, layerT) ?? 0;
        let target: { x: number; y: number } | null = null;
        let offset = 0;
        if (endPoint.heading === "tangential") {
          const step = endPoint.reverse ? -0.01 : 0.01;
          target = getCurvePoint(Math.min(layerT + step, 1), curve);
        } else if (endPoint.heading === "facingPoint") {
          target = { x: endPoint.targetX || 0, y: endPoint.targetY || 0 };
          offset = endPoint.reverse ? 180 : 0;
        }
        if (target && (target.x !== layerPos.x || target.y !== layerPos.y)) {
          heading =
            radiansToDegrees(
              Math.atan2(target.y - layerPos.y, target.x - layerPos.x),
            ) + offset;
        }

        layers.push({
          x: layerPos.x,
          y: layerPos.y,
          heading,
          corners: getRobotCorners(
            layerPos.x,
            layerPos.y,
            heading,
            robotLength,
            robotWidth,
          ),
        });

        nextLayerDistance += spacing;
      }

      prevPos = pos;
      prevT = t;
    }

    lineStart = endPoint;
  }

  return layers;
}
