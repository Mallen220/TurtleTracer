// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import {
  analyzePathSegment,
  calculatePathTime,
  startingHeading,
} from "./timeCalculator";
import { chainCornerIssues } from "./timeCalculator/chainIssues";
import { GRAVITY } from "./timeCalculator/lateralLimit";
import { bendAdvice } from "./timeCalculator/advice";
import {
  cornerSpeedFixes,
  followsBends,
  speedFixes,
  type SpeedFix,
} from "./timeCalculator/fixSearch";
import { getAngularDifference } from "./math";
import { MAX_MACRO_DEPTH } from "../config";
import type {
  Point,
  Line,
  SequenceItem,
  Settings,
  TimelineEvent,
  RecoveryTrace,
  Excursion,
} from "../types";

export interface SegmentStat {
  name: string;
  startTime: number;
  length: number;
  time: number;
  maxVel: number;
  maxAngVel: number;
  degrees: number;
  color: string;
}

export interface Insight {
  startTime: number;
  endTime?: number;
  type: "warning" | "info" | "error";
  message: string;
  value?: number;
  /** Where clicking the insight takes the timeline, if not to `startTime`. */
  seekTime?: number;
  /** Changes that clear it, each of which has been tried in the simulation. */
  fixes?: SpeedFix[];
  /** What `value` is, with its unit, e.g. "Swing: 7.7 in". */
  valueLabel?: string;
}

export interface PathStats {
  totalTime: number;
  totalDistance: number;
  maxLinearVelocity: number;
  maxAngularVelocity: number;
  segments: SegmentStat[];
  velocityData: { time: number; value: number }[];
  angularVelocityData: { time: number; value: number }[];
  accelerationData: { time: number; value: number }[];
  centripetalData: { time: number; value: number }[];
  insights: Insight[];
}

type DataPoint = { time: number; value: number };

const toRadians = (deg: number) => (deg * Math.PI) / 180;

/**
 * Turns a condition that is checked at each sample into one insight per
 * stretch of time it holds, remembering the peak value in that stretch.
 */
class InsightTracker {
  private open: Insight | null = null;

  constructor(
    private type: Insight["type"],
    private message: string,
    private out: Insight[],
  ) {}

  sample(time: number, active: boolean, value: number) {
    if (!active) {
      this.close(time);
    } else if (!this.open) {
      this.open = {
        startTime: time,
        type: this.type,
        message: this.message,
        value,
      };
    } else if (value > (this.open.value || 0)) {
      this.open.value = value;
    }
  }

  close(time: number) {
    if (!this.open) return;
    this.out.push({ ...this.open, endTime: time });
    this.open = null;
  }
}

/** The sequence's steps in the order they run, with macros replaced by their own steps. */
function stepsInOrder(items: SequenceItem[], depth = 0): SequenceItem[] {
  if (depth > MAX_MACRO_DEPTH) return [];
  return items.flatMap((item) =>
    item.kind === "macro"
      ? stepsInOrder(item.sequence ?? [], depth + 1)
      : [item],
  );
}

/** The turn between two headings, in degrees. */
const turnBetween = (from: number | undefined, to: number | undefined) =>
  Math.abs(getAngularDifference(from ?? 0, to ?? 0));

/**
 * Collects the graph data, the table rows and the warnings for one path as the
 * steps and the timeline are walked through together.
 */
class StatsCollector {
  readonly segments: SegmentStat[] = [];
  readonly velocityData: DataPoint[] = [];
  readonly angularVelocityData: DataPoint[] = [];
  readonly accelerationData: DataPoint[] = [];
  readonly centripetalData: DataPoint[] = [];
  readonly insights: Insight[] = [];
  maxLinear = 0;
  maxAngular = 0;

  private heading: number;
  private position: Point;

