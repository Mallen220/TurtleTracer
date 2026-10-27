// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Everything the robot sent while connected, kept so it can be saved to a
// file: to look at later, play back against the simulation, or compare with
// it. The file also holds the path and the motion settings the simulation
// was using, so the simulation can be run again exactly as it was.

import type { Line, Point, SequenceItem, Settings, Shape } from "../types";
import type { TelemetryPoint } from "../lib/telemetryStore";

export const TELEMETRY_FORMAT = "turtle-tracer-telemetry";
export const TELEMETRY_FORMAT_VERSION = 1;

/** The most messages kept: over an hour at 50 a second. The oldest go first. */
export const MAX_RECORDED = 200_000;

/** The settings the simulation reads; nothing else is saved. */
export const SIMULATION_SETTINGS = [
  "maxVelocity",
  "xVelocity",
  "yVelocity",
  "maxAcceleration",
  "maxDeceleration",
  "brakingQuadratic",
  "brakingLinear",
  "aVelocity",
  "maxAngularAcceleration",
  "translationalP",
  "kFriction",
  "pedroQuadraticBrakeForward",
  "pedroQuadraticBrakeStrafe",
  "pedroLinearBrakeForward",
  "pedroLinearBrakeStrafe",
  "pathSettleTime",
  "stopToTurn",
  "rLength",
  "rWidth",
] as const satisfies readonly (keyof Settings)[];

export interface RecordedMessage {
  /** When it arrived, in ms since 1970 (this computer's clock). */
  at: number;
  /** The message as the robot sent it. */
  message: Record<string, unknown>;
}

export interface RecordingSummary {
  messages: number;
  /** Seconds from the first message kept to the last. */
  seconds: number;
  /** Times the robot started the first path of an OpMode. */
  runs: number;
  /** Whether old messages were dropped to stay under the limit. */
  trimmed: boolean;
}

export interface TelemetryExport {
  format: typeof TELEMETRY_FORMAT;
  formatVersion: number;
  exportedAt: string;
  app: { name: string; version: string };
  /** What the numbers mean. */
  units: Record<string, string>;
  project: {
    file: string | null;
    startPoint: Point;
    lines: Line[];
    sequence: SequenceItem[];
    shapes: Shape[];
  };
  settings: Partial<Settings>;
  /** Where the robot started the first path of an OpMode: indexes into `messages`. */
  runStarts: { at: number; index: number }[];
  /** True if older messages were dropped to stay under the limit. */
  trimmed: boolean;
  messages: RecordedMessage[];
}

export class TelemetryRecording {
  private messages: RecordedMessage[] = [];
  private runStarts: { at: number; index: number }[] = [];
  private dropped = 0;

  add(message: Record<string, unknown>, at: number) {
    this.messages.push({ at, message });
    if (this.messages.length > MAX_RECORDED) {
      // Dropping a batch at once keeps this from copying the array every message.
      const drop = Math.ceil(MAX_RECORDED / 10);
      this.messages.splice(0, drop);
      this.dropped += drop;
      this.runStarts = this.runStarts
        .map((r) => ({ ...r, index: r.index - drop }))
        .filter((r) => r.index >= 0);
    }
  }

  /** Marks the last message as where the robot started its first path. */
  markRunStart() {
    const last = this.messages.at(-1);
    if (last) {
      this.runStarts.push({ at: last.at, index: this.messages.length - 1 });
    }
  }

  clear() {
    this.messages = [];
    this.runStarts = [];
    this.dropped = 0;
  }

  get summary(): RecordingSummary {
    const first = this.messages[0];
    const last = this.messages.at(-1);
    return {
      messages: this.messages.length,
      seconds: first && last ? (last.at - first.at) / 1000 : 0,
      runs: this.runStarts.length,
      trimmed: this.dropped > 0,
    };
  }

  toExport(context: {
    file: string | null;
    startPoint: Point;
    lines: Line[];
    sequence: SequenceItem[];
    shapes: Shape[];
    settings: Settings;
    appVersion: string;
    now?: Date;
  }): TelemetryExport {
    const settings: Partial<Settings> = {};
    for (const key of SIMULATION_SETTINGS) {
      if (context.settings[key] !== undefined) {
        (settings as Record<string, unknown>)[key] = context.settings[key];
      }
    }
    return {
      format: TELEMETRY_FORMAT,
      formatVersion: TELEMETRY_FORMAT_VERSION,
      exportedAt: (context.now ?? new Date()).toISOString(),
      app: { name: "Turtle Tracer", version: context.appVersion },
      units: {
        at: "ms since 1970, when the message arrived",
        "t, timestamp":
          "ms, the robot's clock (t from TurtleTracerLib, timestamp from Panels)",
        "x, y, cx, cy": "inches, Pedro coordinates",
        heading: "radians",
        "vx, vy": "in/s, field frame",
        omega: "rad/s",
        aVelocity: "rad/s",
      },
      project: {
        file: context.file,
        startPoint: context.startPoint,
        lines: context.lines,
        sequence: context.sequence,
        shapes: context.shapes,
      },
      settings,
      runStarts: this.runStarts.map((r) => ({ ...r })),
      trimmed: this.dropped > 0,
      messages: this.messages.slice(),
    };
  }
}

/** A name for an exported recording, from the project's file and the time. */
export function recordingFileName(file: string | null, now = new Date()) {
  const base = (file?.split(/[\\/]/).pop() ?? "robot")
    .replace(/\.(turt|pp)$/i, "")
    .replace(/[^\w.-]+/g, "_");
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${base}_telemetry_${stamp}.json`;
}

export function isTelemetryExport(data: unknown): data is TelemetryExport {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { format?: unknown }).format === TELEMETRY_FORMAT &&
    Array.isArray((data as { messages?: unknown }).messages)
  );
}

const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);

/**
 * The robot's poses in an exported recording, for playing it back as a ghost
 * robot (heading in degrees). It starts where the robot started its first
 * path, if it did, so it lines up with the simulation starting there.
 */
export function pointsFromExport(data: TelemetryExport): TelemetryPoint[] {
  const from = data.runStarts[0]?.index ?? 0;
  const points: TelemetryPoint[] = [];
  for (const { at, message } of data.messages.slice(from)) {
    const pose = (message.robotPose ?? message) as Record<string, unknown>;
    if (!finite(pose.x) || !finite(pose.y) || !finite(pose.heading)) continue;
    const clock = message.t ?? message.timestamp;
    const robotMs = finite(clock) ? (clock as number) : at;
    points.push({
      time: robotMs / 1000,
      x: pose.x as number,
      y: pose.y as number,
      heading: ((pose.heading as number) * 180) / Math.PI,
    });
  }
  return points;
}
