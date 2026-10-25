// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// How far the robot travels while braking. By default it slows at a constant
// rate (max deceleration). Pedro Pathing instead fits braking distance as a
// quadratic and a linear term in speed, which the robot's settings can give.
import type { Settings } from "../../types";

/** The braking coefficients, or null when braking is at a constant rate. */
function coefficients(settings: Settings) {
  const quadratic = Math.max(0, settings.brakingQuadratic ?? 0);
  const linear = Math.max(0, settings.brakingLinear ?? 0);
  return quadratic > 0 || linear > 0 ? { quadratic, linear } : null;
}

const decelerationOf = (settings: Settings) =>
  settings.maxDeceleration || settings.maxAcceleration || 30;

/**
 * With no power, the robot slows down on its own (friction and its motors
 * braking). At its top speed this is this share of its maximum deceleration.
 */
export const NATURAL_DECELERATION_SHARE = 0.8;

/** How fast (in/s²) a robot at its top speed slows down with no power. */
export function naturalDeceleration(settings: Settings): number {
  return NATURAL_DECELERATION_SHARE * decelerationOf(settings);
}

/** Distance (inches) to stop from `speed` (in/s) when braking. */
export function brakingDistance(speed: number, settings: Settings): number {
  const fit = coefficients(settings);
  if (!fit) return (speed * speed) / (2 * decelerationOf(settings));
  return fit.quadratic * speed * speed + fit.linear * speed;
}

/**
 * Pedro's own brake model, as written in the robot's code, for each of the
 * robot's axes: null when it hasn't been given. An axis left at 0 uses the
 * other's values.
 */
function pedroBrakeModel(settings: Settings) {
  const pair = (quadratic?: number, linear?: number) => ({
    quadratic: Math.max(0, quadratic ?? 0),
    linear: Math.max(0, linear ?? 0),
  });
  const forward = pair(
    settings.pedroQuadraticBrakeForward,
    settings.pedroLinearBrakeForward,
  );
  const strafe = pair(
    settings.pedroQuadraticBrakeStrafe,
    settings.pedroLinearBrakeStrafe,
  );
  const isSet = (axis: typeof forward) => axis.quadratic > 0 || axis.linear > 0;
  if (!isSet(forward) && !isSet(strafe)) return null;
  return {
    forward: isSet(forward) ? forward : strafe,
    strafe: isSet(strafe) ? strafe : forward,
  };
}

const REFERENCE_BRAKE = { quadratic: 0.002018, linear: 0.04507 };
const REFERENCE_DECELERATION = 107;

/**
 * Stand-in for the robot's brake coefficients when it hasn't given any: that
 * tuned robot's, stretched in proportion to Max Deceleration so a softer robot
 * takes longer to stop. An estimate. Null when the Braking setting (measured
 * on the real robot) is set, which is used instead.
 */
function genericBrakeModel(settings: Settings) {
  if (coefficients(settings)) return null;
  const stretch = REFERENCE_DECELERATION / decelerationOf(settings);
  const axis = {
    quadratic: REFERENCE_BRAKE.quadratic * stretch,
    linear: REFERENCE_BRAKE.linear * stretch,
  };
  return { forward: axis, strafe: axis };
}

/**
 * How far (inches) Pedro thinks the robot would slide along one of its own
 * axes from `speed` (in/s, signed) on that axis if it braked: the signed
 * displacement. Without the coefficients from the robot's code, the robot's
 * real braking distance stands in.
 */
export function pedroAxisStop(
  speed: number,
  axis: "forward" | "strafe",
  settings: Settings,
): number {
  const model = pedroBrakeModel(settings);
  const size = Math.abs(speed);
  if (!model) return Math.sign(speed) * brakingDistance(size, settings);
  const { quadratic, linear } = model[axis];
  return Math.sign(speed) * (quadratic * size * size + linear * size);
}

/**
 * How far ahead (inches, along the direction of travel) Pedro thinks the robot
 * would stop from `speed`, moving `travelAngle` degrees off the way it faces.
 * Pedro hands a chained path over to the next one once this reaches the end of
 * the path. It is Pedro's estimate, from the brake coefficients in the robot's
 * code, which can differ from how far the robot really takes to stop
 * (`brakingDistance`); without them, an estimate from Max Deceleration
 * (`genericBrakeModel`) stands in, unless the Braking setting is given.
 */
export function handoverDistance(
  speed: number,
  travelAngle: number,
  settings: Settings,
): number {
  const model = pedroBrakeModel(settings) ?? genericBrakeModel(settings);
  if (!model) return brakingDistance(speed, settings);
  // As Pedro's getVelocityToBrakeInTime: each axis brakes on its own, and its
  // displacement is taken along the direction of travel.
  const radians = (travelAngle * Math.PI) / 180;
  const along = Math.abs(Math.cos(radians));
  const across = Math.abs(Math.sin(radians));
  const { forward, strafe } = model;
  return (
    speed *
      speed *
      (forward.quadratic * along ** 3 + strafe.quadratic * across ** 3) +
    speed * (forward.linear * along ** 2 + strafe.linear * across ** 2)
  );
}

/**
 * The fastest the robot can be going and still stop to `exitSpeed` within
 * `distance`: the speed it can be going `distance` before it has to be at
 * `exitSpeed`.
 */
export function speedToSlowWithin(
  distance: number,
  exitSpeed: number,
  settings: Settings,
): number {
  const fit = coefficients(settings);
  if (!fit) {
    return Math.sqrt(
      exitSpeed * exitSpeed + 2 * decelerationOf(settings) * distance,
    );
  }
  const total = brakingDistance(exitSpeed, settings) + distance;
  const { quadratic, linear } = fit;
  if (quadratic <= 0) return total / linear;
  return (
    (-linear + Math.sqrt(linear * linear + 4 * quadratic * total)) /
    (2 * quadratic)
  );
}
