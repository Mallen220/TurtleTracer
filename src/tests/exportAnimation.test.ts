// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  exportPathToGif,
  exportPathToApng,
  estimateGifSize,
} from "../utils/exportAnimation";
import type { ExportAnimationOptions } from "../utils/exportAnimation";

// Mock gifenc
vi.mock("gifenc", () => ({
  GIFEncoder: () => {
    const encoder = {
      frames: [] as any[],
      writeFrame(_index: any, _w: number, _h: number, options: any) {
        encoder.frames.push({ options });
      },
      finish() {},
      bytesView: () => new Uint8Array(8),
    };
    // Expose last instance for tests to inspect frame count
    (globalThis as any).__lastGifInstance = encoder;
    return encoder;
  },
  quantize: vi.fn(() => [[0, 0, 0, 0]]),
  applyPalette: () => new Uint8Array(0),
}));

// Mock upng-js
// What upng-js makes of N frames: each one a 1 x 1 patch, which compresses
// to 500 bytes
const { fakeCompress } = vi.hoisted(() => ({
  fakeCompress: (frames: ArrayBuffer[]) => ({
    depth: 8,
    ctype: 6,
    frames: frames.map(() => ({
      rect: { x: 0, y: 0, width: 1, height: 1 },
      dispose: 0,
      blend: 0,
      img: new Uint8Array(4),
      bpl: 4,
      bpp: 4,
    })),
  }),
}));
vi.mock("upng-js", () => ({
  encode: Object.assign(vi.fn(), {
    compress: vi.fn(fakeCompress),
    _filterZero: vi.fn(() => new Uint8Array(500)),
  }),
  crc: { crc: () => 0 },
}));

// The delay of every frame in an APNG, read from its fcTL chunks
async function apngDelays(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const delays: number[] = [];
  for (let at = 8; at < bytes.length; ) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.slice(at + 4, at + 8));
    if (type === "fcTL") delays.push(view.getUint16(at + 8 + 20));
    at += 12 + length;
  }
  return delays;
}

import { setupImageMocks } from "./exportMocks";
import { setupCanvasMocks } from "./canvasMocks";
setupImageMocks();

