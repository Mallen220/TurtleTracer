// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { CommandLibraryId } from "../../../types";

/**
 * How a library spells the building blocks of a command sequence. Each method
 * returns a Java expression; the exporter and the actions only ever build
 * sequences through these, so they don't need to know which library is chosen.
 */
export interface CommandVocabulary {
  /** Do nothing for this many milliseconds. */
  wait(ms: number): string;
  /** Finish once `condition`, a Java boolean expression, is true. */
  waitUntil(condition: string): string;
  /** Run `body` once. `body` is a lambda body: an expression or a `{ ... }` block. */
  instant(body: string): string;
  /** Run the comma-separated commands in `inner` one after another. */
  sequential(inner: string): string;
  /** Run the comma-separated commands in `inner` together, ending with the first. */
  race(inner: string): string;
  /** Run `body`, a Java statement expression, on every loop until the command it races is done. */
  perpetual(body: string): string;
  /** Drive `path` (a Path variable) with the `follower` variable in scope. */
  followPath(path: string): string;
}

/** Everything a library's class template needs, already generated. */
export interface SequentialClassParts {
  /** The auto-generated file banner. */
  warning: string;
  packageName: string;
  className: string;
  /** Imports for this library's commands (from `CommandLibrary.imports`). */
  imports: string;
  /** TurtleTracerReader import, empty when poses are embedded. */
  ppReaderImport: string;
  /** `new TurtleTracerReader(...)` statement, empty when poses are embedded. */
  ppReaderInit: string;
  hasEventMarkers: boolean;
  /** Field holding the ProgressTracker the commands use, empty without markers. */
  trackerField: string;
  /** Code that wires event markers to a ProgressTracker, empty without markers. */
  eventBindingCode: string;
  poseDeclarations: string;
  poseInitializations: string;
  pathChainDeclarations: string;
  pathBuilders: string;
  /** The sequence's commands, comma separated, one per line. */
  commands: string;
  /** Helper methods for FTC coordinates / metric units, empty when unused. */
  ftcPoseHelper: string;
  metricHelper: string;
}

export interface CommandLibrary {
  /** The value stored in settings. */
  id: CommandLibraryId;
  /** Shown in the UI. */
  label: string;
  /** One line shown in the export dialog header. */
  description: string;
  /** Show an "experimental" warning next to this library in the UI. */
  experimental?: boolean;
  /**
   * What the generated code passes to ProgressTracker as telemetry. Libraries
   * whose generated class has no Telemetry to hand pass `null`.
   */
  trackerTelemetry: "telemetry" | "null";
  /** Java import lines for the commands this library's vocabulary uses. */
  imports: string;
  commands: CommandVocabulary;
  /** The whole generated class. */
  classTemplate(parts: SequentialClassParts): string;
}
