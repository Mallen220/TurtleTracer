// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import {
  getCurvePoint,
  easeInOutQuad,
  shortestRotation,
  radiansToDegrees,
} from "./math";
import { getRobotCorners } from "./geometry";
import type { Point, Line, TimelineEvent, BasePoint } from "../types";
import type { ScaleLinear } from "d3";

export interface RobotState {
  x: number;
  y: number;
  heading: number;
}

type AnimationState = {
  playing: boolean;
  percent: number;
  accumulatedSeconds: number;
  lastTimestamp: number | null;
  animationFrameId: number | null;
  totalDuration: number;
  loop: boolean;
};

/**
 * Calculate the robot position and heading based on the Timeline
 */
export function calculateRobotState(
  percent: number,
  timeline: TimelineEvent[],
  lines: Line[],
  startPoint: Point,
  xScale: ScaleLinear<number, number>,
  yScale: ScaleLinear<number, number>,
): RobotState {
  if (!timeline || timeline.length === 0) {
    return { x: xScale(startPoint.x), y: yScale(startPoint.y), heading: 0 };
  }

  // Calculate current time in seconds based on percent (0-100)
  const totalDuration = timeline[timeline.length - 1].endTime;
  const currentSeconds = (percent / 100) * totalDuration;

  // Find the active event for this time
  const activeEvent =
    timeline.find(
      (e) => currentSeconds >= e.startTime && currentSeconds <= e.endTime,
    ) || timeline[timeline.length - 1];

  if (activeEvent.type === "wait") {
    // --- STATIONARY ROTATION ---
    const point = activeEvent.atPoint!;

    // Calculate progress (0.0 to 1.0) within this specific wait event
    const eventProgress =
      (currentSeconds - activeEvent.startTime) / activeEvent.duration;
    const clampedProgress = Math.max(0, Math.min(1, eventProgress));

    // Interpolate heading smoothly
    const currentHeading = shortestRotation(
      activeEvent.startHeading!,
      activeEvent.targetHeading!,
      clampedProgress,
    );

    // Note: We use negative heading for visualizer (SVG/CSS rotation is CW, Math is usually CCW)
    return {
      x: xScale(point.x),
      y: yScale(point.y),
      heading: -currentHeading,
    };
  } else {
    // --- MOVEMENT TRAVEL ---
    const lineIdx = activeEvent.lineIndex!;
    const currentLine = lines[lineIdx];
    const prevPoint = lineIdx === 0 ? startPoint : lines[lineIdx - 1].endPoint;

    let linePercent = 0;
    let interpolatedHeading: number | null = null;

    // Use detailed motion profile if available
    if (activeEvent.motionProfile && activeEvent.motionProfile.length > 0) {
      const profile = activeEvent.motionProfile;
      const relativeTime = Math.max(0, currentSeconds - activeEvent.startTime);
      const profileEndTime = profile[profile.length - 1];

      if (relativeTime >= profileEndTime) {
        // If we exceeded the profile (e.g. rotation time extended the segment), we are at the end
        linePercent = 1;
        if (
          activeEvent.headingProfile &&
          activeEvent.headingProfile.length > 0
        ) {
          interpolatedHeading =
            activeEvent.headingProfile[activeEvent.headingProfile.length - 1];
        }
      } else {
        // Find the segment in the profile
        // Ensure i stops at length - 2 so i+1 is valid
        let i = 0;
        while (i < profile.length - 2 && relativeTime > profile[i + 1]) {
          i++;
        }

        // Interpolate t
        const tStart = i / (profile.length - 1);
        const tEnd = (i + 1) / (profile.length - 1);
        const timeStart = profile[i];
        const timeEnd = profile[i + 1];

        let localProgress = 0;
        if (timeEnd > timeStart) {
          localProgress = (relativeTime - timeStart) / (timeEnd - timeStart);
        }

        linePercent = tStart + localProgress * (tEnd - tStart);

        // Use detailed heading profile if available and we are using motion profile
        if (
          activeEvent.headingProfile &&
          activeEvent.headingProfile.length === profile.length
        ) {
          const hStart = activeEvent.headingProfile[i];
          const hEnd = activeEvent.headingProfile[i + 1];
          // Linear interpolation of unwrapped heading
          if (Number.isFinite(hStart) && Number.isFinite(hEnd)) {
            interpolatedHeading = hStart + (hEnd - hStart) * localProgress;
          }
        }
      }
    } else {
      // Fallback to linear time interpolation
      const timeProgress =
        (currentSeconds - activeEvent.startTime) / activeEvent.duration;
      linePercent = easeInOutQuad(Math.max(0, Math.min(1, timeProgress)));
    }

    linePercent = Math.max(0, Math.min(1, linePercent));

    // Calculate Position
    const robotInchesXY = getCurvePoint(linePercent, [
      prevPoint,
      ...currentLine.controlPoints,
      currentLine.endPoint,
    ]);

    const robotXY = { x: xScale(robotInchesXY.x), y: yScale(robotInchesXY.y) };
    let robotHeading = 0;

    if (interpolatedHeading !== null && Number.isFinite(interpolatedHeading)) {
      robotHeading = -interpolatedHeading;
    } else {
      // Fallback Heading Calculation
      switch (currentLine.endPoint.heading) {
        case "linear":
          robotHeading = -shortestRotation(
            currentLine.endPoint.startDeg,
            currentLine.endPoint.endDeg,
            linePercent,
          );
          break;
        case "constant":
          robotHeading = -currentLine.endPoint.degrees;
          break;
        case "tangential":
          const nextPointInches = getCurvePoint(
            linePercent + (currentLine.endPoint.reverse ? -0.01 : 0.01),
            [prevPoint, ...currentLine.controlPoints, currentLine.endPoint],
          );
          const nextPoint = {
            x: xScale(nextPointInches.x),
            y: yScale(nextPointInches.y),
          };
          const dx = nextPoint.x - robotXY.x;
          const dy = nextPoint.y - robotXY.y;

          if (dx !== 0 || dy !== 0) {
            const angle = Math.atan2(dy, dx);
            robotHeading = radiansToDegrees(angle);
          }
          break;
      }
    }

    return {
      x: robotXY.x,
      y: robotXY.y,
      heading: robotHeading,
    };
  }
}

