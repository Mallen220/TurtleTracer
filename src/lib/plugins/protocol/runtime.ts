// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// The messages between the app and a plugin's runtime (the `turtle` object
// in the plugin's sandbox). Everything a plugin sends is checked by the app
// against host/schemas.ts; this file just names things.
import type { FormValues, ProjectSnapshot } from "../api";

/** What a plugin can add. */
export type ContributionKind =
  | "command"
  | "navbarButton"
  | "contextMenuItem"
  | "layer"
  | "action"
  | "marker"
  | "exporter"
  | "simulator";

/** Sent with the port when the app connects to a plugin's runtime. */
export interface RuntimeInit {
  plugin: { id: string; name: string; version: string };
  project: ProjectSnapshot;
  settings: FormValues;
}

/** The handshake messages posted between the app and a plugin's frame. */
export const HELLO = "turtle:hello";
export const CONNECT = "turtle:connect";

/** How often the app checks a plugin is still responding, and how long it waits. */
export const HEARTBEAT_MS = 2000;
export const UNRESPONSIVE_MS = 6000;
