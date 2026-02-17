// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { exportPathToImage } from "../utils/exportAnimation";
import type { ExportImageOptions } from "../utils/exportAnimation";

// Mock global Image
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

// Mock DOMParser
global.DOMParser = class {
  parseFromString(str: string, type: string) {
    return {
      documentElement: {
        firstChild: { nodeName: "mockNode" },
        hasAttribute: () => false,
        setAttribute: vi.fn(),
        insertBefore: vi.fn(),
        appendChild: vi.fn(),
      }
    } as any;
  }
} as any;

// Mock FileReader
global.FileReader = class {
    readAsDataURL() {
        setTimeout(() => this.onloadend(), 5);
    }
    onloadend: any = () => {};
    result = "data:image/png;base64,mock";
} as any;

describe("exportPathToImage", () => {
  let mockTwo: any;
  let mockCtx: any;
  let mockCanvas: any;
  let options: ExportImageOptions;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        blob: () => Promise.resolve(new Blob(["image-data"], { type: "image/png" })),
    }));

    // Mock Canvas Context
    mockCtx = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
    };

    // Mock Canvas
    mockCanvas = {
      width: 100,
      height: 100,
      getContext: vi.fn().mockReturnValue(mockCtx),
      toBlob: vi.fn((cb, type, quality) => {
          cb(new Blob(["canvas-data"], { type }));
      }),
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

    options = {
      two: mockTwo,
      format: "png",
      scale: 1,
      quality: 0.9,
      robotState: { x: 50, y: 50, heading: 90 },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should export PNG blob", async () => {
      const blob = await exportPathToImage(options);
      expect(blob).toBeDefined();
      expect(blob.type).toBe("image/png");
      expect(mockCanvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png", undefined);
      // Background/Robot drawing via renderFrameToCanvas logic
      // Note: Since background/robot images are async mocked, wait for them?
      // renderFrameToCanvas awaits image onload, so it should be fine.
  });

  it("should export JPEG blob with quality", async () => {
      options.format = "jpeg";
      options.quality = 0.5;
      const blob = await exportPathToImage(options);
      expect(blob).toBeDefined();
      expect(blob.type).toBe("image/jpeg");
      expect(mockCanvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.5);
  });

  it("should export SVG blob", async () => {
      options.format = "svg";
      const blob = await exportPathToImage(options);
      expect(blob).toBeDefined();
      expect(blob.type).toMatch(/svg/);
      // Should not use canvas for SVG
      expect(mockCanvas.toBlob).not.toHaveBeenCalled();
  });

  it("should embed background and robot images in SVG", async () => {
      options.format = "svg";
      options.backgroundImageSrc = "http://example.com/bg.png";
      options.robotImageSrc = "http://example.com/robot.png";

      await exportPathToImage(options);

      // We can't easily check the blob content here due to mocks, but we can verify fetch was called
      expect(global.fetch).toHaveBeenCalledWith("http://example.com/bg.png");
      expect(global.fetch).toHaveBeenCalledWith("http://example.com/robot.png");
  });
});
