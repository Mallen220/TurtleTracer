// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Sizes, frame rates and memory limits offered by the animation export dialog.

export const SIZE_WIDTHS = [360, 480, 720, 1080, 2160];
// Safari's canvas limit: 16384 px per side (its 268M px area limit is the same square).
export const MIN_WIDTH = 16;
const MAX_SIDE = 16384;

/** Nearest allowed export width. `aspect` is height / width. */
export function clampWidth(width: number, aspect: number): number {
  const max = Math.floor(MAX_SIDE / Math.max(1, aspect));
  return Math.min(max, Math.max(MIN_WIDTH, Math.round(width)));
}

export const GIF_FPS = [10, 15, 24, 30, 50]; // GIF delays are whole 1/100 s; above 50 fps browsers slow playback
export const APNG_FPS = [...GIF_FPS, 60];

const GB = 1024 ** 3;
export const MEMORY_WARN_BYTES = 0.75 * GB;

export function frameCountFor(durationSec: number, fps: number): number {
  return Math.max(2, Math.ceil(durationSec * fps));
}

/** The APNG encoder holds every raw RGBA frame in memory until it finishes. */
export function frameMemoryBytes(
  width: number,
  height: number,
  frames: number,
): number {
  return width * height * 4 * frames;
}

export function formatBytes(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
