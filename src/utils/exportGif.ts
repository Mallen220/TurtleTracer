// Utility to export the current Two.js view / animation as a GIF.
// Uses gif.js to encode frames in the renderer.

import GIF from "gif.js";
// Vite: import worker script URL so gif.js can spawn workers correctly
import gifWorkerUrl from "gif.js/dist/gif.worker.js?url";
import type Two from "two.js";

export interface ExportGifOptions {
  two: Two; // Two.js instance
  animationController: any; // controller from createAnimationController
  durationSec: number; // total duration in seconds
  fps?: number; // frames per second
  scale?: number; // resolution scale (0.1 to 1.0+)
  quality?: number; // gif.js quality parameter (1=best, 30=worst)
  filename?: string; // suggested filename
  onProgress?: (progress: number) => void; // 0..1
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

export async function exportPathToGif(
  options: ExportGifOptions,
): Promise<Blob> {
  const {
    two,
    animationController,
    durationSec,
    fps = 15,
    scale = 1,
    quality = 20,
    filename,
    onProgress,
    backgroundImageSrc,
  } = options;

  // Save state
  const prevPlaying = animationController.isPlaying?.() ?? false;
  const prevPercent = animationController.getPercent?.() ?? 0;

  // Pause animation to take clean snapshots
  if (animationController.pause) animationController.pause();

  // Prepare canvas for rasterizing SVG
  const svgEl = (two.renderer as any).domElement as SVGElement;
  const rect = svgEl.getBoundingClientRect();
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(rect.width * scale);
  canvas.height = Math.round(rect.height * scale);
  const ctx = canvas.getContext("2d")!;

  // Optional: Enable better image smoothing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Optionally preload a background image (field map) so it can be drawn under each frame
  let backgroundImage: HTMLImageElement | null = null;
  if (backgroundImageSrc) {
    backgroundImage = new Image();
    backgroundImage.crossOrigin = "anonymous";
    backgroundImage.src = backgroundImageSrc;

    try {
      await new Promise<void>((resolve, reject) => {
        backgroundImage!.onload = () => {
          console.debug(
            "Background image loaded for GIF export:",
            backgroundImageSrc,
          );
          resolve();
        };
        backgroundImage!.onerror = (err) => {
          console.warn(
            "Failed to load background image for GIF export:",
            backgroundImageSrc,
            err,
          );
          // Ignore background image failures and proceed without it
          backgroundImage = null;
          resolve();
        };
      });
    } catch (e) {
      backgroundImage = null;
    }
  }

  // Optionally preload the robot overlay image (so we can draw it on top of frames)
  let robotImage: HTMLImageElement | null = null;
  if (options.robotImageSrc) {
    robotImage = new Image();
    robotImage.crossOrigin = "anonymous";
    robotImage.src = options.robotImageSrc;

    try {
      await new Promise<void>((resolve, reject) => {
        robotImage!.onload = () => {
          console.debug(
            "Robot image loaded for GIF export:",
            options.robotImageSrc,
          );
          resolve();
        };
        robotImage!.onerror = (err) => {
          console.warn(
            "Failed to load robot image for GIF export:",
            options.robotImageSrc,
            err,
          );
          robotImage = null;
          resolve();
        };
      });
    } catch (e) {
      robotImage = null;
    }
  }

  // Setup GIF encoder
  const gif = new GIF({
    workers: 2,
    quality: quality,
    width: canvas.width,
    height: canvas.height,
    workerScript: gifWorkerUrl,
  });

  // Hook up progress if provided. We'll combine two phases:
  //  - frame capture (0.0 -> 0.5)
  //  - worker encoding progress (0.5 -> 1.0)
  if (onProgress) {
    gif.on("progress", (p: number) => {
      // Debug log to help diagnose stalls
      console.debug("GIF encode progress:", p);
      onProgress(0.5 + p * 0.5);
    });
  }

  // Store per-frame data URLs so we can fallback to a main-thread encode if workers fail
  const framesDataURLs: string[] = [];

  // Helper to rasterize the current SVG into canvas and add to GIF
  async function addCurrentFrame(delayMs: number, percent: number) {
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
    // Use crossOrigin to avoid tainting in some setups
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
        // Scale is handled by drawing into the scaled canvas dimensions
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
              // rw (Length) corresponds to X-local, rh (Width) corresponds to Y-local
              ctx.drawImage(robotImage, -rw / 2, -rh / 2, rw, rh);
              ctx.restore();
            }
          }
        } catch (e) {
          console.warn("Failed to draw robot overlay onto canvas:", e);
        }

        // Capture the canvas state as a data URL for fallback encoding
        try {
          const url = canvas.toDataURL("image/png");
          framesDataURLs.push(url);
        } catch (e) {
          console.warn("Failed to capture frame data URL for fallback:", e);
        }

        // Add canvas context as a frame; copy=true to avoid keeping references
        try {
          gif.addFrame(ctx, { copy: true, delay: delayMs });
        } catch (e) {
          console.warn("gif.addFrame failed:", e);
        }

        resolve();
      };
      img.onerror = (err) => reject(err);
      img.src = data;
    });
  }

  const calculatedFrames = Math.ceil(durationSec * fps);
  const MAX_FRAMES = 300; // safety cap
  const frames = Math.max(2, Math.min(calculatedFrames, MAX_FRAMES));
  if (calculatedFrames > MAX_FRAMES) {
    console.warn(
      `Frame count capped to ${MAX_FRAMES} (requested ${calculatedFrames}). Consider lowering fps or duration.`,
    );
  }

  const delayMs = Math.round(1000 / fps);

  for (let i = 0; i < frames; i++) {
    const percent = (i / (frames - 1)) * 100;
    if (animationController.seekToPercent)
      animationController.seekToPercent(percent);
    // Force Two.js to update immediately
    two.update();
    // Add the frame (pass percent so overlays can be drawn correctly)
    // eslint-disable-next-line no-await-in-loop
    await addCurrentFrame(delayMs, percent);
    // Provide incremental progress for frame capture phase
    if (onProgress) {
      const p = ((i + 1) / frames) * 0.5;
      console.debug("GIF frame capture progress:", p);
      onProgress(p);
    }
  }

  // Restore previous state
  if (animationController.seekToPercent)
    animationController.seekToPercent(prevPercent);
  if (prevPlaying && animationController.play) animationController.play();

  // Return a promise that resolves with the compiled Blob. If worker encoding doesn't start, fallback to main-thread encoding using stored frame data.
  const blob: Blob = await new Promise(async (resolve, reject) => {
    let encodeStarted = false;
    const fallbackTimeout = setTimeout(async () => {
      if (!encodeStarted) {
        console.warn(
          "Worker encoding not detected — falling back to main-thread encode",
        );
        try {
          // Main-thread fallback using stored frames
          const gif2 = new GIF({
            workers: 0,
            quality: quality,
            width: canvas.width,
            height: canvas.height,
          });
          if (onProgress) onProgress(0.5); // notify UI that encoding has started

          if (onProgress) {
            gif2.on("progress", (p: number) => {
              console.debug("Fallback GIF encode progress:", p);
              onProgress(0.5 + p * 0.5);
            });
          }

          // Add frames from framesDataURLs
          for (let i = 0; i < framesDataURLs.length; i++) {
            const dataUrl = framesDataURLs[i];
            await new Promise<void>((res, rej) => {
              const im = new Image();
              im.onload = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(im, 0, 0, canvas.width, canvas.height);
                try {
                  gif2.addFrame(ctx, { copy: true, delay: delayMs });
                } catch (e) {
                  console.warn("gif2.addFrame failed:", e);
                }
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
    }, 3000); // 3s timeout to detect stalled worker

    gif.on("finished", (blobObj: Blob) => {
      clearTimeout(fallbackTimeout);
      resolve(blobObj);
    });
    gif.on("error", (err: any) => {
      clearTimeout(fallbackTimeout);
      reject(err);
    });
    gif.on("progress", (p: number) => {
      encodeStarted = true; // mark that worker encoding is happening
    });

    try {
      console.debug("Starting worker render...");
      if (onProgress) onProgress(0.5);
      gif.render();
    } catch (err) {
      clearTimeout(fallbackTimeout);
      reject(err);
    }
  });

  return blob;
}
