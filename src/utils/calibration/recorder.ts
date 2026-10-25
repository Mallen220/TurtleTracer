// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Records the robot's live poses as motion events: smooths each pose, then
// watches for drives, turns and chained corners that reveal a setting.

import { EventDetector, type MotionEvent } from "./events";
import { CornerDetector } from "./corners";
import {
  HALF_WINDOW,
  SampleSmoother,
  type MotionSample,
  type RawSample,
} from "./samples";
import type { TimeSource } from "./estimates";

export class MotionRecorder {
  readonly events: MotionEvent[] = [];
  private smoother: SampleSmoother;
  private detector = new EventDetector((event) => this.events.push(event));
  private corners = new CornerDetector((corner) => this.events.push(corner));

  constructor(readonly timeSource: TimeSource = "robot") {
    this.smoother = new SampleSmoother(HALF_WINDOW[timeSource]);
  }

  /** Adds a pose and returns the smoothed samples that are now ready. */
  push(sample: RawSample): MotionSample[] {
    const { samples, broke } = this.smoother.push(sample);
    this.feed(samples);
    if (broke) this.breakStream();
    return samples;
  }

  /** Ends the stream, keeping what can be read from its unfinished drive. */
  finish(): MotionSample[] {
    const samples = this.smoother.flush();
    this.feed(samples);
    this.breakStream();
    return samples;
  }

  private feed(samples: MotionSample[]) {
    for (const s of samples) {
      this.detector.push(s);
      this.corners.push(s);
    }
  }

  private breakStream() {
    this.detector.breakStream();
    this.corners.breakStream();
  }
}
