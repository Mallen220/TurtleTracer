// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.

export function formatTime(totalSeconds: number): string {
  // Handle NaN or Infinity
  if (!Number.isFinite(totalSeconds)) return "Infinite";
  if (totalSeconds <= 0) return "0.000s";

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}:${seconds.toFixed(3).padStart(6, "0")}s`;
  }
  return `${seconds.toFixed(3)}s`;
}

export function getAnimationDuration(
  totalTime: number,
  speedFactor: number = 1,
): number {
  return (totalTime * 1000) / speedFactor;
}
