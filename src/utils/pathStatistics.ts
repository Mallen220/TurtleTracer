// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import {
  analyzePathSegment,
  calculatePathTime,
  startingHeading,
} from "./timeCalculator";
import { getAngularDifference } from "./math";
import type {
  Point,
  Line,
  SequenceItem,
  Settings,
  TimelineEvent,
} from "../types";

export interface SegmentStat {
  name: string;
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

const GRAVITY = 386.22; // in/s^2
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

  const segments: SegmentStat[] = [];
  const velocityData: DataPoint[] = [];
  const angularVelocityData: DataPoint[] = [];
  const accelerationData: DataPoint[] = [];
  const centripetalData: DataPoint[] = [];
  const insights: Insight[] = [];

  const maxVel = settings.maxVelocity || 100;
  const kFriction = settings.kFriction || 0;
  // Beyond this sideways acceleration the wheels are likely to slip.
  const frictionLimit = kFriction * GRAVITY;
  const speedWarning = new InsightTracker(
    "info",
    "Max Velocity Reached",
    insights,
  );
  const slipWarning = new InsightTracker(
    "error",
    "Risk of Wheel Slip (Centripetal)",
    insights,
  );

  function addDataPoint(
    time: number,
    linear: number,
    angular: number,
    acceleration: number,
    centripetal: number,
  ) {
    velocityData.push({ time, value: linear });
    angularVelocityData.push({ time, value: angular });
    accelerationData.push({ time, value: acceleration });
    centripetalData.push({ time, value: centripetal });
    speedWarning.sample(time, linear >= maxVel * 0.99, linear);
    slipWarning.sample(
      time,
      kFriction > 0 && centripetal > frictionLimit,
      centripetal,
    );
  }

  /** Graph points for a wait (or a turn in place, which is a wait event). */
  function graphStationaryEvent(ev: TimelineEvent) {
    if (ev.type !== "wait" || ev.duration <= 0) return;
    const turn = Math.abs(
      getAngularDifference(ev.startHeading || 0, ev.targetHeading || 0),
    );
    addDataPoint(ev.startTime, 0, 0, 0, 0);
    if (turn > 0.1) {
      // Draw the turn as a trapezoid: speed up, hold, slow down.
      const angular = toRadians(turn) / ev.duration;
      addDataPoint(ev.startTime + ev.duration * 0.1, 0, angular, 0, 0);
      addDataPoint(ev.endTime - ev.duration * 0.1, 0, angular, 0, 0);
    }
    addDataPoint(ev.endTime, 0, 0, 0, 0);
  }

  let heading = startingHeading(startPoint, lines, sequence);
  let position: Point = startPoint;
  let maxLinear = 0;
  let maxAngular = 0;

