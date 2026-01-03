// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { writable } from "svelte/store";
import type { CollisionMarker, Notification } from "./types";

// Math tools stores
export const showRuler = writable(false);
export const showProtractor = writable(false);
export const showGrid = writable(false);
export const protractorLockToRobot = writable(true);
export const gridSize = writable(12);
export const currentFilePath = writable<string | null>(null);
export const isUnsaved = writable(false);
export const snapToGrid = writable(true);
export const showShortcuts = writable(false);
export const showSettings = writable(false);
export const showExportGif = writable(false);
export const exportDialogState = writable<{
  isOpen: boolean;
  format: "java" | "points" | "sequential" | "json";
}>({ isOpen: false, format: "java" });

// Currently selected line id (used to add control points to selected path)
export const selectedLineId = writable<string | null>(null);

// Trigger counter for toggling collapse/expand all (increment to trigger)
export const toggleCollapseAllTrigger = writable(0);

// Currently selected point id in field rendering, format: 'point-<line+1>-<idx>' or 'point-0-0' for start
export const selectedPointId = writable<string | null>(null);

// Collision markers for validation
export const collisionMarkers = writable<CollisionMarker[]>([]);

// Notification system
export const notification = writable<Notification | null>(null);

// File Manager Session State
export const fileManagerSessionState = writable<{
  searchQuery: string;
  viewMode: "list" | "grid";
  sortMode: "name" | "date";
}>({
  searchQuery: "",
  viewMode: "grid",
  sortMode: "date",
});
