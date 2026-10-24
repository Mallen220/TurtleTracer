// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { MotionRecorder } from "../utils/calibration/recorder";
import { SampleSmoother, type RawSample } from "../utils/calibration/samples";
import { fitBraking } from "../utils/calibration/brakingFit";
import {
  estimateSettings,
  type CalibrationKey,
  type Estimate,
  type TimeSource,
} from "../utils/calibration/estimates";
import type { MotionEvent } from "../utils/calibration/events";
import { DEFAULT_SETTINGS } from "../config/defaults";
import type { Settings } from "../types";

// A pretend robot: drives straight lines and turns in place with known
// limits, recorded every millisecond, then sampled like real telemetry.

interface Limits {
  speed: number;
  accel: number;
  /** Constant deceleration, or Pedro's braking curve. */
  decel: number | { quadratic: number; linear: number };
}

interface State {
  t: number;
  x: number;
  y: number;
  heading: number;
  busy: boolean;
}

const DT = 0.001;

/** Speed that still stops within `remaining`. */
function brakeLimit(remaining: number, decel: Limits["decel"]) {
  if (typeof decel === "number") return Math.sqrt(2 * decel * remaining);
  const { quadratic: q, linear: l } = decel;
  if (q <= 0) return remaining / l;
  return (-l + Math.sqrt(l * l + 4 * q * remaining)) / (2 * q);
}

class FakeRobot {
  states: State[] = [];
  private s: State = { t: 0, x: 0, y: 0, heading: 0, busy: false };

  rest(seconds: number) {
    for (let t = 0; t < seconds; t += DT) this.step({ busy: false });
    return this;
  }

  /** Drive `distance` inches towards `direction` (rad, field) facing `heading`. */
  drive(
    distance: number,
    limits: Limits,
    { direction = 0, heading = this.s.heading, busy = true } = {},
  ) {
    this.s.heading = heading;
    let travelled = 0;
    let v = 0;
    while (distance - travelled > 1e-4) {
      const remaining = distance - travelled;
      v = Math.min(
        limits.speed,
        v + limits.accel * DT,
        brakeLimit(remaining, limits.decel),
      );
      const ds = Math.min(remaining, Math.max(v * DT, 1e-5));
      travelled += ds;
      this.s.x += ds * Math.cos(direction);
      this.s.y += ds * Math.sin(direction);
      this.step({ busy });
    }
    return this;
  }

  /** Turn in place by `angle` rad, at most `rate` rad/s, speeding up at `accel`. */
  turn(angle: number, rate: number, accel: number) {
    const sign = Math.sign(angle);
    let turned = 0;
    let w = 0;
    while (Math.abs(angle) - turned > 1e-5) {
      const remaining = Math.abs(angle) - turned;
      w = Math.min(rate, w + accel * DT, Math.sqrt(2 * accel * remaining));
      const dh = Math.min(remaining, Math.max(w * DT, 1e-6));
      turned += dh;
      this.s.heading += sign * dh;
      this.step({ busy: true });
    }
    return this;
  }

  private step({ busy }: { busy: boolean }) {
    this.s = { ...this.s, t: this.s.t + DT, busy };
    this.states.push(this.s);
  }
}

