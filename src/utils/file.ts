import type { Point, Line, Shape } from '../types';

/**
 * File save/load utilities for the visualizer
 */

export interface SaveData {
  startPoint: Point;
  lines: Line[];
  shapes?: Shape[];
  settings?: any;
}

/**
 * Download trajectory data as a .pp file
 */
export function downloadTrajectory(startPoint: Point, lines: Line[], shapes: Shape[]): void {
  const jsonString = JSON.stringify({ startPoint, lines, shapes });
  const blob = new Blob([jsonString], { type: "application/json" });
  const linkObj = document.createElement("a");
  const url = URL.createObjectURL(blob);

  linkObj.href = url;
  linkObj.download = "trajectory.pp";

  document.body.appendChild(linkObj);
  linkObj.click();
  document.body.removeChild(linkObj);
  URL.revokeObjectURL(url);
}

/**
 * Load trajectory from a file input event
 */
export function loadTrajectoryFromFile(
  evt: Event, 
  onSuccess: (data: SaveData) => void,
  onError?: (error: Error) => void
): void {
  const elem = evt.target as HTMLInputElement;
  const file = elem.files?.[0];

  if (file) {
    const reader = new FileReader();

    reader.onload = function (e: ProgressEvent<FileReader>) {
      try {
        const result = e.target?.result as string;
        const jsonObj = JSON.parse(result) as SaveData;
        onSuccess(jsonObj);
      } catch (err) {
        console.error(err);
        if (onError) onError(err as Error);
      }
    };

    reader.readAsText(file);
  }
}

/**
 * Load robot image from a file input event
 */
export function loadRobotImage(
  evt: Event,
  onSuccess: (imageData: string) => void,
  onError?: (error: Error) => void
): void {
  const elem = evt.target as HTMLInputElement;
  const file = elem.files?.[0];

  if (file && file.type === "image/png") {
    const reader = new FileReader();

    reader.onload = function (e: ProgressEvent<FileReader>) {
      const result = e.target?.result as string;
      localStorage.setItem('robot.png', result);
      onSuccess(result);
    };

    reader.readAsDataURL(file);
  } else {
    const error = new Error("Invalid file type. Please upload a PNG file.");
    console.error(error.message);
    if (onError) onError(error);
  }
}

/**
 * Update the robot image displayed on the canvas
 */
export function updateRobotImageDisplay(): void {
  const robotImage = document.querySelector('img[alt="Robot"]') as HTMLImageElement;
  const storedImage = localStorage.getItem('robot.png');
  if (robotImage && storedImage) {
    robotImage.src = storedImage;
  }
}