  /** Samples along one path's motion profile and adds its segment row. */
  function analyzeTravel(line: Line, ev: TimelineEvent) {
    const profile = ev.motionProfile;
    const headings = ev.headingProfile;
    const velocities = ev.velocityProfile;
    const analysis = analyzePathSegment(
      position,
      line.controlPoints as any,
      line.endPoint as any,
      profile?.length
        ? profile.length - 1
        : (settings as any).resolution || 100,
      headings?.length ? headings[0] : heading,
    );

    let segMaxLinear = 0;
    let segMaxAngular = 0;
    let degreesTurned = 0;

    if (profile && analysis.steps.length > 0) {
      const count = Math.min(profile.length - 1, analysis.steps.length);
      for (let i = 0; i < count; i++) {
        const step = analysis.steps[i];
        const dt = profile[i + 1] - profile[i];
        const moving = dt > 1e-6;

        let linear = 0;
        if (velocities && velocities.length > i) linear = velocities[i];
        else if (moving) linear = step.deltaLength / dt;

        let angular = 0;
        if (moving) {
          const turn =
            headings && headings.length > i + 1
              ? Math.abs(getAngularDifference(headings[i], headings[i + 1]))
              : step.rotation;
          angular = toRadians(turn) / dt;
          degreesTurned += turn;
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

        segMaxLinear = Math.max(segMaxLinear, linear);
        segMaxAngular = Math.max(segMaxAngular, angular);
        addDataPoint(
          ev.startTime + profile[i],
          linear,
          angular,
          acceleration,
          centripetal,
        );
      }
      addDataPoint(ev.endTime, 0, 0, 0, 0);
    } else {
      // No profile: assume constant speed across the segment.
      if (ev.duration > 0) {
        segMaxLinear = analysis.length / ev.duration;
        segMaxAngular = toRadians(analysis.netRotation) / ev.duration;
        addDataPoint(ev.startTime, segMaxLinear, segMaxAngular, 0, 0);
        addDataPoint(ev.endTime, segMaxLinear, segMaxAngular, 0, 0);
      }
      degreesTurned =
        line.endPoint.heading === "tangential"
          ? analysis.tangentRotation
          : Math.abs(analysis.netRotation);
    }

    segments.push({
      name: line.name || `Path ${lines.findIndex((l) => l.id === line.id) + 1}`,
      length: analysis.length,
      time: ev.duration,
      maxVel: segMaxLinear,
      maxAngVel: segMaxAngular,
      degrees: degreesTurned,
      color: line.color,
    });
    maxLinear = Math.max(maxLinear, segMaxLinear);
    maxAngular = Math.max(maxAngular, segMaxAngular);

    position = line.endPoint;
    heading = analysis.startHeading + analysis.netRotation;
  }

  const lineIndexById = new Map(lines.map((l, i) => [l.id, i]));
  const eventBelongsTo = (item: SequenceItem, ev: TimelineEvent) => {
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

  addDataPoint(0, 0, 0, 0, 0);

  // Walk the sequence and the timeline together. Timeline events between
  // two sequence items (e.g. inserted turns) are graphed as they're passed.
  let cursor = 0;
  for (const item of sequence) {
    const found = timeline.findIndex(
      (ev, i) => i >= cursor && eventBelongsTo(item, ev),
    );
    let event: TimelineEvent | undefined;
    if (found !== -1) {
      for (let i = cursor; i < found; i++) graphStationaryEvent(timeline[i]);
      cursor = found;
    }

    if (item.kind === "wait" || item.kind === "rotate") {
      if (found !== -1) {
        event = timeline[found];
        cursor++;
        graphStationaryEvent(event);
      }
      if (item.kind === "wait") {
        segments.push({
          name: item.name || "Wait",
          length: 0,
          time: event ? event.duration : item.durationMs / 1000,
          maxVel: 0,
          maxAngVel: 0,
          degrees: 0,
          color: "#f59e0b",
        });
      } else {
        const turn =
          event && event.duration > 0
            ? Math.abs(
                getAngularDifference(event.startHeading!, event.targetHeading!),
              )
            : 0;
        segments.push({
          name: item.name || "Rotate",
          length: 0,
          time: event ? event.duration : 0,
          maxVel: 0,
          maxAngVel:
            event && event.duration > 0 ? toRadians(turn) / event.duration : 0,
          degrees: turn,
          color: "#d946ef",
        });
      }
      continue;
    }

    if (item.kind !== "path") continue;
    const line = lines[lineIndexById.get(item.lineId) ?? -1];
    if (!line || found === -1) continue;
    cursor++;
    analyzeTravel(line, timeline[found]);
  }

  speedWarning.close(prediction.totalTime);
  slipWarning.close(prediction.totalTime);

  return {
    totalTime: prediction.totalTime,
    totalDistance: prediction.totalDistance,
    maxLinearVelocity: maxLinear,
    maxAngularVelocity: maxAngular,
    segments,
    velocityData,
    angularVelocityData,
    accelerationData,
    centripetalData,
    insights,
  };
}
