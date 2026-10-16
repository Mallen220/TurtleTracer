// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// The API a plugin's view gets from `import { connect } from "turtle:view"`.
// A view is an HTML page shown in a sandboxed frame: it has a DOM, canvas
// and WebGL, but no network and no access to the rest of the app.
import type { JsonValue, Plan, Pose, ProjectSnapshot } from "./data";

/** Everything a view needs to draw the field. */
export interface ViewScene {
  project: ProjectSnapshot;
  plan: Plan;
  theme: "light" | "dark";
  /** The field image as a data URL, or null if there isn't one. */
  fieldImage: string | null;
}

/** Where the robot is right now. Sent every frame while it moves. */
export interface ViewFrame {
  time: number;
  playing: boolean;
  pose: Pose;
}

export interface TurtleView {
  /** The view's name, from the manifest. */
  readonly name: string;
  /** The latest scene. */
  readonly scene: ViewScene;
  onScene(listener: (scene: ViewScene) => void): void;
  onFrame(listener: (frame: ViewFrame) => void): void;
  /** Messages from the plugin's main script (`turtle.views.post`). */
  onMessage(listener: (message: JsonValue) => void): void;
  /** Sends a message to the plugin's main script (`turtle.views.onMessage`). */
  post(message: JsonValue): void;
  seek(time: number): void;
  play(): void;
  pause(): void;
}
