// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Point, Line, Shape, SequenceItem } from "../types";
import {
  DEFAULT_PROJECT_EXTENSION,
  LEGACY_PROJECT_EXTENSION,
  isSupportedProjectFileName,
} from "./fileExtensions";
import { getElectronAPI } from "./platform";

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

export function triggerDownload(
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

function createTrajectoryJson(
  startPoint: Point,
  lines: Line[],
  shapes: Shape[],
  sequence?: SequenceItem[],
  extraData?: Record<string, any>,
): string {
  return JSON.stringify(
    { startPoint, lines, shapes, sequence, extraData },
    null,
    2,
  );
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
  const jsonString = createTrajectoryJson(
    startPoint,
    lines,
    shapes,
    sequence,
    extraData,
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
 * Saves binary data: through a native save dialog in the desktop app, or as
 * a browser download. `typeLabel` names the file type in the dialog.
 */
export async function saveBlob(
  blob: Blob,
  fileName: string,
  typeLabel: string,
): Promise<"saved" | "downloaded" | "cancelled"> {
  const api = getElectronAPI();
  if (!api?.showSaveDialog || !api.writeFileBase64) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return "downloaded";
  }

  const extension = fileName.split(".").pop() ?? "";
  const dest = await api.showSaveDialog({
    defaultPath: fileName,
    filters: [{ name: typeLabel, extensions: [extension] }],
  });
  if (!dest) return "cancelled";
  const dataUrl = await imageToBase64(blob);
  await api.writeFileBase64(dest, dataUrl.split(",")[1]);
  return "saved";
}

/** Reads a file or blob as a base64 `data:` URL. */
export function imageToBase64(file: Blob): Promise<string> {
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
