// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// One run of the real robot, from live telemetry: the moment it starts the
// first path of an OpMode (so the simulation can start with it), and the
// route it has driven since, drawn on the field as a trail.

interface Vec {
  x: number;
  y: number;
}

export interface LiveSample extends Vec {
  /** Seconds, on the robot's clock when it sends one. */
  t: number;
  /** Whether Pedro is following a path; undefined if the robot doesn't say. */
  busy?: boolean;
}

/** A pause this long (seconds) in the stream is a new OpMode, whose first path starts a new run. */
export const NEW_OPMODE_GAP = 2;
/** Trail points nearer than this (inches) to the last one add nothing. */
const TRAIL_SPACING = 0.5;
/** A jump this far (inches) between samples is a relocalization, not driving. */
const TRAIL_JUMP = 12;
const MAX_TRAIL_POINTS = 5000;

export class LiveRun {
  /** The route driven, split where the robot jumped or the stream paused. */
  trail: Vec[][] = [];
  /** Goes up each time the trail changes. */
  version = 0;
  private points = 0;
  /** Set when the next path started is the first of an OpMode. */
  private armed = true;
  /** Whether the last sample was busy; undefined until one says it isn't. */
  private wasBusy: boolean | undefined;
  private last: LiveSample | undefined;

  /** Takes in a sample. True if the robot just started the first path of an OpMode. */
  push(sample: LiveSample): boolean {
    const last = this.last;
    const paused =
      last !== undefined &&
      (sample.t < last.t || sample.t - last.t > NEW_OPMODE_GAP);
    if (paused) {
      this.armed = true;
      this.wasBusy = undefined;
    }
    this.last = sample;

    // Only a change from not following to following counts, so connecting
    // part way through a path doesn't start the simulation late.
    const busy = sample.busy;
    const starts = this.armed && busy === true && this.wasBusy === false;
    if (busy !== undefined) this.wasBusy = busy;
    if (starts) {
      this.armed = false;
      this.trail = [];
      this.points = 0;
    }

    const jumped =
      last !== undefined &&
      Math.hypot(sample.x - last.x, sample.y - last.y) > TRAIL_JUMP;
    this.addToTrail(sample, starts || paused || jumped);
    return starts;
  }

  /** Forgets the trail, and treats the next path as the start of a run. */
  reset() {
    this.trail = [];
    this.points = 0;
    this.version++;
    this.armed = true;
    this.wasBusy = undefined;
    this.last = undefined;
  }

  private addToTrail(p: Vec, newSegment: boolean) {
    const segment = this.trail.at(-1);
    if (!segment || newSegment) {
      this.trail.push([{ x: p.x, y: p.y }]);
    } else {
      const end = segment.at(-1)!;
      if (Math.hypot(p.x - end.x, p.y - end.y) < TRAIL_SPACING) return;
      segment.push({ x: p.x, y: p.y });
    }
    this.version++;
    this.points++;
    if (this.points > MAX_TRAIL_POINTS) {
      this.trail[0].shift();
      if (this.trail[0].length === 0) this.trail.shift();
      this.points--;
    }
  }
}
