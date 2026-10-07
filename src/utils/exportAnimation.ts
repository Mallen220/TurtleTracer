// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Exports the field view as a still image (PNG/JPEG/SVG) or the path
// animation as a GIF (via gif.js) or APNG (via upng-js).

import type Two from "two.js";
import type { AnimationController } from "./animation";

function makeAbortError() {
  const e = new Error("Aborted");
  e.name = "AbortError";
  return e;
}

export interface ExportAnimationOptions {
  two: Two; // Two.js instance
  animationController: AnimationController;
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

export interface ExportImageOptions {
  two: Two;
  format: "png" | "jpeg" | "svg";
  scale?: number; // resolution scale
  quality?: number; // for jpeg (0.1 - 1.0)
  backgroundImageSrc?: string;
  robotImageSrc?: string;
  robotLengthPx?: number;
  robotWidthPx?: number;
  // Screen Coordinates for background placement
  backgroundBounds?: { x: number; y: number; width: number; height: number };
  // Screen Coordinates for robot placement
  robotScreenState?: { x: number; y: number; heading: number };
}

// Internal helper to render a single frame to a canvas
async function renderFrameToCanvas(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  svgEl: SVGElement,
  percent: number,
  options: ExportAnimationOptions | ExportImageOptions,
  backgroundImage: HTMLImageElement | null,
  robotImage: HTMLImageElement | null,
  scale: number,
): Promise<void> {
  // Serialize the SVG
  const svgString = new XMLSerializer().serializeToString(svgEl);
  // Ensure xmlns is present
  const hasNs = svgString.includes("xmlns=");
  const svgWithNs = hasNs
    ? svgString
    : svgString.replaceAll("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
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
          if ("backgroundBounds" in options && options.backgroundBounds) {
            // Draw using screen bounds scaled by resolution scale
            const b = options.backgroundBounds;
            ctx.drawImage(
              backgroundImage,
              b.x * scale,
              b.y * scale,
              b.width * scale,
              b.height * scale,
            );
          } else {
            // Fallback (Animation mode assumes full canvas usually)
            ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
          }
        } catch (e) {
          console.warn("Failed to draw background image onto canvas:", e);
        }
      }

      // Draw the rasterized SVG on top
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Draw robot overlay (if provided) on top of SVG
      try {
        let state: { x: number; y: number; heading: number } | undefined;

        // Check if explicit screen state provided (Export Image)
        if ("robotScreenState" in options && options.robotScreenState) {
          state = options.robotScreenState;
        }
        // Else use calculator (Animation)
        else if ("getRobotState" in options && options.getRobotState) {
          state = options.getRobotState(percent);
        }

        if (state && !Number.isNaN(state.x) && !Number.isNaN(state.y)) {
          ctx.save();
          // Translate to robot center (scaled)
          ctx.translate(state.x * scale, state.y * scale);
          // Rotate by heading (convert deg -> rad)
          ctx.rotate((state.heading * Math.PI) / 180);

          if (robotImage) {
            // Scale robot dimensions
            const rw =
              (options.robotLengthPx ?? (robotImage.width || 0)) * scale;
            const rh =
              (options.robotWidthPx ?? (robotImage.height || 0)) * scale;

            // Draw centered
            ctx.drawImage(robotImage, -rw / 2, -rh / 2, rw, rh);
          } else {
            // Draw "no-image" robot (green square)
            const rw = (options.robotLengthPx ?? 16) * scale;
            const rh = (options.robotWidthPx ?? 16) * scale;

            ctx.fillStyle = "rgba(34, 197, 94, 0.10)";
            ctx.strokeStyle = "#16a34a";
            ctx.lineWidth = 2 * scale;

            // Draw rounded rectangle
            ctx.beginPath();
            if (ctx.roundRect) {
              ctx.roundRect(-rw / 2, -rh / 2, rw, rh, 8 * scale);
            } else {
              ctx.rect(-rw / 2, -rh / 2, rw, rh);
            }
            ctx.fill();
            ctx.stroke();

            // Draw heading arrow
            ctx.save();
            ctx.strokeStyle = "rgba(34, 197, 94, 1.0)";
            ctx.lineWidth = 3 * scale;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.shadowColor = "rgba(255,255,255,0.8)";
            ctx.shadowBlur = 2 * scale;

            ctx.scale(scale, scale);
            ctx.translate(-12, -12); // center the 24x24 viewBox
            ctx.beginPath();
            ctx.moveTo(8.25, 4.5);
            ctx.lineTo(15.75, 12);
            ctx.lineTo(8.25, 19.5);
            ctx.stroke();
            ctx.restore();
          }
          ctx.restore();
        }
      } catch (e) {
        console.warn("Failed to draw robot overlay onto canvas:", e);
      }
      resolve();
    };
    img.onerror = () => reject(new Error("Failed to rasterize SVG to image"));
    img.src = data;
  });
}

