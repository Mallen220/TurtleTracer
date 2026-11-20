// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Exports the field view as a still image (PNG/JPEG/SVG) or the path
// animation as a GIF (via gifenc) or APNG (via upng-js).

import type Two from "two.js";
import type { AnimationController } from "./animation";
import { frameCountFor } from "./animationExportPlan";

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
  width?: number; // exact output width in px; wins over scale
  reduceColors?: boolean; // APNG only: 256 colors instead of lossless
  filename?: string; // suggested filename
  onProgress?: (progress: number, stage?: string) => void; // 0..1, and what is being done
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
  width?: number; // exact output width in px; wins over scale
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
  options: (ExportAnimationOptions | ExportImageOptions) & {
    hideObstacles?: boolean;
  },
  backgroundImage: HTMLImageElement | ImageBitmap | null,
  robotImage: HTMLImageElement | ImageBitmap | null,
  scale: number,
): Promise<void> {
  // Serialize the SVG, without the obstacles if asked.
  let source = svgEl;
  if (options.hideObstacles) {
    source = svgEl.cloneNode(true) as SVGElement;
    // The obstacles, and the numbered handles on their corners.
    source
      .querySelectorAll('#shape-group, [id^="obstacle-"]')
      .forEach((el) => el.remove());
  }
  const svgString = new XMLSerializer().serializeToString(source);
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
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to rasterize SVG to image"));
    img.src = data;
  });

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
        const rw = (options.robotLengthPx ?? (robotImage.width || 0)) * scale;
        const rh = (options.robotWidthPx ?? (robotImage.height || 0)) * scale;

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
        // The arrow is drawn in its own 24x24 units, so the context scale
        // sizes the stroke too. Scaling the line width as well made the
        // arrow lopsided at anything but 1x. (Shadow blur ignores the
        // context scale, so it is scaled by hand.)
        ctx.scale(scale, scale);
        ctx.translate(-12, -12); // center the 24x24 viewBox
        ctx.strokeStyle = "rgba(34, 197, 94, 1.0)";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.shadowColor = "rgba(255,255,255,0.8)";
        ctx.shadowBlur = 2 * scale;
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
  const { two, format, quality = 0.9 } = options;

  // 1. Prepare Resources (Field, Robot)
  const { backgroundImage, robotImage } = await prepareResources(options);

  // Get SVG dimensions
  const svgEl = getSvgElement(two);
  const { width, height, scale } = outputSize(options, svgEl);

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
  return frameCountFor(durationSec, fps);
}

/** Output pixels, and the scale from the on-screen field view that gives them. */
function outputSize(
  { width, scale = 1 }: { width?: number; scale?: number },
  svgEl: SVGElement,
) {
  const rect = svgEl.getBoundingClientRect();
  if (width && rect.width) scale = width / rect.width;
  return {
    width: width ?? Math.round(rect.width * scale),
    height: Math.round(rect.height * scale),
    scale,
  };
}

function getCanvasSize(options: ExportAnimationOptions) {
  return outputSize(options, getSvgElement(options.two));
}

function getSvgElement(two: Two): SVGElement {
  return two.renderer.domElement as SVGElement;
}

/** The image at the size it is drawn, or null where that can't be done. */
async function scaledBitmap(
  image: HTMLImageElement | null,
  width: number,
  height: number,
): Promise<ImageBitmap | null> {
  if (!image || typeof createImageBitmap !== "function") return null;
  if (width < 1 || height < 1) return null;
  return createImageBitmap(image, {
    resizeWidth: Math.round(width),
    resizeHeight: Math.round(height),
    resizeQuality: "high",
  });
}

/**
 * Frees raw frame memory now. Left alone it is only freed when the garbage
 * collector gets round to it, which after a failed export can be too late
 * for the next one. Detaching an ArrayBuffer releases its memory at once.
 */
function releaseFrames(buffers: ArrayBuffer[]) {
  for (const buffer of buffers) {
    try {
      buffer.transfer?.(0);
    } catch {
      // Not detachable here; the garbage collector will get it eventually.
    }
  }
  buffers.length = 0;
}

/**
 * Steps the animation from start to finish (or through `percents`), drawing
 * each frame onto a canvas and handing it to `onFrame`. The animation is put
 * back where it was afterwards. Progress is reported from 0 up to
 * `progressShare`.
 */
