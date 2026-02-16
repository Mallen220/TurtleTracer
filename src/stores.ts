// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { writable } from "svelte/store";
import type {
  CollisionMarker,
  Notification,
  FieldView,
  UpdateData,
} from "./types";

// Math tools stores
export const showRuler = writable(false);
export const showProtractor = writable(false);
export const showRobot = writable(true);
export const showGrid = writable(false);
export const protractorLockToRobot = writable(true);
export const gridSize = writable(12);
export const currentFilePath = writable<string | null>(null);
export const isUnsaved = writable(false);
export const snapToGrid = writable(true);
export const fieldZoom = writable(1.0);
export const fieldPan = writable({ x: 0, y: 0 });
export const showShortcuts = writable(false);
export const showSettings = writable(false);
export const settingsActiveTab = writable("general");
export const showPluginManager = writable(false);
export const showTelemetryDialog = writable(false);
export const isPresentationMode = writable(false);
export const showExportGif = writable(false);
export const showStrategySheet = writable(false);
export const showHistory = writable(false);
export const exportDialogState = writable<{
  isOpen: boolean;
  format: "java" | "points" | "sequential" | "json" | "custom";
  exporterName?: string;
}>({ isOpen: false, format: "java" });

// Update Notification Store
export const showUpdateAvailableDialog = writable(false);
export const updateDataStore = writable<UpdateData | null>(null);

// File Manager Stores
export const showFileManager = writable(false);
export const fileManagerNewFileMode = writable(false);

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

// Project Metadata
export const projectMetadataStore = writable<{
  filepath: string;
  lastSaved?: Date;
}>({ filepath: "" });

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

export const hoveredMarkerId = writable<string | null>(null);

// Focus request store to trigger input focus
export const focusRequest = writable<{
  field: "x" | "y" | "heading" | "name";
  timestamp: number;
  id?: string;
} | null>(null);

// Store for the current working directory path
export const currentDirectoryStore = writable<string | null>(null);

// Store for event names found in .pp files on disk
export const diskEventNamesStore = writable<string[]>([]);

// Git status map for files (filepath -> status)
export const gitStatusStore = writable<Record<string, string>>({});

// Tutorial Trigger
export const startTutorial = writable(false);

// Field View State (exposed for plugins)
export const fieldViewStore = writable<FieldView>({
  xScale: (v) => v,
  yScale: (v) => v,
  width: 0,
  height: 0,
});

// Plugin Redraw Trigger
export const pluginRedrawTrigger = writable(0);
export const dimmedLinesStore = writable<string[]>([]);