/** Loads an image, resolving to null if it can't be loaded. */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function prepareResources(
  options: ExportAnimationOptions | ExportImageOptions,
) {
  const { backgroundImageSrc, robotImageSrc } = options;
  // "none" and "turtle" are built-in robot styles, not image URLs.
  const hasRobotImage =
    !!robotImageSrc && robotImageSrc !== "none" && robotImageSrc !== "turtle";

  const [backgroundImage, robotImage] = await Promise.all([
    backgroundImageSrc ? loadImage(backgroundImageSrc) : null,
    hasRobotImage ? loadImage(robotImageSrc) : null,
  ]);
  return { backgroundImage, robotImage };
}

// Helper: Convert URL to base64 Data URI
async function urlToDataUri(url: string): Promise<string> {
  // Check if already data URI
  if (url.startsWith("data:")) return url;

  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () =>
        reject(new Error("Failed to convert blob to data URI"));
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn("Failed to fetch image for data URI conversion:", url, e);
    return "";
  }
}

export async function exportPathToImage(
  options: ExportImageOptions,
): Promise<Blob> {
  const { two, format, scale = 1, quality = 0.9 } = options;

  // 1. Prepare Resources (Field, Robot)
  const { backgroundImage, robotImage } = await prepareResources(options);

  // Get SVG dimensions
  const svgEl = getSvgElement(two);
  const rect = svgEl.getBoundingClientRect();
  const width = Math.round(rect.width * scale);
  const height = Math.round(rect.height * scale);

  // SVG Export
  if (format === "svg") {
    const twoSvgString = new XMLSerializer().serializeToString(svgEl);
    const parser = new DOMParser();
    const doc = parser.parseFromString(twoSvgString, "image/svg+xml");
    const root = doc.documentElement;

    if (!root.hasAttribute("xmlns:xlink")) {
      root.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    }

    // 1. Background Image
    if (options.backgroundImageSrc && options.backgroundBounds) {
      const bgDataUri = await urlToDataUri(options.backgroundImageSrc);
      if (bgDataUri) {
        const b = options.backgroundBounds;
        const bgSvg = `<image href="${bgDataUri}" x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" preserveAspectRatio="none" />`;
        const bgFragment = parser.parseFromString(
          `<svg xmlns="http://www.w3.org/2000/svg">${bgSvg}</svg>`,
          "image/svg+xml",
        ).documentElement.firstChild;
        if (bgFragment) {
          root.insertBefore(bgFragment, root.firstChild);
        }
      }
    }

    // 2. Robot Image
    if (options.robotScreenState) {
      if (options.robotImageSrc && robotImage) {
        const robotDataUri = await urlToDataUri(options.robotImageSrc);
        if (robotDataUri) {
          const rw = options.robotLengthPx ?? (robotImage.width || 50);
          const rh = options.robotWidthPx ?? (robotImage.height || 50);
          const state = options.robotScreenState;

          // SVG transform for robot
          // translate(x, y) rotate(deg) translate(-rw/2, -rh/2)
          const transform = `translate(${state.x}, ${state.y}) rotate(${state.heading}) translate(${-rw / 2}, ${-rh / 2})`;
          const robotSvg = `<image href="${robotDataUri}" width="${rw}" height="${rh}" transform="${transform}" />`;

          const robotFragment = parser.parseFromString(
            `<svg xmlns="http://www.w3.org/2000/svg">${robotSvg}</svg>`,
            "image/svg+xml",
          ).documentElement.firstChild;
          if (robotFragment) {
            root.appendChild(robotFragment);
          }
        }
      } else {
        const rw = options.robotLengthPx ?? 16;
        const rh = options.robotWidthPx ?? 16;
        const state = options.robotScreenState;

        const transform = `translate(${state.x}, ${state.y}) rotate(${state.heading})`;
        const arrowTransform = `translate(-12, -12)`;

        // No leading whitespace: the first child of the parsed markup is what
        // gets added to the SVG, and it has to be the <g>, not a text node.
        const robotSvg = `<g transform="${transform}">
            <rect x="${-rw / 2}" y="${-rh / 2}" width="${rw}" height="${rh}" fill="rgba(34, 197, 94, 0.10)" stroke="#16a34a" stroke-width="2" rx="8" />
            <g transform="${arrowTransform}">
              <path stroke="rgba(34, 197, 94, 1.0)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none" d="M8.25 4.5l7.5 7.5-7.5 7.5" style="filter: drop-shadow(0px 0px 2px rgba(255,255,255,0.8));" />
            </g>
          </g>`;
        const robotFragment = parser.parseFromString(
          `<svg xmlns="http://www.w3.org/2000/svg">${robotSvg}</svg>`,
          "image/svg+xml",
        ).documentElement.firstChild;
        if (robotFragment) {
          root.appendChild(robotFragment);
        }
      }
    }

    const finalSvg = new XMLSerializer().serializeToString(doc);
    return new Blob([finalSvg], { type: "image/svg+xml;charset=utf-8" });
  }

  // Raster Export (PNG / JPEG)
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  await renderFrameToCanvas(
    ctx,
    canvas,
    svgEl,
    0,
    options,
    backgroundImage,
    robotImage,
    scale,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas export failed"));
      },
      format === "png" ? "image/png" : "image/jpeg",
      format === "jpeg" ? quality : undefined,
    );
  });
}

