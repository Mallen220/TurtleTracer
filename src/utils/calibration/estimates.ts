// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Turns the events seen on the real robot into a measured value for each
// motion setting, says how sure it is, and suggests a new value once the
// measurement is steady and differs from the setting. Values mean what the
// simulation means by them, so applying one makes the simulation move like
// the robot.

import type { Settings } from "../../types";
import { brakingDistance } from "../timeCalculator/braking";
import { DEFAULT_TRANSLATIONAL_P } from "../timeCalculator/chainRecovery";
import { gainForCorner, MIN_SWING, type CornerEvent } from "./corners";
import { fitBraking } from "./brakingFit";
import type {
  CruiseEvent,
  LaunchEvent,
  MotionEvent,
  StopEvent,
  TurnEvent,
} from "./events";

export type CalibrationKey =
  | "maxVelocity"
  | "xVelocity"
  | "yVelocity"
  | "maxAcceleration"
  | "maxDeceleration"
  | "aVelocity"
  | "braking"
  | "translationalP";

/** Where the sample times come from. Arrival times jitter, so more readings are needed. */
export type TimeSource = "robot" | "arrival";

export interface Estimate {
  key: CalibrationKey;
  label: string;
  /** The measured value in display units, or null before any reading. */
  measured: number | null;
  /** The setting now, in display units (null when it doesn't apply). */
  current: number | null;
  unit: string;
  /** The precision values are shown and suggested at. */
  step: number;
  /** Measured against current, e.g. 0.12 for 12% higher. */
  difference: number | null;
  /** (Q3 - Q1) / median of the readings. */
  spread: number | null;
  count: number;
  needed: number;
  /** 0 to 1. */
  progress: number;
  ready: boolean;
  /** What is still needed, or why it isn't ready. */
  hint: string;
  /** Something the user should know about this setting. */
  note?: string;
  suggestion: Suggestion | null;
}

export interface Suggestion {
  key: CalibrationKey;
  patch: Partial<Settings>;
  label: string;
  /** Identifies this suggested value, so it is announced once. */
  id: string;
}

/**
 * Readings within this share of the fastest count as top-speed readings. A
 * drive held to a lower speed (a path speed limit, a gentle stick) isn't one.
 */
const TOP_CLUSTER = 0.05;
/** Launches must reach this share of the top speed. */
const MIN_LAUNCH_SHARE = 0.5;
/** Stops must start from this share of the top speed. */
const MIN_STOP_SHARE = 0.4;
/** A difference smaller than this isn't worth changing the setting for. */
const MIN_DIFFERENCE = 0.05;
/** With this many times the readings needed, the median is trusted even if they vary. */
const ENOUGH_TO_TRUST = 3;
const MIN_BRAKING_FIT = 0.9;

const RAD_TO_DEG = 180 / Math.PI;

