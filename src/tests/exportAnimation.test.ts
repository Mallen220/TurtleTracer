// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { exportPathToGif, exportPathToApng } from "../utils/exportAnimation";
import type { ExportAnimationOptions } from "../utils/exportAnimation";
import type Two from "two.js";

// Mock gif.js
vi.mock("gif.js", () => {
  return {
    default: class GIF {
      options: any;
      frames: any[] = [];
      handlers: Record<string, Function> = {};
      constructor(options: any) {
        this.options = options;
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

// Mock global Image
// We use a property descriptor or a class with a backing field to avoid recursion
const OriginalImage = global.Image;
class MockImage {
  _src = "";
  width = 100;
  height = 100;
  crossOrigin = "";
  onload: () => void = () => {};
  onerror: (err: any) => void = () => {};

  get src() {
    return this._src;
  }

  set src(val: string) {
    this._src = val;
    // Simulate async load
    setTimeout(() => {
      if (val === "error") {
        if (this.onerror) this.onerror(new Error("Failed to load"));
      } else {
        if (this.onload) this.onload();
      }
    }, 5);
  }
}
global.Image = MockImage as any;

// Mock XMLSerializer
global.XMLSerializer = class {
  serializeToString(node: Node) {
    return "<svg></svg>";
  }
} as any;

describe("exportAnimation", () => {
  let mockTwo: any;
  let mockController: any;
  let mockCtx: any;
  let options: ExportAnimationOptions;

  beforeEach(() => {
    // Mock Canvas Context
    mockCtx = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      getImageData: vi.fn().mockReturnValue({
        data: new Uint8Array(100 * 100 * 4),
        width: 100,
        height: 100,
      }),
    };

    // Mock Canvas
    const mockCanvas = {
      width: 100,
      height: 100,
      getContext: vi.fn().mockReturnValue(mockCtx),
      toDataURL: vi.fn().mockReturnValue("data:image/png;base64,dummy"),
    };

    vi.spyOn(document, "createElement").mockImplementation((tag) => {
      if (tag === "canvas") return mockCanvas as any;
      return document.createElement(tag);
    });

    mockTwo = {
      update: vi.fn(),
      renderer: {
        domElement: {
          getBoundingClientRect: vi.fn().mockReturnValue({
            width: 100,
            height: 100,
          }),
        },
      },
    };

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
      // We expect drawImage to be called for background + svg frame
      expect(mockCtx.drawImage).toHaveBeenCalled();
    });

    it("should abort when signal is aborted (GIF)", async () => {
      const controller = new AbortController();
      const p = exportPathToGif({
        ...options,
        durationSec: 0.5,
        fps: 15,
        signal: controller.signal,
      });
      setTimeout(() => controller.abort(), 10);
      await expect(p).rejects.toHaveProperty("name", "AbortError");
    });
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

    it("should abort when signal is aborted (APNG)", async () => {
      const controller = new AbortController();
      const p = exportPathToApng({
        ...options,
        durationSec: 0.5,
        fps: 15,
        signal: controller.signal,
      });
      setTimeout(() => controller.abort(), 10);
      await expect(p).rejects.toHaveProperty("name", "AbortError");
    });
  });
});