/** Splits `total` into `parts` whole numbers that add up to exactly `total`. */
function splitEvenly(total: number, parts: number): number[] {
  const result: number[] = [];
  let assigned = 0;
  for (let i = 1; i <= parts; i++) {
    const next = Math.round((i * total) / parts);
    result.push(next - assigned);
    assigned = next;
  }
  return result;
}

function getFrameCount({ durationSec, fps = 15 }: ExportAnimationOptions) {
  return Math.max(2, Math.ceil(durationSec * fps));
}

function getCanvasSize({ two, scale = 1 }: ExportAnimationOptions) {
  const rect = getSvgElement(two).getBoundingClientRect();
  return {
    width: Math.round(rect.width * scale),
    height: Math.round(rect.height * scale),
  };
}

function getSvgElement(two: Two): SVGElement {
  return two.renderer.domElement as SVGElement;
}

/**
 * Steps the animation from start to finish, drawing each frame onto a canvas
 * and handing it to `onFrame`. The animation is put back where it was
 * afterwards. Progress is reported from 0 up to `progressShare`.
 */
async function captureFrames(
  options: ExportAnimationOptions,
  progressShare: number,
  onFrame: (ctx: CanvasRenderingContext2D, index: number) => void,
): Promise<void> {
  const { two, animationController, scale = 1, onProgress, signal } = options;
  const frameCount = getFrameCount(options);

  const svgEl = getSvgElement(two);
  const { width, height } = getCanvasSize(options);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const wasPlaying = animationController.isPlaying();
  const startPercent = animationController.getPercent();
  animationController.pause();

  try {
    const { backgroundImage, robotImage } = await prepareResources(options);
    for (let i = 0; i < frameCount; i++) {
      if (signal?.aborted) throw makeAbortError();
      const percent = (i / (frameCount - 1)) * 100;
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
      onFrame(ctx, i);
      onProgress?.(((i + 1) / frameCount) * progressShare);
    }
  } finally {
    animationController.seekToPercent(startPercent);
    if (wasPlaying) animationController.play();
  }
}

export async function exportPathToGif(
  options: ExportAnimationOptions,
): Promise<Blob> {
  const { durationSec, quality = 20, onProgress, signal } = options;
  const { width, height } = getCanvasSize(options);
  // The encoders are only needed when exporting, so they load on demand.
  const [{ default: GIF }, { default: gifWorkerUrl }] = await Promise.all([
    import("gif.js"),
    // Vite: import worker script URL so gif.js can spawn workers correctly
    import("gif.js/dist/gif.worker.js?url"),
  ]);
  const gif = new GIF({
    workers: 2,
    quality,
    width,
    height,
    workerScript: gifWorkerUrl,
  });

  // GIF frame delays are stored in hundredths of a second.
  const delaysCs = splitEvenly(
    Math.round(durationSec * 100),
    getFrameCount(options),
  );

  // Capturing is the first half of the progress bar, encoding the second.
  await captureFrames(options, 0.5, (ctx, i) => {
    gif.addFrame(ctx, { copy: true, delay: delaysCs[i] * 10 });
  });

  return new Promise<Blob>((resolve, reject) => {
    if (signal?.aborted) return reject(makeAbortError());

    const onAbort = () => {
      gif.abort();
      reject(makeAbortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    gif.on("progress", (p: number) => onProgress?.(0.5 + p * 0.5));
    gif.on("finished", (blob: Blob) => {
      signal?.removeEventListener("abort", onAbort);
      resolve(blob);
    });
    gif.render();
  });
}

export async function exportPathToApng(
  options: ExportAnimationOptions,
): Promise<Blob> {
  const { durationSec, quality = 10, onProgress } = options;
  const { width, height } = getCanvasSize(options);
  const delaysMs = splitEvenly(
    Math.round(durationSec * 1000),
    getFrameCount(options),
  );

  const buffers: ArrayBuffer[] = [];
  await captureFrames(options, 0.9, (ctx) => {
    buffers.push(ctx.getImageData(0, 0, width, height).data.buffer);
  });

  onProgress?.(0.95);
  // A colour count of 0 means lossless; otherwise the image is reduced to
  // a 256 colour palette, which is much smaller.
  const colourCount = quality <= 9 ? 0 : 256;
  const UPNG = await import("upng-js");
  const apng = UPNG.encode(buffers, width, height, colourCount, delaysMs);
  onProgress?.(1);

  return new Blob([apng], { type: "image/png" });
}
