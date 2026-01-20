import { writable } from "svelte/store";

export interface TelemetryPoint {
  time: number; // seconds
  x: number; // inches
  y: number; // inches
  heading: number; // degrees or radians? Let's assume degrees to match the rest of the app usually.
  velocity?: number;
}

export const telemetryData = writable<TelemetryPoint[] | null>(null);
export const showTelemetry = writable<boolean>(true);
export const showTelemetryGhost = writable<boolean>(true); // Show ghost robot
export const telemetryOffset = writable<number>(0); // Time offset in seconds
