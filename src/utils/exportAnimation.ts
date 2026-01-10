// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
// Utility to export the current Two.js view / animation as a GIF or APNG.
// Uses gif.js for GIFs and upng-js for APNGs.

import GIF from "gif.js";
// Vite: import worker script URL so gif.js can spawn workers correctly
import gifWorkerUrl from "gif.js/dist/gif.worker.js?url";
import * as UPNG from "upng-js";
import type Two from "two.js";

function makeAbortError() {
  const e = new Error("Aborted");
  e.name = "AbortError";
  return e;
}

export interface ExportAnimationOptions {
  two: Two; // Two.js instance
  animationController: any; // controller from createAnimationController
  durationSec: number; // total duration in seconds
  fps?: number; // frames per second
  scale?: number; // resolution scale (0.1 to 1.0+)
  quality?: number; // gif.js quality parameter (1=best, 30=worst)
  filename?: string; // suggested filename
  onProgress?: (progress: number) => void; // 0..1
  signal?: AbortSignal; // optional abort signal to cancel export
  /** Optional background image URL to draw under the SVG frames (e.g., field map) */
  backgroundImageSrc?: string; /** Optional robot overlay image to draw on top of frames */
  robotImageSrc?: string;
  /** Robot display size in pixels (unscaled) */
  robotLengthPx?: number;
  robotWidthPx?: number;
  /** Function to compute robot state (x,y in pixels and heading in degrees) for a given percent (0..100) */
  getRobotState?: (percent: number) => {
    x: number;
    y: number;
    heading: number;
  };
}

// For backward compatibility alias
export type ExportGifOptions = ExportAnimationOptions;

// Internal helper to render a single frame to a canvas
async function renderFrameToCanvas(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  svgEl: SVGElement,
  percent: number,
  options: ExportAnimationOptions,
  backgroundImage: HTMLImageElement | null,
  robotImage: HTMLImageElement | null,
  scale: number,
): Promise<void> {
  // Serialize the SVG
  const svgString = new XMLSerializer().serializeToString(svgEl);
  // Ensure xmlns is present
  const hasNs = svgString.indexOf("xmlns=") >= 0;
  const svgWithNs = hasNs
    ? svgString
    : svgString.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  const data =
    "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgWithNs);

  const img = new Image();
  img.crossOrigin = "anonymous";

  await new Promise<void>((resolve, reject) => {
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Draw background image first (if available)
      if (backgroundImage) {
        try {
          ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
        } catch (e) {
          console.warn("Failed to draw background image onto canvas:", e);
        }
      }

      // Draw the rasterized SVG on top
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Draw robot overlay (if provided) on top of SVG
      try {
        if (robotImage && options.getRobotState) {
          const state = options.getRobotState(percent);
          if (state && !Number.isNaN(state.x) && !Number.isNaN(state.y)) {
            ctx.save();
            // Translate to robot center (scaled)
            ctx.translate(state.x * scale, state.y * scale);
            // Rotate by heading (convert deg -> rad)
            ctx.rotate((state.heading * Math.PI) / 180);

            // Scale robot dimensions
            const rw =
              (options.robotLengthPx ?? (robotImage.width || 0)) * scale;
            const rh =
              (options.robotWidthPx ?? (robotImage.height || 0)) * scale;

            // Draw centered
            ctx.drawImage(robotImage, -rw / 2, -rh / 2, rw, rh);
            ctx.restore();
          }
        }
      } catch (e) {
        console.warn("Failed to draw robot overlay onto canvas:", e);
      }
      resolve();
    };
    img.onerror = (err) => reject(err);
    img.src = data;
  });
}

