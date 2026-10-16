// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Copies the project into the plain shapes of the plugin API (api/data.ts),
// so plugins never hold the app's own objects and the app can change its
// internals without breaking them.
import type {
  FieldPoint,
  HeadingInfo,
  JsonValue,
  PathInfo,
  Plan,
  PlanStep,
  ProjectSnapshot,
  StepInfo,
} from "../api";
import type {
  Line,
  Point,
  SequenceItem,
  Settings,
  Shape,
  TimePrediction,
} from "../../../types";
import { DEFAULT_ROBOT_LENGTH, DEFAULT_ROBOT_WIDTH } from "../../../config";
import * as d3 from "d3";
import { calculateRobotState } from "../../../utils/animation";
import { getCurvePoint, restingHeading } from "../../../utils/math";

/** The parts of the project a snapshot is made from. */
export interface ProjectState {
  startPoint: Point;
  lines: Line[];
  shapes: Shape[];
  sequence: SequenceItem[];
  settings: Settings;
  extraData: Record<string, any>;
  filePath: string | null;
}

const point = (p: { x: number; y: number }): FieldPoint => ({ x: p.x, y: p.y });

function headingOf(p: Point | undefined): HeadingInfo {
  switch (p?.heading) {
    case "constant":
      return { mode: "constant", degrees: p.degrees };
    case "linear":
      return { mode: "linear", startDegrees: p.startDeg, endDegrees: p.endDeg };
    case "facingPoint":
      return { mode: "facingPoint", x: p.targetX, y: p.targetY };
    case "piecewise":
      return { mode: "piecewise" };
    default:
      return { mode: "tangential", reverse: Boolean(p?.reverse) };
  }
}

/** The lines in the order the sequence drives them, with where each starts. */
function drivenLines(state: ProjectState) {
  const byId = new Map(state.lines.map((l) => [l.id, l]));
  const result: { line: Line; from: Point }[] = [];
  let previous: Point = state.startPoint;
  for (const item of state.sequence) {
    if (item.kind !== "path") continue;
    const line = byId.get(item.lineId);
    if (!line) continue;
    result.push({ line, from: line.startPoint ?? previous });
    previous = line.endPoint;
  }
  return result;
}

function stepOf(item: SequenceItem): StepInfo {
  switch (item.kind) {
    case "path":
      return { kind: "path", id: item.lineId, pathId: item.lineId };
    case "wait":
      return {
        kind: "wait",
        id: item.id,
        name: item.name ?? "",
        durationMs: item.durationMs,
      };
    case "rotate":
      return {
        kind: "rotate",
        id: item.id,
        name: item.name ?? "",
        degrees: item.degrees,
      };
    case "macro":
      return { kind: "macro", id: item.id, name: item.name ?? "" };
    case "plugin":
      return {
        kind: "plugin",
        id: item.id,
        type: item.type,
        name: item.name ?? "",
        data: structuredClone(item.data) as Record<string, JsonValue>,
      };
  }
}

/** The open project, as a plugin sees it. `pluginId` picks the plugin's own data. */
export function buildSnapshot(
  state: ProjectState,
  pluginId: string,
): ProjectSnapshot {
  const { settings } = state;
  const paths: PathInfo[] = drivenLines(state).map(({ line, from }) => ({
    id: line.id ?? "",
    name: line.name ?? "",
    color: line.color,
    from: point(from),
    to: point(line.endPoint),
    controlPoints: line.controlPoints.map(point),
    heading: headingOf(line.endPoint),
    chained: Boolean(line.isChain),
    locked: Boolean(line.locked),
    hidden: Boolean(line.hidden),
  }));

  const ownData = state.extraData?.plugins?.[pluginId];
  return {
    fileName: state.filePath?.split(/[\\/]/).pop() ?? null,
    start: {
      x: state.startPoint.x,
      y: state.startPoint.y,
      heading: restingHeading(state.startPoint),
    },
    paths,
    steps: state.sequence.map(stepOf),
    shapes: state.shapes.map((shape) => ({
      id: shape.id,
      name: shape.name ?? "",
      kind: shape.type === "keep-in" ? "keep-in" : "obstacle",
      vertices: shape.vertices.map(point),
      color: shape.color,
    })),
    robot: {
      length: settings.rLength || DEFAULT_ROBOT_LENGTH,
      width: settings.rWidth || DEFAULT_ROBOT_WIDTH,
      maxVelocity: settings.maxVelocity,
      maxAcceleration: settings.maxAcceleration,
      maxDeceleration: settings.maxDeceleration ?? settings.maxAcceleration,
      maxAngularVelocity: settings.aVelocity,
      driveType: settings.robotDriveType ?? "holonomic",
    },
    field: {
      width: settings.fieldWidth ?? 144,
      height: settings.fieldHeight ?? 144,
    },
    units: settings.visualizerUnits ?? "imperial",
    data: ownData === undefined ? null : structuredClone(ownData),
  };
}

/** Poses are sampled this often, unless the routine is very long. */
const SAMPLE_SECONDS = 0.02;
const MAX_SAMPLES = 15_000;

/** The step a timeline event belongs to. */
function stepIdOf(event: TimePrediction["timeline"][number]): string | null {
  if (event.type === "travel" || event.type === "recovery") {
    return event.line?.id ?? null;
  }
  return event.waitId ?? null;
}

/** What the robot is planned to do, from the app's own timing. */
export function buildPlan(
  state: Pick<ProjectState, "startPoint" | "lines" | "sequence">,
  prediction: TimePrediction | null,
): Plan {
  const timeline = prediction?.timeline ?? [];
  const duration = prediction?.totalTime ?? 0;
  const identity = d3.scaleLinear();

  const step = Math.max(SAMPLE_SECONDS, duration / MAX_SAMPLES);
  const poses = {
    t: [] as number[],
    x: [] as number[],
    y: [] as number[],
    heading: [] as number[],
  };
  for (let t = 0; ; t += step) {
    const time = Math.min(t, duration);
    const percent = duration > 0 ? (time / duration) * 100 : 0;
    const pose = calculateRobotState(
      percent,
      timeline,
      state.lines,
      state.startPoint,
      identity,
      identity,
    );
    poses.t.push(time);
    poses.x.push(pose.x);
    poses.y.push(pose.y);
    // calculateRobotState gives screen headings, which turn the other way.
    poses.heading.push(-pose.heading);
    if (time >= duration) break;
  }

  const kinds = new Map<string, StepInfo["kind"]>(
    state.sequence.map((item) => [
      item.kind === "path" ? item.lineId : item.id,
      item.kind,
    ]),
  );
  const steps: PlanStep[] = [];
  for (const event of timeline) {
    const id = stepIdOf(event);
    const kind = id ? kinds.get(id) : undefined;
    if (!id || !kind) continue;
    const last = steps.at(-1);
    if (last?.id === id) last.end = event.endTime;
    else steps.push({ id, kind, start: event.startTime, end: event.endTime });
  }

  const paths = timeline
    .filter((e) => e.type === "travel" && e.line && e.prevPoint)
    .map((e) => {
      const line = e.line!;
      const curve = [e.prevPoint!, ...line.controlPoints, line.endPoint];
      const points: FieldPoint[] = [];
      for (let i = 0; i <= 40; i++)
        points.push(point(getCurvePoint(i / 40, curve)));
      return { id: line.id ?? "", color: line.color, points };
    });

  return { duration, poses, steps, paths };
}
