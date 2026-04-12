// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { exportPathToImage } from "../utils/exportAnimation";
import type { ExportImageOptions } from "../utils/exportAnimation";

import { setupImageMocks } from "./exportMocks";
import { setupCanvasMocks } from "./canvasMocks";
setupImageMocks();

// Mock DOMParser
globalThis.DOMParser = class {
  parseFromString(str: string, type: string) {
    return {
      documentElement: {
        firstChild: { nodeName: "mockNode" },
        hasAttribute: () => false,
        setAttribute: vi.fn(),
        insertBefore: vi.fn(),
        appendChild: vi.fn(),
      },
    } as any;
  }
} as any;

// Mock FileReader
globalThis.FileReader = class {
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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        blob: () =>
          Promise.resolve(new Blob(["image-data"], { type: "image/png" })),
      }),
    );

    const canvasMocks = setupCanvasMocks();
    mockCtx = canvasMocks.mockCtx;
    mockCanvas = canvasMocks.mockCanvas;
    mockTwo = canvasMocks.mockTwo;

    options = {
      two: mockTwo,
      format: "png",
      scale: 1,
      quality: 0.9,
      backgroundBounds: { x: 0, y: 0, width: 100, height: 100 },
      robotScreenState: { x: 50, y: 50, heading: 90 },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should export PNG blob", async () => {
    const blob = await exportPathToImage(options);
    expect(blob).toBeDefined();
    expect(blob.type).toBe("image/png");
    expect(mockCanvas.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      "image/png",
      undefined,
    );
  });

  it("should export JPEG blob with quality", async () => {
    options.format = "jpeg";
    options.quality = 0.5;
    const blob = await exportPathToImage(options);
    expect(blob).toBeDefined();
    expect(blob.type).toBe("image/jpeg");
    expect(mockCanvas.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      "image/jpeg",
      0.5,
    );
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

    expect(globalThis.fetch).toHaveBeenCalledWith("http://example.com/bg.png");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://example.com/robot.png",
    );
  });

  it("should not fetch a robot image when none is provided", async () => {
    options.format = "svg";
    options.backgroundImageSrc = "http://example.com/bg.png";
    // robotImageSrc left undefined to simulate "none"

    await exportPathToImage(options);

    expect(globalThis.fetch).toHaveBeenCalledWith("http://example.com/bg.png");
    // should not trigger a second fetch for robot
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
