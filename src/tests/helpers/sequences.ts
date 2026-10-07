// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Small builders the path-timing tests share, so each test file doesn't carry
// its own copy.
import type { Point, SequenceItem, TimelineEvent } from "../../types";

/** A path-ending point whose heading is fixed at `degrees`. */
export const constantHeading = (x: number, y: number, degrees = 0) =>
  ({ x, y, heading: "constant" as const, degrees }) as Point;

/** A path-ending point whose heading follows the path. */
export const tangentialHeading = (x: number, y: number) =>
  ({ x, y, heading: "tangential" as const }) as Point;

/** Path steps with a stop after each. */
export const separately = (...ids: string[]): SequenceItem[] =>
  ids.map((lineId) => ({ kind: "path", lineId }));

/** Path steps, each chained to the one before it. */
export const chained = (...ids: string[]): SequenceItem[] =>
  ids.map((lineId, i) => ({
    kind: "path",
    lineId,
    ...(i > 0 ? { isChain: true } : {}),
  }));

export const travelsIn = (timeline: TimelineEvent[]) =>
  timeline.filter((e) => e.type === "travel");

export const recoveriesIn = (timeline: TimelineEvent[]) =>
  timeline.filter((e) => e.type === "recovery");
