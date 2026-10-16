// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
/// <reference path="../turtle.d.ts" />
// A simple robot simulation: a point with momentum chasing the planned pose
// with a PD controller, limited by traction, top speed and a reaction delay.
// It's an illustration of what a simulator plugin can do, not a model of
// Pedro Pathing.

const STEP = 0.02; // seconds
/** Extra time after the plan ends for the robot to settle. */
const SETTLE = 1;

/** The planned pose at `time`, between samples. */
function plannedAt(poses: Turtle.PoseTrack, time: number): Turtle.Pose {
  const { t, x, y, heading } = poses;
  const last = t.length - 1;
  if (time <= t[0]) return { x: x[0], y: y[0], heading: heading[0] };
  if (time >= t[last])
    return { x: x[last], y: y[last], heading: heading[last] };
  let i = 0;
  while (t[i + 1] < time) i++;
  const f = (time - t[i]) / (t[i + 1] - t[i] || 1);
  return {
    x: x[i] + (x[i + 1] - x[i]) * f,
    y: y[i] + (y[i + 1] - y[i]) * f,
    heading: heading[i] + (heading[i + 1] - heading[i]) * f,
  };
}

/** The shortest signed turn from `from` to `to`, in degrees. */
const turnBetween = (from: number, to: number) =>
  ((((to - from) % 360) + 540) % 360) - 180;

turtle.simulators.register({
  name: "momentum",
  label: "Momentum robot",
  simulate({ project, plan }) {
    const settings = turtle.settings.get();
    const w = Number(settings.response);
    const kp = w * w;
    const kd = 2 * Number(settings.damping) * w;
    const latency = Number(settings.latency);
    const maxAccel = project.robot.maxAcceleration * Number(settings.traction);
    const maxSpeed = project.robot.maxVelocity;
    const maxTurn = (project.robot.maxAngularVelocity * 180) / Math.PI; // deg/s

    const track: Turtle.PoseTrack = { t: [], x: [], y: [], heading: [] };
    const notes: { time: number; text: string; level: "warning" }[] = [];
    const start = plannedAt(plan.poses, 0);
    let { x, y, heading } = start;
    let vx = 0;
    let vy = 0;
    let behind = false;

    for (let t = 0; t <= plan.duration + SETTLE; t += STEP) {
      // Where it should be (a moment ago, as it reacts late), and how fast.
      const target = plannedAt(plan.poses, t - latency);
      const ahead = plannedAt(plan.poses, t - latency + STEP);
      const tvx = (ahead.x - target.x) / STEP;
      const tvy = (ahead.y - target.y) / STEP;

      let ax = kp * (target.x - x) + kd * (tvx - vx);
      let ay = kp * (target.y - y) + kd * (tvy - vy);
      const accel = Math.hypot(ax, ay);
      if (accel > maxAccel) {
        ax *= maxAccel / accel;
        ay *= maxAccel / accel;
      }
      vx += ax * STEP;
      vy += ay * STEP;
      const speed = Math.hypot(vx, vy);
      if (speed > maxSpeed) {
        vx *= maxSpeed / speed;
        vy *= maxSpeed / speed;
      }
      x += vx * STEP;
      y += vy * STEP;

      const turnRate = Math.max(
        -maxTurn,
        Math.min(maxTurn, turnBetween(heading, target.heading) * 8),
      );
      heading += turnRate * STEP;

      track.t.push(t);
      track.x.push(x);
      track.y.push(y);
      track.heading.push(heading);

      // Point out each time it falls well behind the plan.
      const error = Math.hypot(target.x - x, target.y - y);
      if (error > 4 && !behind) {
        notes.push({
          time: t,
          text: `${error.toFixed(1)} in off the plan`,
          level: "warning",
        });
      }
      behind = error > 2;
    }
    return { poses: track, notes: notes.slice(0, 20) };
  },
});