async function captureFrames(
  options: ExportAnimationOptions,
  progressShare: number,
  onFrame: (ctx: CanvasRenderingContext2D, index: number) => void,
  percents?: number[],
  stage = "Capturing frames",
): Promise<void> {
  const { two, animationController, onProgress, signal } = options;
  const frameCount = getFrameCount(options);
  const steps =
    percents ??
    Array.from({ length: frameCount }, (_, i) => (i / (frameCount - 1)) * 100);

  const svgEl = getSvgElement(two);
  const { width, height, scale } = getCanvasSize(options);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const wasPlaying = animationController.isPlaying();
  const startPercent = animationController.getPercent();
  animationController.pause();

  let backgroundBitmap: ImageBitmap | null = null;
  let robotBitmap: ImageBitmap | null = null;
  try {
    const resources = await prepareResources(options);
    // Each image is scaled to its drawn size once here, and closed at the
    // end. Drawing the full-size image on every frame leaves its
    // rasterizations in the browser's image cache, 100s of MB per export
    // that are not given back.
    backgroundBitmap = await scaledBitmap(
      resources.backgroundImage,
      width,
      height,
    );
    if (options.robotLengthPx && options.robotWidthPx) {
      robotBitmap = await scaledBitmap(
        resources.robotImage,
        options.robotLengthPx * scale,
        options.robotWidthPx * scale,
      );
    }
    const background = backgroundBitmap ?? resources.backgroundImage;
    const robot = robotBitmap ?? resources.robotImage;
    for (let i = 0; i < steps.length; i++) {
      if (signal?.aborted) throw makeAbortError();
      const percent = steps[i];
      animationController.seekToPercent(percent);
      two.update();
      await renderFrameToCanvas(
        ctx,
        canvas,
        svgEl,
        percent,
        { ...options, hideObstacles: true },
        background,
        robot,
        scale,
      );
      onFrame(ctx, i);
      onProgress?.(((i + 1) / steps.length) * progressShare, stage);
    }
  } finally {
    animationController.seekToPercent(startPercent);
    if (wasPlaying) animationController.play();
    backgroundBitmap?.close();
    robotBitmap?.close();
    // A canvas holds its pixels until it is collected unless it is shrunk.
    canvas.width = canvas.height = 0;
  }
}

