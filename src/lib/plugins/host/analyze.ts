// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// `turtle.projects.analyze`: reads another project file and times it the way
// the app would, with the current robot's settings, so plugins can show
// several routines at once without re-implementing path timing.
import { get } from "svelte/store";
import type { AnalyzedProject, PickedProject } from "../api";
import type { Line, Point, SequenceItem, Shape } from "../../../types";
import {
  normalizeLines,
  sanitizeSequence,
  settingsStore,
} from "../../projectStore";
import { calculatePathTime } from "../../../utils/timeCalculator";
import { buildPlan, buildSnapshot, type ProjectState } from "./snapshot";

const DEFAULT_START: Point = {
  x: 72,
  y: 72,
  heading: "tangential",
  reverse: false,
};

export function analyzeProject(
  file: PickedProject,
  pluginId: string,
): AnalyzedProject {
  const data = file.contents as {
    startPoint?: Point;
    lines?: Line[];
    shapes?: Shape[];
    sequence?: SequenceItem[];
  } | null;
  if (!data || typeof data !== "object" || !Array.isArray(data.lines)) {
    throw new Error(`${file.name} isn't a Turtle Tracer project.`);
  }

  const lines = normalizeLines(data.lines);
  const state: ProjectState = {
    startPoint: data.startPoint ?? DEFAULT_START,
    lines,
    shapes: Array.isArray(data.shapes) ? data.shapes : [],
    sequence: sanitizeSequence(lines, data.sequence),
    settings: get(settingsStore),
    extraData: {},
    filePath: file.name,
  };
  const prediction = calculatePathTime(
    state.startPoint,
    state.lines,
    state.settings,
    state.sequence,
  );
  return {
    project: buildSnapshot(state, pluginId),
    plan: buildPlan(state, prediction),
  };
}
