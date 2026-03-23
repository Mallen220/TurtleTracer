// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import * as d3 from "d3";
import { calculateRobotState } from "../animation";
import { calculateSwerveDriveAngles } from "./swerve";
import { calculateFieldCentricMecanum } from "./mecanum";
import { DEFAULT_ROBOT_LENGTH, DEFAULT_ROBOT_WIDTH } from "../../config";
import type { WheelSpeeds } from "./mecanum";

export function calculateDrivetrainSpeeds(
  percentStore: number,
  timePrediction: any,
  lines: any[],
  startPoint: any,
  settings: any,
  showRobot: boolean,
): WheelSpeeds | null {
  if (!showRobot || settings.robotImage !== "none") return null;

  if (
    !timePrediction ||
    !timePrediction.timeline ||
    timePrediction.timeline.length === 0
  ) {
    return { frontLeft: 0, backLeft: 0, frontRight: 0, backRight: 0 };
  }

  const totalDuration =
    timePrediction.timeline[timePrediction.timeline.length - 1].endTime;
  const currentSeconds = (percentStore / 100) * totalDuration;

  // Time delta for velocity calc
  const dt = 0.05;
  const futureSeconds = currentSeconds + dt;
  const futurePercent = (futureSeconds / totalDuration) * 100;

  const scale = d3.scaleLinear().domain([0, 1]).range([0, 1]);

  const state1 = calculateRobotState(
    percentStore,
    timePrediction.timeline,
    lines,
    startPoint,
    scale,
    scale,
  );
  const state2 = calculateRobotState(
    futurePercent,
    timePrediction.timeline,
    lines,
    startPoint,
    scale,
    scale,
  );

  // Calculate velocity in inches per second
  const vx = (state2.x - state1.x) / dt;
  const vy = (state2.y - state1.y) / dt;

  // Field coordinates: Right is +X, Forward is +Y.
  const forwardVel = vx;
  const strafeVel = vy;

  // Angular velocity
  let dHeading = state2.heading - state1.heading;
  // Normalize dHeading to [-180, 180]
  dHeading = (((dHeading % 360) + 540) % 360) - 180;
  const omega = (dHeading * Math.PI) / 180 / dt; // radians per sec

  // Convert heading to radians
  const headingRad = (state1.heading * Math.PI) / 180;

  // Calculate normalized magnitudes based on typical robot speeds
  const maxV = 60;
  const maxOmega = 3;

  const normalizedForward = forwardVel / maxV;
  const normalizedStrafe = strafeVel / maxV;
  const normalizedRotate = omega / maxOmega;

  if (settings.robotDriveType === "swerve") {
    return calculateSwerveDriveAngles(
      normalizedForward,
      normalizedStrafe,
      normalizedRotate,
      headingRad,
      settings.rWidth || DEFAULT_ROBOT_WIDTH,
      settings.rLength || DEFAULT_ROBOT_LENGTH,
    );
  } else {
    return calculateFieldCentricMecanum(
      normalizedForward,
      normalizedStrafe,
      normalizedRotate,
      headingRad,
    );
  }
}
