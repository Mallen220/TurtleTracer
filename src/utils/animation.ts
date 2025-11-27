import { getCurvePoint, easeInOutQuad, shortestRotation, radiansToDegrees } from './math';
import type { Point, Line } from '../types';
import type { ScaleLinear } from 'd3';

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
}

/**
 * Calculate the robot position and heading at a given percentage along the path
 */
export function calculateRobotState(
  percent: number,
  lines: Line[],
  startPoint: Point,
  xScale: ScaleLinear<number, number>,
  yScale: ScaleLinear<number, number>
): RobotState {
  const totalLineProgress = (lines.length * Math.min(percent, 99.999999999)) / 100;
  const currentLineIdx = Math.min(Math.trunc(totalLineProgress), lines.length - 1);
  const currentLine = lines[currentLineIdx];

  const linePercent = easeInOutQuad(totalLineProgress - Math.floor(totalLineProgress));
  const _startPoint = currentLineIdx === 0 ? startPoint : lines[currentLineIdx - 1].endPoint;
  const robotInchesXY = getCurvePoint(linePercent, [_startPoint, ...currentLine.controlPoints, currentLine.endPoint]);
  
  const robotXY = { x: xScale(robotInchesXY.x), y: yScale(robotInchesXY.y) };
  let robotHeading = 0;

  switch (currentLine.endPoint.heading) {
    case "linear":
      robotHeading = -shortestRotation(
        currentLine.endPoint.startDeg,
        currentLine.endPoint.endDeg,
        linePercent
      );
      break;
    case "constant":
      robotHeading = -currentLine.endPoint.degrees;
      break;
    case "tangential":
      const nextPointInches = getCurvePoint(
        linePercent + (currentLine.endPoint.reverse ? -0.01 : 0.01),
        [_startPoint, ...currentLine.controlPoints, currentLine.endPoint]
      );
      const nextPoint = { x: xScale(nextPointInches.x), y: yScale(nextPointInches.y) };

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
    heading: robotHeading
  };
}

/**
 * Create an animation controller for the robot simulation
 */
export function createAnimationController(
  linesCount: number,
  onPercentChange: (percent: number) => void
) {
  let state: AnimationState = {
    playing: false,
    percent: 0,
    startTime: null,
    previousTime: null,
    animationFrame: 0
  };

  function animate(timestamp: number) {
    if (!state.startTime) {
      state.startTime = timestamp;
    }

    if (state.previousTime !== null) {
      const deltaTime = timestamp - state.previousTime;

      if (state.percent >= 100) {
        state.percent = 0;
      } else {
        state.percent += (0.65 / linesCount) * (deltaTime * 0.1);
      }
      onPercentChange(state.percent);
    }

    state.previousTime = timestamp;

    if (state.playing) {
      state.animationFrame = requestAnimationFrame(animate);
    }
  }

  return {
    play() {
      if (!state.playing) {
        state.playing = true;
        state.startTime = null;
        state.previousTime = null;
        state.animationFrame = requestAnimationFrame(animate);
      }
    },
    pause() {
      state.playing = false;
      cancelAnimationFrame(state.animationFrame);
    },
    isPlaying() {
      return state.playing;
    },
    setPercent(percent: number) {
      state.percent = percent;
      onPercentChange(percent);
    },
    getPercent() {
      return state.percent;
    },
    updateLinesCount(count: number) {
      linesCount = count;
    }
  };
}
