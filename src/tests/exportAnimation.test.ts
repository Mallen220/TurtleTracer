// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { exportPathToGif, exportPathToApng } from "../utils/exportAnimation";
import type { ExportAnimationOptions } from "../utils/exportAnimation";

// Mock gif.js
vi.mock("gif.js", () => {
  return {
    default: class GIF {
      options: any;
      frames: any[] = [];
      handlers: Record<string, Function> = {};
      constructor(options: any) {
        this.options = options;
        // Expose last instance for tests to inspect frame count
        (global as any).__lastGifInstance = this;
      }
      addFrame(image: any, options: any) {
        this.frames.push({ image, options });
      }
      on(event: string, handler: Function) {
        this.handlers[event] = handler;
      }
      render() {
        if (this.handlers["finished"]) {
          this.handlers["finished"](
            new Blob(["gif-data"], { type: "image/gif" }),
          );
        }
      }
    },
  };
});

// Mock upng-js
vi.mock("upng-js", () => {
  return {
    encode: vi.fn().mockReturnValue(new ArrayBuffer(8)),
  };
});

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
      quality: 10,
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
      const inst = (global as any).__lastGifInstance;
      expect(inst).toBeDefined();
      expect(inst.frames.length).toBe(calculatedFrames);

      // Ensure total delay (centiseconds) sums to duration*100 (1/100s)
      const totalCs = inst.frames.reduce((sum: number, f: any) => {
        const d = Math.round((f.options?.delay ?? 0) / 10);
        return sum + d;
      }, 0);
      expect(totalCs).toBe(Math.round(duration * 100));
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
    }

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

    it("should respect quality settings", async () => {
      // Quality <= 9 should use cnum 0 (lossless)
      const upng = await import("upng-js");
      await exportPathToApng({ ...options, quality: 5 });
      expect(upng.encode).toHaveBeenCalledWith(
        expect.anything(),
        100,
        100,
        0,
        expect.anything(),
      );

      // Quality >= 10 should use cnum 256
      await exportPathToApng({ ...options, quality: 20 });
      expect(upng.encode).toHaveBeenCalledWith(
        expect.anything(),
        100,
        100,
        256,
        expect.anything(),
      );
    });

    it("should not cap frames for APNG exports", async () => {
      const duration = 20; // seconds
      const fps = 30;
      const calculatedFrames = Math.ceil(duration * fps);
      const upng = await import("upng-js");
      await exportPathToApng({ ...options, durationSec: duration, fps });
      // The first argument to encode is the buffers array
      const mockEncode = upng.encode as unknown as {
        mock: { calls: any[][] };
      };
      expect(mockEncode.mock.calls.length).toBeGreaterThanOrEqual(1);
      const buffers =
        mockEncode.mock.calls[mockEncode.mock.calls.length - 1][0];
      expect(buffers.length).toBe(calculatedFrames);

      // Ensure delays sum to total duration in ms
      const delays = mockEncode.mock.calls[mockEncode.mock.calls.length - 1][4];
      const totalMs = delays.reduce((s: number, v: number) => s + v, 0);
      expect(totalMs).toBe(Math.round(duration * 1000));
    });

    it("should abort when signal is aborted (APNG)", async () => {
      await setupAbortTest(exportPathToApng);
    });
  });
  });
});