  private readonly maxVel: number;
  private readonly kFriction: number;
  /** Beyond this sideways acceleration the wheels are likely to slip. */
  private readonly frictionLimit: number;
  private readonly maxAccel: number;
  private readonly maxDecel: number;
  /** Speeding up or slowing down faster than the limits the simulation is meant to respect means the speed profile can't be trusted there. */
  private readonly accelTolerance = 1.1;
  private readonly speedWarning = new InsightTracker(
    "info",
    "Max Velocity Reached",
    this.insights,
  );
  private readonly slipWarning = new InsightTracker(
    "error",
    "Risk of Wheel Slip (Centripetal)",
    this.insights,
  );
  private readonly accelWarning = new InsightTracker(
    "warning",
    "Acceleration beyond the robot's limit",
    this.insights,
  );

  constructor(
    private readonly startPoint: Point,
    private readonly lines: Line[],
    private readonly sequence: SequenceItem[],
    private readonly settings: Settings,
  ) {
    this.maxVel = settings.maxVelocity || 100;
    this.kFriction = settings.kFriction || 0;
    this.frictionLimit = this.kFriction * GRAVITY;
    this.maxAccel = settings.maxAcceleration || 0;
    this.maxDecel = settings.maxDeceleration || 0;
    this.heading = startingHeading(startPoint, lines, sequence);
    this.position = startPoint;
  }

  /** Where a step with no timeline event would start: right after the last one. */
  endOfLastSegment() {
    const last = this.segments.at(-1);
    return last ? last.startTime + last.time : 0;
  }

  addDataPoint(
    time: number,
    linear: number,
    angular: number,
    acceleration: number,
    centripetal: number,
  ) {
    this.velocityData.push({ time, value: linear });
    this.angularVelocityData.push({ time, value: angular });
    this.accelerationData.push({ time, value: acceleration });
    this.centripetalData.push({ time, value: centripetal });
    this.speedWarning.sample(time, linear >= this.maxVel * 0.99, linear);
    this.accelWarning.sample(
      time,
      (this.maxAccel > 0 &&
        acceleration > this.maxAccel * this.accelTolerance) ||
        (this.maxDecel > 0 &&
          -acceleration > this.maxDecel * this.accelTolerance),
      Math.abs(acceleration),
    );
    this.slipWarning.sample(
      time,
      this.kFriction > 0 && centripetal > this.frictionLimit,
      centripetal,
    );
  }

  /** Graph points for a wait (or a turn in place, which is a wait event). */
  graphStationaryEvent(ev: TimelineEvent) {
    if (ev.type !== "wait" || ev.duration <= 0) return;
    const turn = turnBetween(ev.startHeading, ev.targetHeading);
    this.addDataPoint(ev.startTime, 0, 0, 0, 0);
    if (turn > 0.1) {
      // Draw the turn as a trapezoid: speed up, hold, slow down.
      const angular = toRadians(turn) / ev.duration;
      this.addDataPoint(ev.startTime + ev.duration * 0.1, 0, angular, 0, 0);
      this.addDataPoint(ev.endTime - ev.duration * 0.1, 0, angular, 0, 0);
    }
    this.addDataPoint(ev.endTime, 0, 0, 0, 0);
  }

  /** A row for a turn in place the simulation added before a path. */
  listInsertedTurn(ev: TimelineEvent) {
    if (ev.type !== "wait" || ev.waitId) return;
    const turn = turnBetween(ev.startHeading, ev.targetHeading);
    this.segments.push({
      name: "Turn",
      startTime: ev.startTime,
      length: 0,
      time: ev.duration,
      maxVel: 0,
      maxAngVel: ev.duration > 0 ? toRadians(turn) / ev.duration : 0,
      degrees: turn,
      color: "#d946ef",
    });
  }

