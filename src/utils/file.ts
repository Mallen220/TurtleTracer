// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Point, Line, Shape, SequenceItem } from "../types";
import {
  DEFAULT_PROJECT_EXTENSION,
  LEGACY_PROJECT_EXTENSION,
  isSupportedProjectFileName,
} from "./fileExtensions";

/**
 * File save/load utilities for the visualizer
 */

export interface SaveData {
  startPoint: Point;
  lines: Line[];
  shapes?: Shape[];
  settings?: any;
  sequence?: SequenceItem[];
  extraData?: Record<string, any>;
}

function triggerDownload(
  content: string,
  type: string,
  filename: string,
): void {
  const blob = new Blob([content], { type });
  const linkObj = document.createElement("a");
  const url = URL.createObjectURL(blob);

  linkObj.href = url;
  linkObj.download = filename;

  document.body.appendChild(linkObj);
  linkObj.click();
  document.body.removeChild(linkObj);
  URL.revokeObjectURL(url);
}

/**
 * Download trajectory data as a .turt file
 */
export function downloadTrajectory(
  startPoint: Point,
  lines: Line[],
  shapes: Shape[],
  sequence?: SequenceItem[],
  extraData?: Record<string, any>,
  filename: string = `trajectory${DEFAULT_PROJECT_EXTENSION}`,
): void {
  const jsonString = JSON.stringify(
    { startPoint, lines, shapes, sequence, extraData },
    null,
    2,
  );

  const lowerName = filename.toLowerCase();
  const finalFilename =
    lowerName.endsWith(DEFAULT_PROJECT_EXTENSION) ||
    lowerName.endsWith(LEGACY_PROJECT_EXTENSION)
      ? filename
      : `${filename}${DEFAULT_PROJECT_EXTENSION}`;

  triggerDownload(jsonString, "application/json", finalFilename);
}

/**
 * Download trajectory data as a text file
 */
export function downloadTrajectoryAsText(
  startPoint: Point,
  lines: Line[],
  shapes: Shape[],
  sequence: SequenceItem[],
  extraData?: Record<string, any>,
  filename: string = "trajectory.txt",
): void {
  const jsonString = JSON.stringify(
    { startPoint, lines, shapes, sequence, extraData },
    null,
    2,
  );

  triggerDownload(jsonString, "text/plain", filename);
}

/**
 * Load trajectory from a file input event
 */
export function loadTrajectoryFromFile(
  evt: Event,
  onSuccess: (data: SaveData) => void,
  onError?: (error: Error) => void,
): void {
  const elem = evt.target as HTMLInputElement;
  const file = elem.files?.[0];

  if (!file) return;

  if (!isSupportedProjectFileName(file.name)) {
    const error = new Error("Please select a .turt or .pp file");
    if (onError) onError(error);
    alert(error.message);
    return;
  }

  const reader = new FileReader();

  reader.onload = function (e: ProgressEvent<FileReader>) {
    try {
      const result = e.target?.result as string;
      const jsonObj = JSON.parse(result) as SaveData;
      onSuccess(jsonObj);
    } catch (err) {
      if (onError) onError(err as Error);
    }
  };

  reader.readAsText(file);
}

/**
 * Update the robot image displayed on the canvas
 */
export function updateRobotImageDisplay(): void {
  const robotImage = document.querySelector(
    'img[alt="Robot"]',
  ) as HTMLImageElement;
  const storedImage = localStorage.getItem("robot.png");
  if (robotImage && storedImage) {
    robotImage.src = storedImage;
  }
}

/**
 * Convert image file to base64 string
 */
export function imageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to convert image to base64"));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Load robot image from a file input event
 */
export async function loadRobotImage(
  file: File,
  onSuccess?: (imageData: string) => void,
  onError?: (error: Error) => void,
): Promise<string | null> {
  try {
    if (!file.type.match(/^image\/(png|jpeg|jpg|gif)$/)) {
      throw new Error("Please upload a PNG, JPEG, or GIF image.");
    }

    const base64Data = await imageToBase64(file);
    const compressedData = await compressImage(base64Data, 100, 100);

    if (onSuccess) {
      onSuccess(compressedData);
    }

    return compressedData;
  } catch (error) {
    if (onError) {
      onError(error as Error);
    }
    return null;
  }
}

/**
 * Compress image data
 */
async function compressImage(
  base64Data: string,
  maxWidth: number,
  maxHeight: number,
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.floor(width * ratio);
        height = Math.floor(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/png", 0.8));
      } else {
        resolve(base64Data);
      }
    };
    img.src = base64Data;
  });
}