/** One long array of the pixels of several frames. */
function joinPixels(parts: Uint8ClampedArray[]) {
  const out = new Uint8ClampedArray(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/**
 * Encodes frames as they arrive, so only the finished GIF is kept in memory
 * rather than every raw frame. Every frame uses the same palette: one per
 * frame made flat areas shift shade from frame to frame.
 */
async function startGif(options: ExportAnimationOptions) {
  const { GIFEncoder, applyPalette } = await import("gifenc");
  const { width, height } = getCanvasSize(options);
  const gif = GIFEncoder();
  let first = true;
  return {
    addFrame(rgba: Uint8ClampedArray, palette: number[][], delayMs: number) {
      // The palette is stored once, with the first frame, and shared.
      gif.writeFrame(applyPalette(rgba, palette), width, height, {
        palette: first ? palette : undefined,
        delay: delayMs,
      });
      first = false;
    },
    finish() {
      gif.finish();
      return new Blob([gif.bytesView()], { type: "image/gif" });
    },
  };
}

/**
 * The palette for a whole GIF, from a few frames spread along the animation.
 * A color that shows in none of them is drawn as the nearest one that does.
 */
async function gifPalette(options: ExportAnimationOptions) {
  const { quantize } = await import("gifenc");
  const { width, height } = getCanvasSize(options);
  const samples: Uint8ClampedArray[] = [];
  await captureFrames(
    { ...options, onProgress: undefined },
    0,
    (ctx) => samples.push(ctx.getImageData(0, 0, width, height).data),
    Array.from({ length: 8 }, (_, i) => (i * 100) / 7),
  );
  return quantize(joinPixels(samples), 256);
}

export async function exportPathToGif(
  options: ExportAnimationOptions,
): Promise<Blob> {
  const { durationSec, onProgress } = options;
  const { width, height } = getCanvasSize(options);
  onProgress?.(0, "Choosing colors");
  const palette = await gifPalette(options);
  const gif = await startGif(options);

  // GIF frame delays are stored in hundredths of a second.
  const delaysCs = splitEvenly(
    Math.round(durationSec * 100),
    getFrameCount(options),
  );

  await captureFrames(
    options,
    1,
    (ctx, i) =>
      gif.addFrame(
        ctx.getImageData(0, 0, width, height).data,
        palette,
        delaysCs[i] * 10,
      ),
    undefined,
    "Creating GIF",
  );
  return gif.finish();
}

/** Where a long step reports to, and how it is told to stop. */
interface Progress {
  report(fraction: number, stage: string): void;
  signal?: AbortSignal;
}

/** Lets the window repaint now and then during a long loop. */
function makeYielder() {
  let last = performance.now();
  return async () => {
    if (performance.now() - last < 40) return;
    await new Promise((resolve) => setTimeout(resolve));
    last = performance.now();
  };
}

/** The parts of upng-js used to build an APNG file without its own encode(). */
interface UpngInternals {
  encode: {
    compress(...args: unknown[]): any;
    _filterZero(...args: unknown[]): Uint8Array;
  };
  crc: { crc(data: Uint8Array, offset: number, length: number): number };
}

/**
 * What upng-js's compressPNG() does, in steps: the first finds what changes
 * from frame to frame, the loop compresses each frame. Done a frame at a time
 * the window stays alive and can show how far along it is.
 */
async function compressFrames(
  UPNG: UpngInternals,
  frames: ArrayBuffer[],
  width: number,
  height: number,
  progress?: Progress,
  diffShare = 0.4,
): Promise<Blob> {
  // The first step can't report part way, so it gets its own label and share
  // of the bar.
  progress?.report(0, "Comparing frames");
  await new Promise((resolve) => setTimeout(resolve)); // let the label paint
  const nimg = UPNG.encode.compress(frames, width, height, 0, false, false);
  progress?.report(diffShare, "Encoding APNG");
  const yieldToUi = makeYielder();
  for (let i = 0; i < nimg.frames.length; i++) {
    if (progress?.signal?.aborted) throw makeAbortError();
    const frame = nimg.frames[i];
    const rows = frame.rect.height;
    frame.cimg = UPNG.encode._filterZero(
      frame.img,
      rows,
      frame.bpp,
      frame.bpl,
      new Uint8Array(rows * frame.bpl + rows),
    );
    progress?.report(
      diffShare + ((i + 1) / nimg.frames.length) * (1 - diffShare),
      "Encoding APNG",
    );
    await yieldToUi();
  }
  return nimg;
}

/** The APNG file for frames compressed by compressFrames(). */
function writeApng(
  UPNG: UpngInternals,
  nimg: any,
  width: number,
  height: number,
  delaysMs: number[],
): Blob {
  const parts: Uint8Array[] = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  ];
  const chunk = (type: string, body: Uint8Array) => {
    const out = new Uint8Array(12 + body.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, body.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(body, 8);
    view.setUint32(8 + body.length, UPNG.crc.crc(out, 4, 4 + body.length));
    parts.push(out);
  };
  const fields = (...values: [number, 1 | 2 | 4][]) => {
    const out = new Uint8Array(values.reduce((n, [, size]) => n + size, 0));
    const view = new DataView(out.buffer);
    let at = 0;
    for (const [value, size] of values) {
      if (size === 4) view.setUint32(at, value);
      else if (size === 2) view.setUint16(at, value);
      else out[at] = value;
      at += size;
    }
    return out;
  };

  chunk(
    "IHDR",
    fields(
      [width, 4],
      [height, 4],
      [nimg.depth, 1],
      [nimg.ctype, 1],
      [0, 1],
      [0, 1],
      [0, 1],
    ),
  );
  chunk("sRGB", fields([1, 1]));
  chunk("acTL", fields([nimg.frames.length, 4], [0, 4])); // 0 plays: loop forever
  if (nimg.ctype === 3) {
    const palette: number[] = nimg.plte;
    const rgb = new Uint8Array(palette.length * 3);
    palette.forEach((c, i) =>
      rgb.set([c & 255, (c >> 8) & 255, (c >> 16) & 255], i * 3),
    );
    chunk("PLTE", rgb);
    if (nimg.gotAlpha)
      chunk(
        "tRNS",
        Uint8Array.from(palette, (c) => (c >> 24) & 255),
      );
  }

  let sequence = 0;
  nimg.frames.forEach((frame: any, i: number) => {
    const { rect } = frame;
    chunk(
      "fcTL",
      fields(
        [sequence++, 4],
        [rect.width, 4],
        [rect.height, 4],
        [rect.x, 4],
        [rect.y, 4],
        [delaysMs[i], 2],
        [1000, 2],
        [frame.dispose, 1],
        [frame.blend, 1],
      ),
    );
    if (i === 0) {
      chunk("IDAT", frame.cimg);
    } else {
      const body = new Uint8Array(4 + frame.cimg.length);
      new DataView(body.buffer).setUint32(0, sequence++);
      body.set(frame.cimg, 4);
      chunk("fdAT", body);
    }
  });
  chunk("IEND", new Uint8Array(0));
  return new Blob(parts as BlobPart[], { type: "image/png" });
}

/**
 * upng-js's encode() makes its output buffer as big as every raw frame put
 * together, and one array over about 2 GB can't be allocated. A long export
 * hit that with plenty of free memory. This builds the same file from the
 * compressed frames, in a buffer only as big as the file.
 */
export async function assembleApng(
  UPNG: UpngInternals,
  frames: ArrayBuffer[],
  width: number,
  height: number,
  delaysMs: number[],
  progress?: Progress,
  diffShare = 0.4,
): Promise<Blob> {
  const nimg = await compressFrames(
    UPNG,
    frames,
    width,
    height,
    progress,
    diffShare,
  );
  return writeApng(UPNG, nimg, width, height, delaysMs);
}

/**
 * Reduces every frame, in place, to one shared palette. upng-js writes a
 * palette PNG by itself when the frames hold no more than 256 colors, and one
 * of those is always the transparent entry, hence 255.
 */
async function reduceColorsInPlace(frames: ArrayBuffer[], progress?: Progress) {
  const { quantize, applyPalette } = await import("gifenc");
  // The palette comes from a few evenly spaced frames, not every one.
  const count = Math.min(8, frames.length);
  const picks = Array.from(
    { length: count },
    (_, i) =>
      frames[Math.round((i * (frames.length - 1)) / Math.max(1, count - 1))],
  );
  const palette = quantize(
    joinPixels(picks.map((buffer) => new Uint8ClampedArray(buffer))),
    255,
    { format: "rgba4444" },
  );
  // Each color as one 32-bit pixel (r, g, b, a in memory order)
  const colors = new Uint32Array(
    palette.map(
      ([r, g, b, a = 255]) =>
        new Uint32Array(new Uint8Array([r, g, b, a]).buffer)[0],
    ),
  );
  const yieldToUi = makeYielder();
  for (const [at, buffer] of frames.entries()) {
    if (progress?.signal?.aborted) throw makeAbortError();
    const indices = applyPalette(
      new Uint8ClampedArray(buffer),
      palette,
      "rgba4444",
    );
    const pixels = new Uint32Array(buffer);
    for (let i = 0; i < indices.length; i++) pixels[i] = colors[indices[i]];
    progress?.report((at + 1) / frames.length, "Reducing colors");
    await yieldToUi();
  }
}

/** A finished APNG of the frames. Reducing colors changes the frames. */
export async function buildApng(
  frames: ArrayBuffer[],
  width: number,
  height: number,
  delaysMs: number[],
  reduceColors: boolean,
  progress?: Progress,
): Promise<Blob> {
  const UPNG = await import("upng-js");
  // Shares of the time, measured on a 1080 px export of a busy path. Reduced
  // colors take about a third of the encoding and leave little for the final
  // compression, which is why the other shares move with it.
  const reduceShare = reduceColors ? 0.38 : 0;
  const diffShare = reduceColors ? 0.84 : 0.41;
  if (reduceColors) {
    await reduceColorsInPlace(frames, {
      signal: progress?.signal,
      report: (f, stage) => progress?.report(f * reduceShare, stage),
    });
  }
  return assembleApng(
    UPNG as unknown as UpngInternals,
    frames,
    width,
    height,
    delaysMs,
    {
      signal: progress?.signal,
      report: (f, stage) =>
        progress?.report(reduceShare + f * (1 - reduceShare), stage),
    },
    diffShare,
  );
}

export async function exportPathToApng(
  options: ExportAnimationOptions,
): Promise<Blob> {
  const { durationSec, reduceColors = false, onProgress } = options;
  const { width, height } = getCanvasSize(options);
  const delaysMs = splitEvenly(
    Math.round(durationSec * 1000),
    getFrameCount(options),
  );

  // Capturing is about a sixth of the time, encoding the rest.
  const captureShare = reduceColors ? 0.15 : 0.18;
  const buffers: ArrayBuffer[] = [];
  try {
    await captureFrames(options, captureShare, (ctx) => {
      buffers.push(ctx.getImageData(0, 0, width, height).data.buffer);
    });

    return await buildApng(buffers, width, height, delaysMs, reduceColors, {
      signal: options.signal,
      report: (fraction, stage) =>
        onProgress?.(captureShare + fraction * (1 - captureShare), stage),
    });
  } finally {
    // Whether it worked or ran out of memory, give the frames back at once.
    releaseFrames(buffers);
  }
}

/**
 * Rough size of the finished GIF, from encoding one sample frame. There is no
 * such estimate for an animated PNG: its size depends on how much changes
 * between frames, and sampling a pair of them was out by 2 to 13 times. Its
 * exact size is known once the preview has been made.
 */
export async function estimateGifSize(
  options: ExportAnimationOptions,
): Promise<number> {
  const { quantize } = await import("gifenc");
  const { width, height } = getCanvasSize(options);
  // No progress callback: capturing a sample must not drive the progress bar.
  const sample = { ...options, onProgress: undefined };
  const gif = await startGif(sample);
  await captureFrames(
    sample,
    0,
    (ctx) => {
      const { data } = ctx.getImageData(0, 0, width, height);
      gif.addFrame(data, quantize(data, 256), 100);
    },
    [50],
  );
  return gif.finish().size * getFrameCount(options);
}