  /**
   * Graph points and a row for the stretch where the robot is off the path
   * between two chained paths. Speeds come from how far the robot moves.
   */
  graphRecovery(ev: TimelineEvent) {
    const trace = ev.type === "recovery" ? ev.trace : undefined;
    if (!trace || trace.time.length < 2) return;
    const { distance, topSpeed } = this.graphTrace(trace, ev.startTime);
    this.segments.push({
      name: "Chained corner",
      startTime: ev.startTime,
      length: distance,
      time: ev.duration,
      maxVel: topSpeed,
      maxAngVel: 0,
      degrees: 0,
      color: "#eab308",
    });
    this.maxLinear = Math.max(this.maxLinear, topSpeed);
  }

  /**
   * Graph points for a stretch where the robot is off its path, from where it
   * goes. Speeds come from how far the robot moves. With `turning`, its turn
   * rate is graphed too, from its heading along the way.
   */
  private graphTrace(trace: RecoveryTrace, startTime: number, turning = false) {
    const stride = 5;
    let previous: {
      vx: number;
      vy: number;
      speed: number;
      time: number;
    } | null = null;
    let distance = 0;
    let topSpeed = 0;
    let topAngular = 0;
    let degrees = 0;
    for (let i = 0; i < trace.time.length; i += stride) {
      const j = Math.min(i + stride, trace.time.length - 1);
      const dt = trace.time[j] - trace.time[i];
      if (dt <= 0) break;
      const vx = (trace.x[j] - trace.x[i]) / dt;
      const vy = (trace.y[j] - trace.y[i]) / dt;
      const speed = Math.hypot(vx, vy);
      distance += Math.hypot(trace.x[j] - trace.x[i], trace.y[j] - trace.y[i]);
      topSpeed = Math.max(topSpeed, speed);

      let angular = 0;
      if (turning) {
        const turn = turnBetween(trace.heading[i], trace.heading[j]);
        degrees += turn;
        angular = toRadians(turn) / dt;
        topAngular = Math.max(topAngular, angular);
      }

      let acceleration = 0;
      let sideways = 0;
      if (previous) {
        const span = trace.time[i] - previous.time;
        const ax = (vx - previous.vx) / span;
        const ay = (vy - previous.vy) / span;
        acceleration = (speed - previous.speed) / span;
        sideways = Math.sqrt(
          Math.max(0, ax * ax + ay * ay - acceleration ** 2),
        );
      }
      this.addDataPoint(
        startTime + trace.time[i],
        speed,
        angular,
        acceleration,
        sideways,
      );
      previous = { vx, vy, speed, time: trace.time[i] };
    }
    const last = trace.time.length - 1;
    this.addDataPoint(
      startTime + trace.time[last],
      previous?.speed ?? 0,
      0,
      0,
      0,
    );
    return { distance, topSpeed, topAngular, degrees };
  }

  /** The row for a wait, graphing it if it has a timeline event. */
  addWait(
    item: Extract<SequenceItem, { kind: "wait" }>,
    event?: TimelineEvent,
  ) {
    if (event) this.graphStationaryEvent(event);
    this.segments.push({
      name: item.name || "Wait",
      startTime: event ? event.startTime : this.endOfLastSegment(),
      length: 0,
      time: event ? event.duration : item.durationMs / 1000,
      maxVel: 0,
      maxAngVel: 0,
      degrees: 0,
      color: "#f59e0b",
    });
  }

  /** The row for a turn in place, graphing it if it has a timeline event. */
  addRotate(
    item: Extract<SequenceItem, { kind: "rotate" }>,
    event?: TimelineEvent,
  ) {
    if (event) this.graphStationaryEvent(event);
    const turn =
      event && event.duration > 0
        ? Math.abs(
            getAngularDifference(event.startHeading!, event.targetHeading!),
          )
        : 0;
    this.segments.push({
      name: item.name || "Rotate",
      startTime: event ? event.startTime : this.endOfLastSegment(),
      length: 0,
      time: event ? event.duration : 0,
      maxVel: 0,
      maxAngVel:
        event && event.duration > 0 ? toRadians(turn) / event.duration : 0,
      degrees: turn,
      color: "#d946ef",
    });
  }