function quantile(sorted: number[], q: number) {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function summarize(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const median = quantile(sorted, 0.5);
  const spread =
    sorted.length > 1 && median > 0
      ? (quantile(sorted, 0.75) - quantile(sorted, 0.25)) / median
      : 0;
  return { median, spread };
}

/** The readings near the highest one. */
const topCluster = (values: number[]) => {
  const best = Math.max(...values);
  return values.filter((v) => v >= best * (1 - TOP_CLUSTER));
};

const roundTo = (value: number, step: number) =>
  Math.round(value / step) * step;

/** "1 more stop", "2 more stops"; `noun` is [one, many]. */
const plural = (n: number, [one, many]: readonly [string, string]) =>
  `${n} more ${n === 1 ? one : many}`;

interface Reading {
  key: Exclude<CalibrationKey, "braking">;
  label: string;
  unit: string;
  values: number[];
  needed: number;
  maxSpread: number;
  /** What a reading is, for the hint: [one, many]. */
  noun: readonly [string, string];
  current: number | null;
  /** Display value to setting value. */
  toSetting: (display: number) => number;
  step: number;
  note?: string;
}

function readingEstimate(r: Reading): Estimate {
  const count = r.values.length;
  const base = {
    key: r.key,
    label: r.label,
    unit: r.unit,
    step: r.step,
    current: r.current,
    count,
    needed: r.needed,
    note: r.note,
  };
  if (count === 0) {
    return {
      ...base,
      measured: null,
      difference: null,
      spread: null,
      progress: 0,
      ready: false,
      hint: `Need ${plural(r.needed, r.noun)}`,
      suggestion: null,
    };
  }
  const { median, spread } = summarize(r.values);
  const enough = count >= r.needed;
  const steady = spread <= r.maxSpread || count >= r.needed * ENOUGH_TO_TRUST;
  const ready = enough && steady;
  // Compared at the precision it would be set to, so a value that rounds to
  // the setting matches it.
  const value = roundTo(median, r.step);
  const difference =
    r.current !== null && r.current > 0 ? value / r.current - 1 : null;

  let hint = "Ready";
  if (!enough) hint = `Need ${plural(r.needed - count, r.noun)}`;
  else if (!steady) {
    hint = `Readings vary by ±${Math.round((spread * 100) / 2)}%; keep driving`;
  }

  const suggestion =
    ready &&
    difference !== null &&
    Math.abs(difference) > MIN_DIFFERENCE &&
    Math.abs(value - r.current!) >= r.step / 2 &&
    value > 0
      ? {
          key: r.key,
          patch: { [r.key]: r.toSetting(value) } as Partial<Settings>,
          label: `Set ${r.label} to ${formatNumber(value, r.step)}${r.unit ? ` ${r.unit}` : ""}`,
          id: `${r.key}:${value}`,
        }
      : null;

  return {
    ...base,
    measured: median,
    difference,
    spread,
    progress: ready ? 1 : 0.9 * Math.min(1, count / r.needed),
    ready,
    hint,
    suggestion,
  };
}

export function formatNumber(value: number, step = 0.1) {
  const decimals = Math.max(0, Math.ceil(-Math.log10(step) - 1e-9));
  return value.toFixed(decimals);
}

const STOPS = ["stop from speed", "stops from speed"] as const;

function brakingFormula(quadratic: number, linear: number) {
  const terms = [];
  if (quadratic > 0) terms.push(`${formatNumber(quadratic, 1e-5)}·v²`);
  if (linear > 0) terms.push(`${formatNumber(linear, 1e-4)}·v`);
  return terms.join(" + ") || "0";
}

/**
 * The simulation only uses forward and strafe speed as a ratio, so one
 * without the other would make some directions slower on no evidence. They
 * are suggested together once both are measured.
 */
function pairDirections(forward: Estimate, strafe: Estimate) {
  if (forward.ready && strafe.ready) {
    const differs = [forward, strafe].some(
      (e) => e.difference !== null && Math.abs(e.difference) > MIN_DIFFERENCE,
    );
    const x = roundTo(forward.measured!, 0.5);
    const y = roundTo(strafe.measured!, 0.5);
    forward.suggestion =
      differs && x > 0 && y > 0
        ? {
            key: "xVelocity",
            patch: { xVelocity: x, yVelocity: y },
            label: `Set Forward/Strafe Velocity to ${formatNumber(x, 0.5)}/${formatNumber(y, 0.5)} in/s`,
            id: `directional:${x}:${y}`,
          }
        : null;
    strafe.suggestion = null;
    if (forward.suggestion) strafe.hint = "Set together with Forward Velocity";
    return;
  }
  for (const [e, other] of [
    [forward, "sideways"],
    [strafe, "forward"],
  ] as const) {
    if (!e.ready) continue;
    e.suggestion = null;
    e.hint = `Also drive ${other} at full speed: they are set together`;
  }
}

function brakingEstimate(
  stops: StopEvent[],
  topSpeed: number,
  needed: number,
  settings: Settings,
): Estimate {
  const label = "Braking";
  const usesFit =
    (settings.brakingQuadratic ?? 0) > 0 || (settings.brakingLinear ?? 0) > 0;
  const base = {
    key: "braking" as const,
    label,
    unit: "in",
    step: 0.1,
    count: stops.length,
    needed,
    note: usesFit
      ? undefined
      : "Your settings brake at Max Deceleration. Applying this switches to Pedro's braking curve.",
  };
  // Compared as the distance to stop from top speed.
  const current = topSpeed > 0 ? brakingDistance(topSpeed, settings) : null;
  const points = stops.flatMap((s) => s.points);
  if (stops.length === 0 || points.length < 3 || topSpeed <= 0) {
    return {
      ...base,
      current,
      measured: null,
      difference: null,
      spread: null,
      progress: 0,
      ready: false,
      hint: `Need ${plural(Math.max(1, needed - stops.length), STOPS)}`,
      suggestion: null,
    };
  }
  const { quadratic, linear, fit } = fitBraking(points);
  const measured = quadratic * topSpeed * topSpeed + linear * topSpeed;
  const enough = stops.length >= needed;
  const fits = fit >= MIN_BRAKING_FIT;
  const ready = enough && fits;
  const difference =
    current !== null && current > 0 ? measured / current - 1 : null;
  const q = roundTo(quadratic, 1e-5);
  const l = roundTo(linear, 1e-4);
  const changes =
    !usesFit ||
    Math.abs(q - (settings.brakingQuadratic ?? 0)) > 1e-9 ||
    Math.abs(l - (settings.brakingLinear ?? 0)) > 1e-9;
  return {
    ...base,
    current,
    measured,
    difference,
    spread: null,
    progress: ready ? 1 : 0.9 * Math.min(1, stops.length / needed),
    ready,
    hint: enough
      ? fits
        ? "Ready"
        : "Stops don't fit one braking curve yet; keep driving"
      : `Need ${plural(needed - stops.length, STOPS)}`,
    suggestion:
      ready &&
      changes &&
      difference !== null &&
      Math.abs(difference) > MIN_DIFFERENCE
        ? {
            key: "braking",
            patch: { brakingQuadratic: q, brakingLinear: l },
            label: `Use braking ${brakingFormula(q, l)}`,
            id: `braking:${q}:${l}`,
          }
        : null,
  };
}

/** The measured top speed: the fastest steady drive, else the fastest anything. */
export function observedTopSpeed(events: MotionEvent[]): number {
  let top = 0;
  for (const e of events) {
    if (e.kind === "cruise") top = Math.max(top, e.speed);
  }
  if (top > 0) return top;
  for (const e of events) {
    if (e.kind === "launch") top = Math.max(top, e.topSpeed);
    if (e.kind === "stop") top = Math.max(top, e.fromSpeed);
  }
  return top;
}

const MAX_FITTED_CORNERS = 20;

/** The gain explaining each corner, kept until the settings it was worked out with change. */
const gainCache = new WeakMap<
  CornerEvent,
  { key: string; gain: number | null }
>();

function cachedGain(corner: CornerEvent, settings: Settings) {
  const key = JSON.stringify([
    settings.maxVelocity,
    settings.maxAcceleration,
    settings.maxDeceleration,
    settings.brakingQuadratic,
    settings.brakingLinear,
    settings.kFriction,
    settings.pedroVersion,
  ]);
  const hit = gainCache.get(corner);
  if (hit?.key === key) return hit.gain;
  const gain = gainForCorner(corner, settings);
  gainCache.set(corner, { key, gain });
  return gain;
}

/**
 * The settings the gain is fitted with: the ones already measured, so the
 * gain doesn't make up for a wrong top speed or acceleration. They are
 * rounded as they would be set, so each new reading doesn't refit every
 * corner.
 */
function calibrated(settings: Settings, estimates: Estimate[]): Settings {
  const out = { ...settings };
  for (const e of estimates) {
    if (!e.ready || e.measured === null) continue;
    if (
      e.key === "maxVelocity" ||
      e.key === "maxAcceleration" ||
      e.key === "maxDeceleration"
    ) {
      out[e.key] = roundTo(e.measured, e.step);
    }
    if (e.key === "braking" && e.suggestion)
      Object.assign(out, e.suggestion.patch);
  }
  return out;
}

/** An estimate for each measured setting, in a fixed order. */
export function estimateSettings(
  events: MotionEvent[],
  settings: Settings,
  timeSource: TimeSource,
): Estimate[] {
  // Arrival times jitter, so each reading is less exact.
  const need = (n: number) => (timeSource === "arrival" ? n * 2 : n);
  const cruises = events.filter((e): e is CruiseEvent => e.kind === "cruise");
  const top = observedTopSpeed(events);
  const speeds = (list: CruiseEvent[]) =>
    list.length > 0 ? topCluster(list.map((c) => c.speed)) : [];
  const launches = events.filter(
    (e): e is LaunchEvent =>
      e.kind === "launch" && e.topSpeed >= MIN_LAUNCH_SHARE * top,
  );
  // Teleop stops are Pedro coasting, not braking at the end of a path.
  const stops = events.filter(
    (e): e is StopEvent =>
      e.kind === "stop" &&
      e.busy !== false &&
      e.fromSpeed >= MIN_STOP_SHARE * top,
  );
  const turns = events.filter((e): e is TurnEvent => e.kind === "turn");
  const usesBrakingFit =
    (settings.brakingQuadratic ?? 0) > 0 || (settings.brakingLinear ?? 0) > 0;

  const inches = (v: number) => v;
  const estimates = [
    readingEstimate({
      key: "maxVelocity",
      label: "Max Velocity",
      unit: "in/s",
      values: speeds(cruises),
      needed: need(3),
      maxSpread: 0.1,
      noun: ["full-speed drive", "full-speed drives"],
      current: settings.maxVelocity,
      toSetting: inches,
      step: 0.5,
    }),
    readingEstimate({
      key: "xVelocity",
      label: "Forward Velocity",
      unit: "in/s",
      values: speeds(cruises.filter((c) => c.direction === "forward")),
      needed: need(3),
      maxSpread: 0.1,
      noun: ["full-speed forward drive", "full-speed forward drives"],
      current: settings.xVelocity,
      toSetting: inches,
      step: 0.5,
    }),
    readingEstimate({
      key: "yVelocity",
      label: "Strafe Velocity",
      unit: "in/s",
      values: speeds(cruises.filter((c) => c.direction === "strafe")),
      needed: need(3),
      maxSpread: 0.1,
      noun: ["full-speed sideways drive", "full-speed sideways drives"],
      current: settings.yVelocity,
      toSetting: inches,
      step: 0.5,
    }),
    readingEstimate({
      key: "maxAcceleration",
      label: "Max Acceleration",
      unit: "in/s²",
      values: launches.map((l) => l.acceleration),
      needed: need(3),
      maxSpread: 0.15,
      noun: ["start from rest to full speed", "starts from rest to full speed"],
      current: settings.maxAcceleration,
      toSetting: inches,
      step: 1,
    }),
    readingEstimate({
      key: "maxDeceleration",
      label: "Max Deceleration",
      unit: "in/s²",
      values: stops.map((s) => s.deceleration),
      needed: need(3),
      maxSpread: 0.15,
      noun: STOPS,
      current: settings.maxDeceleration || settings.maxAcceleration,
      toSetting: inches,
      step: 1,
      note: usesBrakingFit
        ? "Not used while braking coefficients are set."
        : undefined,
    }),
    readingEstimate({
      key: "aVelocity",
      label: "Angular Velocity",
      unit: "°/s",
      values:
        turns.length > 0
          ? topCluster(turns.map((t) => t.rate * RAD_TO_DEG))
          : [],
      needed: need(3),
      maxSpread: 0.1,
      noun: ["turn in place", "turns in place"],
      current: settings.aVelocity * RAD_TO_DEG,
      toSetting: (deg) => deg / RAD_TO_DEG,
      step: 1,
    }),
    brakingEstimate(stops, top, need(4), settings),
  ];
  pairDirections(estimates[1], estimates[2]);

  // Only corners the robot swung at say how strong its correction is; the
  // latest few, since each is fitted by running the simulation many times.
  const corners = events
    .filter(
      (e): e is CornerEvent => e.kind === "corner" && e.swing >= MIN_SWING,
    )
    .slice(-MAX_FITTED_CORNERS);
  const fitWith = calibrated(settings, estimates);
  const gains = corners.flatMap((c) => {
    const gain = cachedGain(c, fitWith);
    return gain === null ? [] : [gain];
  });
  const held = events.filter(
    (e) => e.kind === "corner" && e.swing < MIN_SWING,
  ).length;
  const gain = readingEstimate({
    key: "translationalP",
    label: "Translational P",
    unit: "",
    values: gains,
    needed: need(3),
    maxSpread: 0.25,
    noun: ["chained corner it swings at", "chained corners it swings at"],
    current: settings.translationalP ?? DEFAULT_TRANSLATIONAL_P,
    toSetting: (gain) => gain,
    step: 0.01,
    note: "This makes the simulation's corners match the robot. To make the robot itself hold corners tighter, raise the translational kP in your Pedro constants.",
  });
  if (!gain.ready && held > 0) {
    const tight = `${held} corner${held === 1 ? "" : "s"} held too tightly to measure`;
    gain.hint =
      gains.length === 0
        ? `${tight}: the gain is strong`
        : `${gain.hint} (${tight})`;
  }
  estimates.push(gain);
  return estimates;
}