describe("exportAnimation", () => {
  let mockTwo: any;
  let mockController: any;
  let mockCtx: any;
  let options: ExportAnimationOptions;

  beforeEach(() => {
    const canvasMocks = setupCanvasMocks();
    mockCtx = canvasMocks.mockCtx;
    mockTwo = canvasMocks.mockTwo;

    mockController = {
      pause: vi.fn(),
      play: vi.fn(),
      isPlaying: vi.fn().mockReturnValue(true),
      getPercent: vi.fn().mockReturnValue(50),
      seekToPercent: vi.fn(),
    };

    options = {
      two: mockTwo,
      animationController: mockController,
      durationSec: 0.1, // Short duration for faster tests
      fps: 10,
      scale: 1,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("exportPathToGif", () => {
    it("should export a GIF blob", async () => {
      const blob = await exportPathToGif(options);
      expect(blob).toBeDefined();
      expect(blob.type).toBe("image/gif");

      expect(mockController.pause).toHaveBeenCalled();
      expect(mockController.seekToPercent).toHaveBeenCalled();
      expect(mockController.play).toHaveBeenCalled();
      expect(mockTwo.update).toHaveBeenCalled();
    });

    it("leaves the obstacles and their numbered corners out of the frames", async () => {
      const seen: (Element | null)[] = [];
      globalThis.XMLSerializer = class {
        serializeToString(node: Element) {
          seen.push(node.querySelector('#shape-group, [id^="obstacle-"]'));
          return "<svg></svg>";
        }
      } as any;
      await exportPathToGif(options);
      expect(seen.length).toBeGreaterThan(0);
      expect(seen.every((g) => g === null)).toBe(true);
      // The field's own drawing is left alone
      expect(
        mockTwo.renderer.domElement.querySelector(
          '#shape-group, [id^="obstacle-"]',
        ),
      ).not.toBeNull();
    });

    describe("field and robot images", () => {
      const close = vi.fn();
      beforeEach(() => {
        close.mockClear();
        vi.stubGlobal(
          "createImageBitmap",
          vi.fn(async () => ({ close, width: 1, height: 1 })),
        );
      });
      afterEach(() => vi.unstubAllGlobals());

      const withImages = {
        backgroundImageSrc: "field.png",
        robotImageSrc: "robot.png",
        robotLengthPx: 20,
        robotWidthPx: 10,
      };

      it("scales each once per pass, not on every frame, and closes them", async () => {
        await exportPathToGif({ ...options, ...withImages, scale: 2 });
        const make = globalThis.createImageBitmap as unknown as ReturnType<
          typeof vi.fn
        >;
        // Two passes (choosing the palette, then encoding), each making the
        // field at 200 x 200 and the robot at 2x its size
        const sizes = make.mock.calls.map((c) => c[1]);
        expect(sizes).toHaveLength(4);
        expect(sizes.slice(0, 2)).toEqual([
          expect.objectContaining({ resizeWidth: 200, resizeHeight: 200 }),
          expect.objectContaining({ resizeWidth: 40, resizeHeight: 20 }),
        ]);
        expect(sizes.slice(2)).toEqual(sizes.slice(0, 2));
        expect(close).toHaveBeenCalledTimes(4);
      });

      it("closes them when the export fails", async () => {
        const controller = new AbortController();
        const p = exportPathToGif({
          ...options,
          ...withImages,
          signal: controller.signal,
        });
        controller.abort();
        await expect(p).rejects.toHaveProperty("name", "AbortError");
        expect(close).toHaveBeenCalledTimes(2);
      });
    });

    it("should respect onProgress callback", async () => {
      const onProgress = vi.fn();
      await exportPathToGif({ ...options, onProgress });
      expect(onProgress).toHaveBeenCalled();
    });

    it("should handle background images", async () => {
      await exportPathToGif({ ...options, backgroundImageSrc: "test.png" });
      // expect drawImage to be called for background + svg frame
      expect(mockCtx.drawImage).toHaveBeenCalled();
    });

    it("should not cap frames for GIF exports", async () => {
      const duration = 20; // seconds
      const fps = 30;
      const calculatedFrames = Math.ceil(duration * fps);
      await exportPathToGif({ ...options, durationSec: duration, fps });
      const inst = (globalThis as any).__lastGifInstance;
      expect(inst).toBeDefined();
      expect(inst.frames.length).toBe(calculatedFrames);

      // Ensure total delay (centiseconds) sums to duration*100 (1/100s)
      const totalCs = inst.frames.reduce((sum: number, f: any) => {
        const d = Math.round((f.options?.delay ?? 0) / 10);
        return sum + d;
      }, 0);
      expect(totalCs).toBe(Math.round(duration * 100));
    });

    it("uses one palette for the whole GIF, chosen from several frames", async () => {
      const gifenc = await import("gifenc");
      const quantize = gifenc.quantize as unknown as ReturnType<typeof vi.fn>;
      quantize.mockClear();
      await exportPathToGif({ ...options, durationSec: 1, fps: 10 });
      expect(quantize).toHaveBeenCalledTimes(1);
      // 8 sample frames' pixels went in together
      const pixels = quantize.mock.calls[0][0] as Uint8ClampedArray;
      const one = (mockCtx.getImageData as any)().data.length;
      expect(pixels.length).toBe(8 * one);
      // Stored once, with the first frame
      const frames = (globalThis as any).__lastGifInstance.frames;
      expect(frames[0].options.palette).toBeDefined();
      expect(frames.slice(1).every((f: any) => !f.options.palette)).toBe(true);
    });

    const setupAbortTest = async (exportFn: any) => {
      const controller = new AbortController();
      const p = exportFn({
        ...options,
        durationSec: 0.5,
        fps: 15,
        signal: controller.signal,
      });
      setTimeout(() => controller.abort(), 10);
      await expect(p).rejects.toHaveProperty("name", "AbortError");
    };

    it("should abort when signal is aborted (GIF)", async () => {
      await setupAbortTest(exportPathToGif);
    });

    describe("exportPathToApng", () => {
      it("should export an APNG blob", async () => {
        const blob = await exportPathToApng(options);
        expect(blob).toBeDefined();
        expect(blob.type).toBe("image/png");

        expect(mockController.pause).toHaveBeenCalled();
        expect(mockController.seekToPercent).toHaveBeenCalled();
        expect(mockController.play).toHaveBeenCalled();
      });

      it("only reduces to a shared palette when asked to", async () => {
        const upng = await import("upng-js");
        const gifenc = await import("gifenc");
        const compressPNG = (upng.encode as any).compress;
        const quantize = gifenc.quantize as unknown as ReturnType<typeof vi.fn>;
        compressPNG.mockClear();
        quantize.mockClear();
        // A fresh frame each time, as the real canvas gives
        mockCtx.getImageData.mockImplementation(() => ({
          data: new Uint8ClampedArray(100 * 100 * 4),
        }));

        await exportPathToApng(options);
        expect(compressPNG).toHaveBeenCalledWith(
          expect.anything(),
          100,
          100,
          0,
          false,
          false,
        );
        expect(quantize).not.toHaveBeenCalled();

        await exportPathToApng({ ...options, reduceColors: true });
        // 255, because upng-js adds a transparent entry of its own
        expect(quantize).toHaveBeenCalledWith(expect.anything(), 255, {
          format: "rgba4444",
        });
      });

      it("never goes through upng-js's encode(), which can't hold a long export", async () => {
        const upng = await import("upng-js");
        (upng.encode as unknown as ReturnType<typeof vi.fn>).mockClear();
        await exportPathToApng({ ...options, reduceColors: true });
        await exportPathToApng(options);
        expect(upng.encode).not.toHaveBeenCalled();
      });

      it("should not cap frames for APNG exports", async () => {
        const duration = 20; // seconds
        const fps = 30;
        const calculatedFrames = Math.ceil(duration * fps);
        const upng = await import("upng-js");
        const compressPNG = (upng.encode as any).compress;
        // The frames array is emptied once encoding is done, so count them
        // as the encoder receives them.
        let framesEncoded = 0;
        compressPNG.mockImplementationOnce((frames: ArrayBuffer[]) => {
          framesEncoded = frames.length;
          return fakeCompress(frames);
        });
        const blob = await exportPathToApng({
          ...options,
          durationSec: duration,
          fps,
        });
        expect(framesEncoded).toBe(calculatedFrames);

        // Ensure delays sum to total duration in ms
        const delays = await apngDelays(blob);
        expect(delays).toHaveLength(calculatedFrames);
        expect(delays.reduce((sum, v) => sum + v, 0)).toBe(
          Math.round(duration * 1000),
        );
      });

      it("reports each stage in order, and the bar only goes forward", async () => {
        const calls: [number, string | undefined][] = [];
        await exportPathToApng({
          ...options,
          reduceColors: true,
          onProgress: (p, stage) => calls.push([p, stage]),
        });
        const stages = [...new Set(calls.map(([, stage]) => stage))];
        expect(stages).toEqual([
          "Capturing frames",
          "Reducing colors",
          "Comparing frames",
          "Encoding APNG",
        ]);
        const values = calls.map(([p]) => p);
        expect(values).toEqual([...values].sort((a, b) => a - b));
        expect(values.at(-1)).toBeCloseTo(1);
        // Capturing stays within its own share of the bar
        const capture = calls.filter(([, s]) => s === "Capturing frames");
        expect(Math.max(...capture.map(([p]) => p))).toBeCloseTo(0.15);
      });

      it("can be cancelled while it is encoding", async () => {
        const controller = new AbortController();
        await expect(
          exportPathToApng({
            ...options,
            signal: controller.signal,
            onProgress: (_p, stage) => {
              if (stage === "Encoding APNG") controller.abort();
            },
          }),
        ).rejects.toHaveProperty("name", "AbortError");
      });

      it("gives the frames back at once when it runs out of memory", async () => {
        const made: ArrayBuffer[] = [];
        mockCtx.getImageData.mockImplementation(() => {
          if (made.length === 3) {
            throw new RangeError("Out of memory at ImageData creation");
          }
          const data = new Uint8ClampedArray(100 * 100 * 4);
          made.push(data.buffer);
          return { data };
        });
        await expect(
          exportPathToApng({ ...options, durationSec: 1, fps: 10 }),
        ).rejects.toThrow(RangeError);
        expect(made).toHaveLength(3);
        // A detached buffer reads as empty: its memory is already released
        expect(made.map((b) => b.byteLength)).toEqual([0, 0, 0]);
      });

      it("gives the frames back once the APNG is built", async () => {
        const made: ArrayBuffer[] = [];
        mockCtx.getImageData.mockImplementation(() => {
          const data = new Uint8ClampedArray(100 * 100 * 4);
          made.push(data.buffer);
          return { data };
        });
        await exportPathToApng({ ...options, durationSec: 1, fps: 10 });
        expect(made.length).toBeGreaterThan(0);
        expect(made.every((b) => b.byteLength === 0)).toBe(true);
      });

      it("should abort when signal is aborted (APNG)", async () => {
        await setupAbortTest(exportPathToApng);
      });
    });
  });

  describe("estimateGifSize", () => {
    it("scales one sample frame up to every frame", async () => {
      // 10 frames (1 s at 10 fps); the mock GIF encodes to 8 bytes
      const bytes = await estimateGifSize({ ...options, durationSec: 1 });
      expect(bytes).toBe(new Blob(["gif-data"]).size * 10);
      // Only a sample frame is captured, not the whole animation
      const inst = (globalThis as any).__lastGifInstance;
      expect(inst.frames.length).toBe(1);
    });

    it("leaves the progress bar alone", async () => {
      const onProgress = vi.fn();
      await estimateGifSize({ ...options, onProgress });
      expect(onProgress).not.toHaveBeenCalled();
    });
  });
});