  /**
   * Speeds and acceleration at step `i` of a path's motion profile. Where the
   * event has no speed profile, they come from how far the step goes.
   */
  private stepMetrics(
    i: number,
    ev: TimelineEvent,
    profile: number[],
    analysis: ReturnType<typeof analyzePathSegment>,
  ) {
    const headings = ev.headingProfile;
    const velocities = ev.velocityProfile;
    const step = analysis.steps[i];
    const dt = profile[i + 1] - profile[i];
    const moving = dt > 1e-6;

    let linear = 0;
    if (velocities && velocities.length > i) linear = velocities[i];
    else if (moving) linear = step.deltaLength / dt;

    let angular = 0;
    let turn = 0;
    if (moving) {
      turn =
        headings && headings.length > i + 1
          ? Math.abs(getAngularDifference(headings[i], headings[i + 1]))
          : step.rotation;
      angular = toRadians(turn) / dt;
    }

    let acceleration = 0;
    if (moving) {
      let next = 0;
      if (velocities && velocities.length > i + 1) next = velocities[i + 1];
      else if (analysis.steps[i + 1]) {
        next = analysis.steps[i + 1].deltaLength / dt;
      }
      acceleration = (next - linear) / dt;
    }

    const centripetal =
      step.radius > 0.001 ? (linear * linear) / step.radius : 0;
    return { linear, angular, turn, acceleration, centripetal };
  }

  /**
   * Graph points for the steps of a path's motion profile the robot drives.
   * The robot may join the path part way along, or be handed over before its
   * end; steps it doesn't drive have no place on the graph.
   */
  private graphProfile(
    ev: TimelineEvent,
    profile: number[],
    analysis: ReturnType<typeof analyzePathSegment>,
  ) {
    const velocities = ev.velocityProfile;
    let maxLinear = 0;
    let maxAngular = 0;
    let degreesTurned = 0;

    const count = Math.min(profile.length - 1, analysis.steps.length);
    // The steps the robot skips while it is off the path round a bend are
    // graphed from where it goes instead: they'd show the sideways
    // acceleration of a robot that stayed on it.
    const { excursion } = ev;
    const wideFrom = excursion ? Math.round(excursion.fromT * count) : count;
    const wideTo = excursion ? Math.round(excursion.toT * count) : count;
    let end = count;
    for (let i = 0; i < count; i++) {
      if (excursion && i >= wideFrom && i < wideTo) {
        if (i === wideFrom) {
          const wide = this.graphTrace(
            excursion.trace,
            ev.startTime + excursion.startTime,
            true,
          );
          degreesTurned += wide.degrees;
          maxLinear = Math.max(maxLinear, wide.topSpeed);
          maxAngular = Math.max(maxAngular, wide.topAngular);
        }
        continue;
      }
      if (profile[i + 1] <= 1e-7) continue;
      if (profile[i] >= ev.duration - 1e-9) {
        end = i;
        break;
      }
      const m = this.stepMetrics(i, ev, profile, analysis);
      degreesTurned += m.turn;
      maxLinear = Math.max(maxLinear, m.linear);
      maxAngular = Math.max(maxAngular, m.angular);
      this.addDataPoint(
        ev.startTime + Math.max(0, profile[i]),
        m.linear,
        m.angular,
        m.acceleration,
        m.centripetal,
      );
    }
    // Finish at the speed the robot actually leaves at; chained paths carry
    // on without stopping, so this isn't always zero.
    const exitSpeed =
      velocities && velocities.length > end ? velocities[end] : 0;
    this.addDataPoint(ev.endTime, exitSpeed, 0, 0, 0);
    return { maxLinear, maxAngular, degreesTurned };
  }

