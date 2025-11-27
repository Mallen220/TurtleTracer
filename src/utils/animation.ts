import {
  getCurvePoint,
  easeInOutQuad,
  shortestRotation,
  radiansToDegrees,
} from "./math";
import type { Point, Line } from "../types";
import type { ScaleLinear } from "d3";

export interface RobotState {
  x: number;
  y: number;
  heading: number;
}

export interface AnimationState {
  playing: boolean;
  percent: number;
  startTime: number | null;
  previousTime: number | null;
  animationFrame: number;
  totalDuration: number;
  loop: boolean; // Add loop capability
}

/**
 * Calculate the robot position and heading at a given percentage along the path
 */
export function calculateRobotState(
  percent: number,
  lines: Line[],
  startPoint: Point,
  xScale: ScaleLinear<number, number>,
  yScale: ScaleLinear<number, number>,
): RobotState {
  const totalLineProgress =
    (lines.length * Math.min(percent, 99.999999999)) / 100;
  const currentLineIdx = Math.min(
    Math.trunc(totalLineProgress),
    lines.length - 1,
  );
  const currentLine = lines[currentLineIdx];

  const linePercent = easeInOutQuad(
    totalLineProgress - Math.floor(totalLineProgress),
  );
  const _startPoint =
    currentLineIdx === 0 ? startPoint : lines[currentLineIdx - 1].endPoint;
  const robotInchesXY = getCurvePoint(linePercent, [
    _startPoint,
    ...currentLine.controlPoints,
    currentLine.endPoint,
  ]);

  const robotXY = { x: xScale(robotInchesXY.x), y: yScale(robotInchesXY.y) };
  let robotHeading = 0;

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
        [_startPoint, ...currentLine.controlPoints, currentLine.endPoint],
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

  return {
    x: robotXY.x,
    y: robotXY.y,
    heading: robotHeading,
  };
}

/**
 * Create an animation controller for the robot simulation
 */
export function createAnimationController(
  totalDuration: number,
  onPercentChange: (percent: number) => void,
  onComplete?: () => void, // Add completion callback
) {
  let state: AnimationState = {
    playing: false,
    percent: 0,
    startTime: null,
    previousTime: null,
    animationFrame: 0,
    totalDuration,
    loop: false, // Default to no loop
  };

  let isExternalChange = false;

  function animate(timestamp: number) {
    if (!state.startTime) {
      state.startTime = timestamp;
      state.previousTime = timestamp;
    }

    const elapsed = (timestamp - state.startTime) / 1000;

    if (state.totalDuration > 0) {
      state.percent = Math.min(100, (elapsed / state.totalDuration) * 100);
    } else {
      state.percent = 0;
    }

    // Only trigger callback if this is an animation-driven change
    if (!isExternalChange) {
      onPercentChange(state.percent);
    }

    state.previousTime = timestamp;

    if (state.playing && state.percent < 100) {
      state.animationFrame = requestAnimationFrame(animate);
    } else if (state.percent >= 100) {
      // Animation completed
      state.playing = false;
      state.percent = 100;

      if (!isExternalChange) {
        onPercentChange(100);
      }

      // Call completion callback
      if (onComplete) {
        onComplete();
      }

      // Auto-reset and replay if looping is enabled
      if (state.loop) {
        setTimeout(() => {
          reset();
          play();
        }, 500); // Small delay before restarting
      }
    }
  }

  function reset() {
    state.percent = 0;
    state.startTime = null;
    state.previousTime = null;
    if (!isExternalChange) {
      onPercentChange(0);
    }
  }

  function play() {
    if (!state.playing && state.percent < 100) {
      state.playing = true;
      isExternalChange = false;

      if (state.totalDuration > 0) {
        const elapsedTime = (state.percent / 100) * state.totalDuration * 1000;
        state.startTime = performance.now() - elapsedTime;
      } else {
        state.startTime = performance.now();
      }
      state.previousTime = state.startTime;
      state.animationFrame = requestAnimationFrame(animate);
    }
  }

  function pause() {
    state.playing = false;
    isExternalChange = false;
    if (state.animationFrame) {
      cancelAnimationFrame(state.animationFrame);
    }
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
      state.percent = Math.max(0, Math.min(100, targetPercent));
      onPercentChange(state.percent);

      // If we're playing, adjust the start time to maintain correct timing
      if (state.playing && state.totalDuration > 0) {
        const elapsedTime = (state.percent / 100) * state.totalDuration * 1000;
        state.startTime = performance.now() - elapsedTime;
      }

      // Reset the flag after a short delay
      setTimeout(() => {
        isExternalChange = false;
      }, 0);
    },
    setDuration(duration: number) {
      state.totalDuration = duration;
      // If we're playing, adjust timing to maintain current progress
      if (state.playing && state.totalDuration > 0) {
        const elapsedTime = (state.percent / 100) * state.totalDuration * 1000;
        state.startTime = performance.now() - elapsedTime;
      }
    },
    setLoop(loop: boolean) {
      state.loop = loop;
    },
    isPlaying() {
      return state.playing;
    },
    getPercent() {
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