async function prepareResources(options: ExportAnimationOptions) {
  // Optionally preload a background image (field map)
  let backgroundImage: HTMLImageElement | null = null;
  if (options.backgroundImageSrc) {
    backgroundImage = new Image();
    backgroundImage.crossOrigin = "anonymous";
    backgroundImage.src = options.backgroundImageSrc;

    try {
      await new Promise<void>((resolve) => {
        backgroundImage!.onload = () => resolve();
        backgroundImage!.onerror = () => {
          backgroundImage = null;
          resolve();
        };
      });
    } catch (e) {
      backgroundImage = null;
    }
  }

  // Optionally preload the robot overlay image
  let robotImage: HTMLImageElement | null = null;
  if (options.robotImageSrc) {
    robotImage = new Image();
    robotImage.crossOrigin = "anonymous";
    robotImage.src = options.robotImageSrc;

    try {
      await new Promise<void>((resolve) => {
        robotImage!.onload = () => resolve();
        robotImage!.onerror = () => {
          robotImage = null;
          resolve();
        };
      });
    } catch (e) {
      robotImage = null;
    }
  }
  return { backgroundImage, robotImage };
}

export async function exportPathToGif(
  options: ExportAnimationOptions,
): Promise<Blob> {
  const {
    two,
    animationController,
    durationSec,
    fps = 15,
    scale = 1,
    quality = 20,
    onProgress,
  } = options;

  const prevPlaying = animationController.isPlaying?.() ?? false;
  const prevPercent = animationController.getPercent?.() ?? 0;
  if (animationController.pause) animationController.pause();

  const svgEl = (two.renderer as any).domElement as SVGElement;
  const rect = svgEl.getBoundingClientRect();
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(rect.width * scale);
  canvas.height = Math.round(rect.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const { backgroundImage, robotImage } = await prepareResources(options);

  const gif = new GIF({
    workers: 2,
    quality: quality,
    width: canvas.width,
    height: canvas.height,
    workerScript: gifWorkerUrl,
  });

  if (onProgress) {
    gif.on("progress", (p: number) => {
      onProgress(0.5 + p * 0.5);
    });
  }

  const calculatedFrames = Math.ceil(durationSec * fps);
  const MAX_FRAMES = 300;
  const frames = Math.max(2, Math.min(calculatedFrames, MAX_FRAMES));
  const delayMs = Math.round(1000 / fps);

  const framesDataURLs: string[] = [];

  try {
    for (let i = 0; i < frames; i++) {
      if (options.signal?.aborted) throw makeAbortError();
      const percent = (i / (frames - 1)) * 100;
      if (animationController.seekToPercent)
        animationController.seekToPercent(percent);
      two.update();

      await renderFrameToCanvas(
        ctx,
        canvas,
        svgEl,
        percent,
        options,
        backgroundImage,
        robotImage,
        scale,
      );

      // Capture fallback data
      try {
        framesDataURLs.push(canvas.toDataURL("image/png"));
      } catch (e) {}

      try {
        gif.addFrame(ctx, { copy: true, delay: delayMs });
      } catch (e) {}

      if (onProgress) {
        onProgress(((i + 1) / frames) * 0.5);
      }
    }

    // Restore before encoding stage
    if (animationController.seekToPercent)
      animationController.seekToPercent(prevPercent);
    if (prevPlaying && animationController.play) animationController.play();

    return await new Promise(async (resolve, reject) => {
      let encodeStarted = false;

      const onAbort = () => {
        try {
          (gif as any).abort?.();
        } catch (e) {}
        reject(makeAbortError());
      };

      if (options.signal) {
        if (options.signal.aborted) return reject(makeAbortError());
        options.signal.addEventListener("abort", onAbort);
      }

      const fallbackTimeout = setTimeout(async () => {
        if (!encodeStarted) {
          console.warn(
            "Worker encoding not detected — falling back to main-thread encode",
          );
          try {
            const gif2 = new GIF({
              workers: 0,
              quality: quality,
              width: canvas.width,
              height: canvas.height,
            });
            if (onProgress) onProgress(0.5);
            if (onProgress) {
              gif2.on("progress", (p: number) => onProgress(0.5 + p * 0.5));
            }

            for (let i = 0; i < framesDataURLs.length; i++) {
              if (options.signal?.aborted) return reject(makeAbortError());
              const dataUrl = framesDataURLs[i];
              await new Promise<void>((res, rej) => {
                const im = new Image();
                im.onload = () => {
                  ctx.clearRect(0, 0, canvas.width, canvas.height);
                  ctx.drawImage(im, 0, 0, canvas.width, canvas.height);
                  try {
                    gif2.addFrame(ctx, { copy: true, delay: delayMs });
                  } catch (e) {}
                  res();
                };
                im.onerror = (e) => rej(e);
                im.src = dataUrl;
              });
            }
            gif2.on("finished", (blobObj: Blob) => resolve(blobObj));
            gif2.on("error", (err: any) => reject(err));
            gif2.render();
          } catch (err) {
            reject(err);
          }
        }
      }, 3000);

      gif.on("finished", (blobObj: Blob) => {
        if (options.signal)
          options.signal.removeEventListener("abort", onAbort);
        clearTimeout(fallbackTimeout);
        resolve(blobObj);
      });
      gif.on("error", (err: any) => {
        if (options.signal)
          options.signal.removeEventListener("abort", onAbort);
        clearTimeout(fallbackTimeout);
        reject(err);
      });
      gif.on("progress", () => {
        encodeStarted = true;
      });

      try {
        gif.render();
      } catch (err) {
        clearTimeout(fallbackTimeout);
        reject(err);
      }
    });
  } finally {
    // Ensure animation state is restored even on abort
    if (animationController.seekToPercent)
      animationController.seekToPercent(prevPercent);
    if (prevPlaying && animationController.play) animationController.play();
  }
}

export async function exportPathToApng(
  options: ExportAnimationOptions,
): Promise<Blob> {
  const {
    two,
    animationController,
    durationSec,
    fps = 15,
    scale = 1,
    quality = 10,
    onProgress,
  } = options;

  const prevPlaying = animationController.isPlaying?.() ?? false;
  const prevPercent = animationController.getPercent?.() ?? 0;
  if (animationController.pause) animationController.pause();

  const svgEl = (two.renderer as any).domElement as SVGElement;
  const rect = svgEl.getBoundingClientRect();
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(rect.width * scale);
  canvas.height = Math.round(rect.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const { backgroundImage, robotImage } = await prepareResources(options);

  const calculatedFrames = Math.ceil(durationSec * fps);
  const MAX_FRAMES = 300;
  const frames = Math.max(2, Math.min(calculatedFrames, MAX_FRAMES));

  // Precise timing calculation:
  // We want sum(delays) == durationSec * 1000
  // Distribute error accumulation
  const targetTotalMs = durationSec * 1000;
  const delays: number[] = [];
  let accumulatedTime = 0;

  for (let i = 0; i < frames; i++) {
    // Calculate perfect end time for this frame
    const targetEndTime = ((i + 1) / frames) * targetTotalMs;
    // Calculate integer delay for this frame to reach that time
    const delay = Math.round(targetEndTime - accumulatedTime);
    delays.push(delay);
    accumulatedTime += delay;
  }

  const buffers: ArrayBuffer[] = [];

  try {
    for (let i = 0; i < frames; i++) {
      if (options.signal?.aborted) throw makeAbortError();
      const percent = (i / (frames - 1)) * 100;
      if (animationController.seekToPercent)
        animationController.seekToPercent(percent);
      two.update();

      await renderFrameToCanvas(
        ctx,
        canvas,
        svgEl,
        percent,
        options,
        backgroundImage,
        robotImage,
        scale,
      );

      // Get buffer for UPNG
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      buffers.push(imageData.data.buffer);

      if (onProgress) {
        // Encoding is fast/sync, so we count mostly frame capture
        onProgress(((i + 1) / frames) * 0.9);
      }
    }

    // Restore
    if (animationController.seekToPercent)
      animationController.seekToPercent(prevPercent);
    if (prevPlaying && animationController.play) animationController.play();

    if (onProgress) onProgress(0.95);

    // Encode APNG
    // cnum = 0 means lossless. >0 means palette size.
    // Mapping: Quality 1-9 => Lossless (0), Quality >= 10 => 256 colors
    const cnum = quality <= 9 ? 0 : 256;

    const apngBuffer = UPNG.encode(
      buffers,
      canvas.width,
      canvas.height,
      cnum,
      delays,
    );

    if (onProgress) onProgress(1.0);

    return new Blob([apngBuffer], { type: "image/png" });
  } finally {
    // Ensure animation state is restored even on abort
    if (animationController.seekToPercent)
      animationController.seekToPercent(prevPercent);
    if (prevPlaying && animationController.play) animationController.play();
  }
}