  /** The warning for a path whose bend the robot can't follow at the speed it is going. */
  private noteExcursion(line: Line, ev: TimelineEvent, excursion: Excursion) {
    const start = ev.startTime + excursion.startTime;
    // What to set is found by trying it, so only what works is offered.
    const fixes = speedFixes(
      {
        startPoint: this.startPoint,
        lines: this.lines,
        sequence: this.sequence,
        settings: this.settings,
      },
      ev.lineIndex ?? -1,
      followsBends(this.settings),
    );
    this.insights.push({
      startTime: start,
      endTime: start + excursion.duration,
      // Clicking it goes to the tightest part of the bend, where the path is
      // best split.
      seekTime: ev.startTime + excursion.tightest.time,
      type: excursion.settled ? "warning" : "error",
      message: bendAdvice(
        line.name || "This path",
        excursion,
        this.settings,
        fixes.find((fix) => fix.field === "maxSpeed")?.speed ?? null,
      ),
      value: excursion.maxOffset,
      valueLabel: `Wide by: ${excursion.maxOffset.toFixed(1)} in`,
      ...(fixes.length > 0 ? { fixes } : {}),
    });
  }

  /** Samples along one path's motion profile and adds its segment row. */
  analyzeTravel(line: Line, ev: TimelineEvent) {
    const profile = ev.motionProfile;
    const headings = ev.headingProfile;
    const analysis = analyzePathSegment(
      this.position,
      line.controlPoints as any,
      line.endPoint as any,
      profile?.length
        ? profile.length - 1
        : (this.settings as any).resolution || 100,
      headings?.length ? headings[0] : this.heading,
      // The profile's steps must line up with the analysis's steps.
      profile?.length ? profile.length - 1 : 0,
    );

    let segMaxLinear = 0;
    let segMaxAngular = 0;
    let degreesTurned = 0;

    if (profile && analysis.steps.length > 0) {
      ({
        maxLinear: segMaxLinear,
        maxAngular: segMaxAngular,
        degreesTurned,
      } = this.graphProfile(ev, profile, analysis));
      if (ev.excursion) this.noteExcursion(line, ev, ev.excursion);
    } else {
      // No profile: assume constant speed across the segment.
      if (ev.duration > 0) {
        segMaxLinear = analysis.length / ev.duration;
        segMaxAngular = toRadians(analysis.netRotation) / ev.duration;
        this.addDataPoint(ev.startTime, segMaxLinear, segMaxAngular, 0, 0);
        this.addDataPoint(ev.endTime, segMaxLinear, segMaxAngular, 0, 0);
      }
      degreesTurned =
        line.endPoint.heading === "tangential"
          ? analysis.tangentRotation
          : Math.abs(analysis.netRotation);
    }

    this.segments.push({
      name:
        line.name ||
        `Path ${this.lines.findIndex((l) => l.id === line.id) + 1}`,
      startTime: ev.startTime,
      length: analysis.length,
      time: ev.duration,
      maxVel: segMaxLinear,
      maxAngVel: segMaxAngular,
      degrees: degreesTurned,
      color: line.color,
    });
    this.maxLinear = Math.max(this.maxLinear, segMaxLinear);
    this.maxAngular = Math.max(this.maxAngular, segMaxAngular);

    this.position = line.endPoint;
    this.heading = analysis.startHeading + analysis.netRotation;
  }

  /** Ends the warnings that are still going when the path finishes. */
  closeWarnings(totalTime: number) {
    this.speedWarning.close(totalTime);
    this.accelWarning.close(totalTime);
    this.slipWarning.close(totalTime);
  }
}

/** A place in the timeline, moving forward as the steps that own its events are graphed. */
class TimelineCursor {
  private position = 0;

  constructor(
    private readonly stats: StatsCollector,
    private readonly timeline: TimelineEvent[],
  ) {}

