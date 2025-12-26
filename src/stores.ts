import { writable } from "svelte/store";

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

// Currently selected line id (used to add control points to selected path)
export const selectedLineId = writable<string | null>(null);

// Trigger counter for toggling collapse/expand all (increment to trigger)
export const toggleCollapseAllTrigger = writable(0);