/**
 * Create an animation controller for the robot simulation
 */
export function createAnimationController(
  totalDuration: number,
  onPercentChange: (percent: number) => void,
  onComplete?: () => void,
) {
  const state: AnimationState = {
    playing: false,
    percent: 0,
    accumulatedSeconds: 0, // total elapsed seconds (not tied to a single startTime)
    lastTimestamp: null, // last rAF timestamp seen while playing
    animationFrameId: null,
    totalDuration,
    loop: true,
  };

  let isExternalChange = false;

  function updatePercentFromAccumulated() {
    if (state.totalDuration > 0) {
      const rawPercent = (state.accumulatedSeconds / state.totalDuration) * 100;
      // clamp between 0 and 100 for non-looping; for looping we'll handle wrapping separately
      state.percent = Math.max(0, Math.min(100, rawPercent));
    } else {
      state.percent = 0;
    }
  }

  function animate(timestamp: number) {
    // If we aren't playing anymore, ensure we don't schedule anything further.
    if (!state.playing) {
      state.lastTimestamp = null;
      state.animationFrameId = null;
      return;
    }

    // Initialize lastTimestamp on first tick after play
    if (state.lastTimestamp === null) {
      state.lastTimestamp = timestamp;
      state.animationFrameId = requestAnimationFrame(animate);
      return;
    }

    // Compute delta time since last frame (in seconds)
    const deltaSeconds = (timestamp - state.lastTimestamp) / 1000;
    state.lastTimestamp = timestamp;

    // Advance accumulated time
    state.accumulatedSeconds += deltaSeconds;

    if (state.totalDuration > 0) {
      if (state.loop) {
        // For looping, wrap accumulatedSeconds so it doesn't grow unbounded.
        // Use modulo to allow continuous time even for large deltas.
        state.accumulatedSeconds =
          state.accumulatedSeconds % state.totalDuration;
        updatePercentFromAccumulated();
        if (!isExternalChange) onPercentChange(state.percent);
        // keep animating
        state.animationFrameId = requestAnimationFrame(animate);
      } else {
        // Not looping: clamp to duration and stop when done
        if (state.accumulatedSeconds >= state.totalDuration) {
          state.accumulatedSeconds = state.totalDuration;
          updatePercentFromAccumulated();
          if (!isExternalChange) onPercentChange(100);
          state.playing = false;
          state.lastTimestamp = null;
          if (state.animationFrameId) {
            cancelAnimationFrame(state.animationFrameId);
            state.animationFrameId = null;
          }
          if (onComplete) onComplete();
          return;
        } else {
          updatePercentFromAccumulated();
          if (!isExternalChange) onPercentChange(state.percent);
          state.animationFrameId = requestAnimationFrame(animate);
        }
      }
    } else {
      // duration is zero or invalid
      state.percent = 0;
      if (!isExternalChange) onPercentChange(state.percent);
      state.animationFrameId = requestAnimationFrame(animate);
    }
  }

  function play() {
    // If already playing, nothing to do
    if (state.playing) return;

    // If at the very end and not looping, reset to start so play restarts
    if (
      !state.loop &&
      state.totalDuration > 0 &&
      state.accumulatedSeconds >= state.totalDuration
    ) {
      state.accumulatedSeconds = 0;
      state.percent = 0;
      if (!isExternalChange) onPercentChange(0);
    }

    state.playing = true;
    // schedule the loop if not already scheduled
    if (state.animationFrameId === null) {
      state.lastTimestamp = null; // ensure animate initializes its timestamp properly
      state.animationFrameId = requestAnimationFrame(animate);
    }
  }

  function pause() {
    if (!state.playing) return;
    state.playing = false;
    // cancel outstanding rAF if any
    if (state.animationFrameId !== null) {
      cancelAnimationFrame(state.animationFrameId);
      state.animationFrameId = null;
    }
    state.lastTimestamp = null;
  }

  function reset() {
    state.accumulatedSeconds = 0;
    state.percent = 0;
    state.lastTimestamp = null;
    if (!isExternalChange) onPercentChange(0);
  }

  return {
    play,
    pause,
    reset() {
      pause();
      reset();
    },
    seekToPercent(targetPercent: number) {
      isExternalChange = true;
      const clamped = Math.max(0, Math.min(100, targetPercent));
      if (state.totalDuration > 0) {
        state.accumulatedSeconds = (clamped / 100) * state.totalDuration;
      } else {
        state.accumulatedSeconds = 0;
      }
      updatePercentFromAccumulated();
      onPercentChange(clamped);

      // If playing, we keep animating; lastTimestamp will sync on next tick
      // Clear the external flag immediately so normal anim ticks resume updating.
      // Use setTimeout(..., 0) so this call does not interrupt the current stack where this may be called
      setTimeout(() => {
        isExternalChange = false;
      }, 0);
    },
    setDuration(duration: number) {
      // If duration changes, keep current progress proportionally if possible
      const oldDuration = state.totalDuration;
      if (oldDuration > 0) {
        const progress = state.accumulatedSeconds / oldDuration;
        state.totalDuration = duration;
        state.accumulatedSeconds = progress * Math.max(0, duration);
      } else {
        state.totalDuration = duration;
        state.accumulatedSeconds = Math.min(
          state.accumulatedSeconds,
          Math.max(0, duration),
        );
      }
      updatePercentFromAccumulated();
      if (!isExternalChange) onPercentChange(state.percent);
    },
    setLoop(loop: boolean) {
      state.loop = loop;
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

/**
 * Generate ghost path points that trace the robot's swept area along its path.
 * Considers robot length, width, and rotation to create a correct envelope.
 * @param startPoint - The starting point of the path
 * @param lines - The path lines to trace
 * @param robotLength - Robot length in inches
 * @param robotWidth - Robot width in inches
 * @param samples - Number of samples (default 200)
 * @returns Array of points forming the boundary of the robot's swept path
 */
export function generateGhostPathPoints(
  startPoint: Point,
  lines: Line[],
  robotLength: number,
  robotWidth: number,
  samples: number = 200,
): BasePoint[] {
  if (lines.length === 0) return [];

  const leftRail: BasePoint[] = [];
  const rightRail: BasePoint[] = [];

  let currentLineStart = startPoint;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const curvePoints = [
      currentLineStart,
      ...line.controlPoints,
      line.endPoint,
    ];

    // Sample along this line segment
    // Increase minimum samples to ensure smooth curves
    const samplesPerLine = Math.max(20, Math.ceil(samples / lines.length));

    for (let i = 0; i <= samplesPerLine; i++) {
      const t = i / samplesPerLine;
      const pos = getCurvePoint(t, curvePoints);

      // Calculate tangent/normal to the path
      // Tangent is velocity direction. Normal is perpendicular to left.
      // Use small epsilon for numerical derivative
      const epsilon = 0.01;
      const t1 = Math.max(0, t - epsilon);
      const t2 = Math.min(1, t + epsilon);

      const p1 = getCurvePoint(t1, curvePoints);
      const p2 = getCurvePoint(t2, curvePoints);
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Normal vector (pointing to the "Left" of the path motion)
      // Screen coords: X Right, Y Down.
      // If moving Right (1,0), Left is Up (0, -1).
      // (-dy, dx)? If dx=1, dy=0 => (0, 1) -> Down. Incorrect.
      // (dy, -dx)? If dx=1, dy=0 => (0, -1) -> Up. Correct.
      let nx = 0;
      let ny = 0;

      if (dist > 1e-6) {
        nx = dy / dist;
        ny = -dx / dist;
      }

      // Calculate Heading
      let heading = 0;
      if (line.endPoint.heading === "linear") {
        heading = -shortestRotation(
          line.endPoint.startDeg,
          line.endPoint.endDeg,
          t,
        );
      } else if (line.endPoint.heading === "constant") {
        heading = -line.endPoint.degrees;
      } else if (line.endPoint.heading === "tangential") {
        // Tangential heading
        // Look ahead/behind slightly
        const lookAheadT = Math.min(t + 0.01, 1);
        const lookPos = getCurvePoint(lookAheadT, curvePoints);
        // If reverse, we are looking effectively "back" relative to motion?
        // Actually, if reverse=true, the robot backs into the path.
        // Its heading is 180 + angle.
        // We use the same logic as calculateRobotState for consistency.
        let tdx = lookPos.x - pos.x;
        let tdy = lookPos.y - pos.y;

        // At the very end (t=1), lookPos == pos, so tdx=0.
        // Fallback to looking back
        if (tdx === 0 && tdy === 0) {
             const lookBackT = Math.max(t - 0.01, 0);
             const prevPos = getCurvePoint(lookBackT, curvePoints);
             tdx = pos.x - prevPos.x;
             tdy = pos.y - prevPos.y;
        }

        if (tdx !== 0 || tdy !== 0) {
          const angle = Math.atan2(tdy, tdx);
          heading = radiansToDegrees(angle);
        }

        if (line.endPoint.reverse) heading += 180;
      }

      // Get robot corners for this position and heading
      const corners = getRobotCorners(
        pos.x,
        pos.y,
        heading,
        robotLength,
        robotWidth,
      );

      // Find extreme points along the Normal axis
      // Left-most point maximizes dot product with Normal
      // Right-most point minimizes dot product with Normal
      let maxDot = -Infinity;
      let minDot = Infinity;
      let leftCorner = corners[0];
      let rightCorner = corners[0];

      for (const c of corners) {
        // Dot product of (Corner - Center) and Normal
        // We can just use Corner . Normal since Center . Normal is constant for all corners
        const dot = c.x * nx + c.y * ny;

        if (dot > maxDot) {
          maxDot = dot;
          leftCorner = c;
        }
        if (dot < minDot) {
          minDot = dot;
          rightCorner = c;
        }
      }

      leftRail.push(leftCorner);
      rightRail.push(rightCorner);
    }

    currentLineStart = line.endPoint;
  }

  if (leftRail.length === 0) return [];

  // Construct the closed polygon
  const result: BasePoint[] = [...leftRail];
  for (let i = rightRail.length - 1; i >= 0; i--) {
    result.push(rightRail[i]);
  }

  // Filter nearby points to reduce vertex count
  const filtered: BasePoint[] = [];
  const threshold = 0.05; // 0.05 inches

  for (const p of result) {
    if (filtered.length === 0) {
      filtered.push(p);
    } else {
      const last = filtered[filtered.length - 1];
      const d = Math.abs(p.x - last.x) + Math.abs(p.y - last.y);
      if (d > threshold) {
        filtered.push(p);
      }
    }
  }

  // Ensure closure
  if (filtered.length >= 3) {
      const first = filtered[0];
      const last = filtered[filtered.length - 1];
      const d = Math.abs(first.x - last.x) + Math.abs(first.y - last.y);
      if (d > threshold) {
          filtered.push({x: first.x, y: first.y});
      }
  }

  return filtered;
}

/**
 * Generate onion layer robot bodies at regular intervals along the path
 * Returns an array of robot states (position, heading, and corner points) for drawing
 * @param startPoint - The starting point of the path
 * @param lines - The path lines to trace
 * @param robotLength - Robot length in inches
 * @param robotWidth - Robot width in inches
 * @param spacing - Distance in inches between each robot trace (default 6)
 * @returns Array of robot states with corner points for rendering
 */
export function generateOnionLayers(
  startPoint: Point,
  lines: Line[],
  robotLength: number,
  robotWidth: number,
  spacing: number = 6,
): Array<{ x: number; y: number; heading: number; corners: BasePoint[] }> {
  if (lines.length === 0) return [];

  const layers: Array<{
    x: number;
    y: number;
    heading: number;
    corners: BasePoint[];
  }> = [];

  // Calculate total path length
  let totalLength = 0;
  let currentLineStart = startPoint;

  for (const line of lines) {
    const curvePoints = [
      currentLineStart,
      ...line.controlPoints,
      line.endPoint,
    ];

    // Approximate line length by sampling
    const samples = 100;
    let lineLength = 0;
    let prevPos = curvePoints[0];

    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      const pos = getCurvePoint(t, curvePoints);
      const dx = pos.x - prevPos.x;
      const dy = pos.y - prevPos.y;
      lineLength += Math.sqrt(dx * dx + dy * dy);
      prevPos = pos;
    }

    totalLength += lineLength;
    currentLineStart = line.endPoint;
  }

  // Calculate number of layers based on spacing
  const numLayers = Math.max(1, Math.floor(totalLength / spacing));

  // Sample robot positions at regular intervals
  currentLineStart = startPoint;
  let accumulatedLength = 0;
  let nextLayerDistance = spacing;

  for (const line of lines) {
    const curvePoints = [
      currentLineStart,
      ...line.controlPoints,
      line.endPoint,
    ];
    const samples = 100;
    let prevPos = curvePoints[0];
    let prevT = 0;

    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      const pos = getCurvePoint(t, curvePoints);
      const dx = pos.x - prevPos.x;
      const dy = pos.y - prevPos.y;
      const segmentLength = Math.sqrt(dx * dx + dy * dy);

      accumulatedLength += segmentLength;

      // Check if we've reached the next layer position
      while (
        accumulatedLength >= nextLayerDistance &&
        nextLayerDistance <= totalLength
      ) {
        // Interpolate exact position for this layer
        const overshoot = accumulatedLength - nextLayerDistance;
        const interpolationT = 1 - overshoot / segmentLength;
        const layerT = prevT + (t - prevT) * interpolationT;
        const robotPosInches = getCurvePoint(layerT, curvePoints);

        // Calculate heading for this position
        let heading = 0;
        if (line.endPoint.heading === "linear") {
          heading = shortestRotation(
            line.endPoint.startDeg,
            line.endPoint.endDeg,
            layerT,
          );
        } else if (line.endPoint.heading === "constant") {
          heading = -line.endPoint.degrees;
        } else if (line.endPoint.heading === "tangential") {
          // Calculate tangent direction
          const nextT = Math.min(
            layerT + (line.endPoint.reverse ? -0.01 : 0.01),
            1,
          );
          const nextPos = getCurvePoint(nextT, curvePoints);
          const tdx = nextPos.x - robotPosInches.x;
          const tdy = nextPos.y - robotPosInches.y;
          if (tdx !== 0 || tdy !== 0) {
            heading = radiansToDegrees(Math.atan2(tdy, tdx));
          }
        }

        // Get robot corners for this position
        const corners = getRobotCorners(
          robotPosInches.x,
          robotPosInches.y,
          heading,
          robotLength,
          robotWidth,
        );

        layers.push({
          x: robotPosInches.x,
          y: robotPosInches.y,
          heading: heading,
          corners: corners,
        });

        nextLayerDistance += spacing;
      }

      prevPos = pos;
      prevT = t;
    }

    currentLineStart = line.endPoint;
  }

  return layers;
}