  /**
   * The index of the next event that belongs to a step, or -1. The events
   * passed on the way (inserted turns, say) are graphed as they are.
   */
  seek(belongsTo: (ev: TimelineEvent) => boolean): number {
    const found = this.timeline.findIndex(
      (ev, i) => i >= this.position && belongsTo(ev),
    );
    if (found === -1) return -1;
    for (let i = this.position; i < found; i++) {
      this.stats.graphStationaryEvent(this.timeline[i]);
      this.stats.graphRecovery(this.timeline[i]);
      this.stats.listInsertedTurn(this.timeline[i]);
    }
    this.position = found;
    return found;
  }

  /** The event at `found` (from `seek`), moving past it. */
  take(found: number): TimelineEvent | undefined {
    return found === -1 ? undefined : this.timeline[this.position++];
  }
}

/**
 * Walks the steps and the timeline together, graphing each step. Timeline
 * events between two steps (e.g. inserted turns) are graphed as they're passed.
 */
function graphSteps(
  stats: StatsCollector,
  steps: SequenceItem[],
  lines: Line[],
  timeline: TimelineEvent[],
) {
  const lineIndexById = new Map(lines.map((l, i) => [l.id, i]));
  const eventBelongsTo = (item: SequenceItem) => (ev: TimelineEvent) => {
    if (item.kind === "wait" || item.kind === "rotate") {
      // Turns in place are "wait" events in the timeline.
      return ev.type === "wait" && ev.waitId === item.id;
    }
    if (item.kind === "path") {
      const idx = lineIndexById.get(item.lineId);
      return idx !== undefined && ev.type === "travel" && ev.lineIndex === idx;
    }
    return false;
  };

  const cursor = new TimelineCursor(stats, timeline);
  for (const item of steps) {
    const found = cursor.seek(eventBelongsTo(item));
    if (item.kind === "wait") {
      stats.addWait(item, cursor.take(found));
    } else if (item.kind === "rotate") {
      stats.addRotate(item, cursor.take(found));
    } else if (item.kind === "path") {
      const line = lines[lineIndexById.get(item.lineId) ?? -1];
      if (line && found !== -1) stats.analyzeTravel(line, cursor.take(found)!);
    }
  }
}

/**
 * Speeds, accelerations, per-segment totals and warnings for the path, as
 * shown in the Path Statistics panel. Times are in seconds.
 */
export function computePathStatistics(
  startPoint: Point,
  lines: Line[],
  sequence: SequenceItem[],
  settings: Settings,
): PathStats {
  const prediction = calculatePathTime(startPoint, lines, settings, sequence);
  const timeline: TimelineEvent[] = prediction.timeline || [];
  const stats = new StatsCollector(startPoint, lines, sequence, settings);

  stats.addDataPoint(0, 0, 0, 0, 0);
  graphSteps(stats, stepsInOrder(sequence), lines, timeline);

  // The chained corners worth a word: each is said once. Where slowing down
  // gets the robot through, faster than stopping there, that is offered
  // (tried in the simulation).
  for (const issue of chainCornerIssues(
    timeline,
    startPoint,
    lines,
    sequence,
    settings,
  )) {
    const fixes = cornerSpeedFixes(
      { startPoint, lines, sequence, settings },
      issue.lineIndex,
    );
    stats.insights.push({
      startTime: issue.startTime,
      endTime: issue.endTime,
      type: issue.severity,
      message: issue.message,
      value: issue.value,
      valueLabel: issue.valueLabel,
      ...(fixes.length > 0 ? { fixes } : {}),
    });
  }

  stats.insights.sort((a, b) => a.startTime - b.startTime);
  stats.closeWarnings(prediction.totalTime);

  return {
    totalTime: prediction.totalTime,
    totalDistance: prediction.totalDistance,
    maxLinearVelocity: stats.maxLinear,
    maxAngularVelocity: stats.maxAngular,
    segments: stats.segments,
    velocityData: stats.velocityData,
    angularVelocityData: stats.angularVelocityData,
    accelerationData: stats.accelerationData,
    centripetalData: stats.centripetalData,
    insights: stats.insights,
  };
}