/** Repeatable noise. */
function random(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Sampling {
  rate?: number;
  /** Position noise (in), uniform ±. */
  noise?: number;
  /** Arrival delay (s), uniform 0..jitter; times are then arrival times in whole ms. */
  jitter?: number;
  seed?: number;
}

function sample(
  states: State[],
  { rate = 50, noise = 0.02, jitter, seed = 1 }: Sampling = {},
): RawSample[] {
  const rand = random(seed);
  const every = Math.round(1 / rate / DT);
  const samples: RawSample[] = [];
  let lastArrival = 0;
  for (let i = 0; i < states.length; i += every) {
    const s = states[i];
    let t = s.t;
    if (jitter !== undefined) {
      lastArrival = Math.max(lastArrival, s.t + rand() * jitter);
      t = Math.round(lastArrival * 1000) / 1000;
    }
    samples.push({
      t,
      x: s.x + (rand() * 2 - 1) * noise,
      y: s.y + (rand() * 2 - 1) * noise,
      // Like Pedro, heading wraps to ±π.
      heading: Math.atan2(Math.sin(s.heading), Math.cos(s.heading)),
      busy: s.busy,
    });
  }
  return samples;
}

function record(
  samples: RawSample[],
  timeSource: TimeSource = "robot",
): MotionEvent[] {
  const recorder = new MotionRecorder(timeSource);
  for (const s of samples) recorder.push(s);
  recorder.finish();
  return recorder.events;
}

const settings = { ...DEFAULT_SETTINGS } as Settings;

function estimates(
  events: MotionEvent[],
  timeSource: TimeSource = "robot",
  over: Partial<Settings> = {},
): Record<CalibrationKey, Estimate> {
  return Object.fromEntries(
    estimateSettings(events, { ...settings, ...over }, timeSource).map((e) => [
      e.key,
      e,
    ]),
  ) as Record<CalibrationKey, Estimate>;
}

const ROBOT: Limits = { speed: 55, accel: 45, decel: 60 };

/** Laps back and forth, facing forwards, then turns in place. */
function autoRoutine(limits = ROBOT, laps = 4) {
  const robot = new FakeRobot().rest(0.5);
  for (let i = 0; i < laps; i++) {
    robot
      .drive(72, limits, { direction: 0, heading: 0 })
      .rest(0.4)
      .drive(72, limits, { direction: Math.PI, heading: Math.PI })
      .rest(0.4);
  }
  for (let i = 0; i < 4; i++) {
    robot.turn(i % 2 ? -Math.PI : Math.PI, 4, 20).rest(0.4);
  }
  return robot;
}

const near = (actual: number | null, expected: number, share: number) => {
  expect(actual).not.toBeNull();
  expect(Math.abs(actual! / expected - 1)).toBeLessThan(share);
};

describe("SampleSmoother", () => {
  it("measures speed and turn rate through heading wrap-around", () => {
    const smoother = new SampleSmoother();
    const out = [];
    for (let i = 0; i <= 50; i++) {
      const t = i * 0.02;
      const heading = 3 + 2 * t; // crosses π
      out.push(
        ...smoother.push({
          t,
          x: 30 * t,
          y: 0,
          heading: Math.atan2(Math.sin(heading), Math.cos(heading)),
        }).samples,
      );
    }
    out.push(...smoother.flush());
    expect(out).toHaveLength(51);
    for (const s of out) {
      expect(s.speed).toBeCloseTo(30, 5);
      expect(s.turnRate).toBeCloseTo(2, 5);
    }
  });

  it("uses Pedro's velocity when the robot sends it", () => {
    const smoother = new SampleSmoother();
    for (let i = 0; i <= 10; i++) {
      smoother.push({
        t: i * 0.02,
        x: 0,
        y: 0,
        heading: 0,
        vx: 3,
        vy: 4,
        omega: 1,
      });
    }
    const [first] = smoother.flush();
    expect(first.speed).toBeCloseTo(5);
    expect(first.turnRate).toBeCloseTo(1);
  });

  it("drops stale poses and breaks on gaps, jumps and robot restarts", () => {
    const smoother = new SampleSmoother();
    const pose = (t: number, x = 0) => ({ t, x, y: 0, heading: 0 });
    smoother.push(pose(1));
    smoother.push(pose(1.02));
    expect(smoother.push(pose(1.01)).broke).toBe(false); // out of order: dropped
    expect(smoother.push(pose(1.5)).broke).toBe(true); // gap
    expect(smoother.push(pose(1.52, 40)).broke).toBe(true); // relocalized
    expect(smoother.push(pose(0.1, 40)).broke).toBe(true); // robot restarted
  });
});

describe("measuring a robot", () => {
  const events = record(sample(autoRoutine().states));
  const est = estimates(events);

  it("finds its top speed, forward speed, acceleration and deceleration", () => {
    near(est.maxVelocity.measured, 55, 0.02);
    near(est.xVelocity.measured, 55, 0.02);
    near(est.maxAcceleration.measured, 45, 0.05);
    near(est.maxDeceleration.measured, 60, 0.05);
  });

  it("finds how fast it turns in place, in degrees per second", () => {
    near(est.aVelocity.measured, (4 * 180) / Math.PI, 0.03);
  });

  it("is ready and suggests the measured values", () => {
    for (const key of [
      "maxVelocity",
      "maxAcceleration",
      "maxDeceleration",
      "aVelocity",
    ] as const) {
      expect(est[key].ready, key).toBe(true);
      expect(est[key].progress).toBe(1);
    }
    expect(est.maxVelocity.suggestion?.patch).toEqual({ maxVelocity: 55 });
    expect(est.maxVelocity.suggestion?.label).toBe(
      "Set Max Velocity to 55.0 in/s",
    );
    expect(est.aVelocity.suggestion?.patch.aVelocity).toBeCloseTo(4, 1);
  });

  it("doesn't suggest forward speed without strafe speed", () => {
    expect(est.xVelocity.ready).toBe(true);
    expect(est.xVelocity.suggestion).toBeNull();
  });

  it("has nothing to say about strafing when the robot never strafed", () => {
    expect(est.yVelocity.count).toBe(0);
    expect(est.yVelocity.hint).toBe("Need 3 more full-speed sideways drives");
    expect(est.yVelocity.suggestion).toBeNull();
  });

  it("suggests lowering settings the robot can't reach", () => {
    const high = estimates(events, "robot", {
      maxVelocity: 80,
      maxAcceleration: 90,
      maxDeceleration: 120,
      aVelocity: 8,
    });
    expect(high.maxVelocity.difference).toBeLessThan(-0.3);
    expect(high.maxVelocity.suggestion?.patch).toEqual({ maxVelocity: 55 });
    expect(high.maxAcceleration.suggestion?.patch.maxAcceleration).toBeCloseTo(
      45,
      -1,
    );
    expect(high.maxDeceleration.suggestion?.patch.maxDeceleration).toBeCloseTo(
      60,
      -1,
    );
    expect(high.aVelocity.suggestion?.patch.aVelocity).toBeCloseTo(4, 1);
  });

  it("doesn't suggest a change smaller than 5%", () => {
    const close = estimates(events, "robot", {
      maxVelocity: 54,
      maxAcceleration: 44,
    });
    expect(close.maxVelocity.ready).toBe(true);
    expect(close.maxVelocity.suggestion).toBeNull();
    expect(close.maxAcceleration.suggestion).toBeNull();
  });

  it("isn't ready after one lap", () => {
    const robot = new FakeRobot()
      .rest(0.5)
      .drive(72, ROBOT, { direction: 0, heading: 0 })
      .rest(0.5);
    const one = estimates(record(sample(robot.states)));
    expect(one.maxVelocity.ready).toBe(false);
    expect(one.maxVelocity.progress).toBeCloseTo(0.3);
    expect(one.maxVelocity.hint).toBe("Need 2 more full-speed drives");
    expect(one.maxVelocity.suggestion).toBeNull();
  });
});

describe("driving sideways", () => {
  it("measures strafe speed separately", () => {
    const strafe: Limits = { speed: 44, accel: 40, decel: 50 };
    const robot = new FakeRobot().rest(0.5);
    for (let i = 0; i < 3; i++) {
      robot
        .drive(60, strafe, { direction: Math.PI / 2, heading: 0 })
        .rest(0.4)
        .drive(60, strafe, { direction: -Math.PI / 2, heading: 0 })
        .rest(0.4);
    }
    const est = estimates(record(sample(robot.states)));
    near(est.yVelocity.measured, 44, 0.02);
    expect(est.yVelocity.ready).toBe(true);
    expect(est.xVelocity.count).toBe(0);
    // Only the ratio matters to the simulation, so not on its own.
    expect(est.yVelocity.suggestion).toBeNull();
    expect(est.yVelocity.hint).toBe(
      "Also drive forward at full speed: they are set together",
    );
  });

  it("suggests forward and strafe speed together once both are measured", () => {
    const strafe: Limits = { speed: 44, accel: 40, decel: 50 };
    const robot = autoRoutine(ROBOT, 3);
    for (let i = 0; i < 3; i++) {
      robot
        .drive(60, strafe, { direction: Math.PI / 2, heading: 0 })
        .rest(0.4)
        .drive(60, strafe, { direction: -Math.PI / 2, heading: 0 })
        .rest(0.4);
    }
    const est = estimates(record(sample(robot.states)));
    expect(est.xVelocity.suggestion?.patch).toEqual({
      xVelocity: 55,
      yVelocity: 44,
    });
    expect(est.xVelocity.suggestion?.label).toBe(
      "Set Forward/Strafe Velocity to 55.0/44.0 in/s",
    );
    expect(est.yVelocity.suggestion).toBeNull();
    expect(est.yVelocity.hint).toBe("Set together with Forward Velocity");
  });
});

describe("braking", () => {
  const curve = { quadratic: 0.004, linear: 0.05 };

  it("fits Pedro's braking curve from stops at different speeds", () => {
    const robot = new FakeRobot().rest(0.5);
    for (const [length, speed] of [
      [96, 55],
      [60, 40],
      [96, 55],
      [40, 30],
      [72, 48],
    ]) {
      robot
        .drive(
          length,
          { speed, accel: 45, decel: curve },
          { direction: 0, heading: 0 },
        )
        .rest(0.4)
        .drive(
          length,
          { speed, accel: 45, decel: curve },
          {
            direction: Math.PI,
            heading: Math.PI,
          },
        )
        .rest(0.4);
    }
    const est = estimates(record(sample(robot.states)));
    expect(est.braking.ready).toBe(true);
    const patch = est.braking.suggestion!.patch;
    for (const v of [25, 40, 55]) {
      const fitted = patch.brakingQuadratic! * v * v + patch.brakingLinear! * v;
      near(fitted, curve.quadratic * v * v + curve.linear * v, 0.06);
    }
  });

  it("solves an exact curve", () => {
    const points = [10, 20, 30, 40].map((speed) => ({
      speed,
      distance: 0.003 * speed * speed + 0.1 * speed,
    }));
    const fit = fitBraking(points);
    expect(fit.quadratic).toBeCloseTo(0.003, 6);
    expect(fit.linear).toBeCloseTo(0.1, 6);
    expect(fit.fit).toBeCloseTo(1, 6);
  });

  it("ignores stops made outside a path (teleop coasting)", () => {
    const robot = new FakeRobot().rest(0.5);
    for (let i = 0; i < 3; i++) {
      robot
        .drive(72, ROBOT, { direction: 0, heading: 0, busy: false })
        .rest(0.4)
        .drive(72, ROBOT, { direction: Math.PI, heading: Math.PI, busy: false })
        .rest(0.4);
    }
    const est = estimates(record(sample(robot.states)));
    expect(est.maxVelocity.ready).toBe(true);
    expect(est.maxDeceleration.count).toBe(0);
    expect(est.braking.count).toBe(0);
  });
});

describe("without the robot's clock", () => {
  it("needs twice the readings and still lands close", () => {
    const states = autoRoutine(ROBOT, 6).states;
    const est = estimates(
      record(sample(states, { rate: 20, jitter: 0.03, seed: 7 }), "arrival"),
      "arrival",
    );
    expect(est.maxVelocity.needed).toBe(6);
    near(est.maxVelocity.measured, 55, 0.04);
    near(est.maxAcceleration.measured, 45, 0.12);
    near(est.maxDeceleration.measured, 60, 0.12);
  });
});

describe("bad data", () => {
  it("doesn't read a relocalization jump as speed", () => {
    const samples = sample(autoRoutine(ROBOT, 2).states);
    for (const s of samples.slice(200)) s.x += 30;
    const events = record(samples);
    for (const e of events) {
      if (e.kind === "cruise") expect(e.speed).toBeLessThan(57);
    }
  });
});
