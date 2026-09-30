// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// What gets drawn onto the canvas when the field is exported as PNG or JPEG.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { exportPathToImage } from "../utils/exportAnimation";

type FakeImageInstance = { src: string; width: number; height: number };

function setup(
  options: { failSvg?: boolean; svgText?: string; roundRect?: boolean } = {},
) {
  const images: FakeImageInstance[] = [];
  class FakeImage {
    width = 30;
    height = 10;
    crossOrigin = "";
    onload: () => void = () => {};
    onerror: () => void = () => {};
    _src = "";
    get src() {
      return this._src;
    }
    set src(value: string) {
      this._src = value;
      images.push(this as unknown as FakeImageInstance);
      queueMicrotask(() =>
        options.failSvg && value.startsWith("data:image/svg")
          ? this.onerror()
          : this.onload(),
      );
    }
  }
  vi.stubGlobal("Image", FakeImage);
  vi.stubGlobal(
    "XMLSerializer",
    class {
      serializeToString() {
        return options.svgText ?? "<svg></svg>";
      }
    },
  );

  const calls: string[] = [];
  const ctx: Record<string, any> = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn((...a: number[]) => calls.push(`translate(${a})`)),
    rotate: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    rect: vi.fn(),
  };
  if (options.roundRect !== false) ctx.roundRect = vi.fn();
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toBlob: vi.fn((cb: (b: Blob | null) => void, type: string) =>
      cb(new Blob(["x"], { type })),
    ),
  };
  const createElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) =>
    tag === "canvas" ? (canvas as any) : createElement(tag),
  );
  const two = {
    renderer: {
      domElement: { getBoundingClientRect: () => ({ width: 100, height: 50 }) },
    },
  };
  return { ctx, canvas, two, images, calls };
}

describe("PNG and JPEG export", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const run = (
    env: ReturnType<typeof setup>,
    options: Record<string, unknown> = {},
  ) =>
    exportPathToImage({
      two: env.two as any,
      format: "png",
      ...options,
    } as any);

  it("sizes the canvas to the field, multiplied by the scale", async () => {
    const env = setup();
    await run(env, { scale: 2 });
    expect(env.canvas.width).toBe(200);
    expect(env.canvas.height).toBe(100);
  });

  it("adds the SVG namespace to the drawing so the browser will load it", async () => {
    const env = setup({ svgText: "<svg><g/></svg>" });
    await run(env);
    const svgImage = env.images.find((i) =>
      i.src.startsWith("data:image/svg"),
    )!;
    expect(decodeURIComponent(svgImage.src)).toContain(
      '<svg xmlns="http://www.w3.org/2000/svg">',
    );
  });

  it("leaves a namespace that is already there alone", async () => {
    const env = setup({
      svgText: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    });
    await run(env);
    const svgImage = env.images.find((i) =>
      i.src.startsWith("data:image/svg"),
    )!;
    expect(decodeURIComponent(svgImage.src).match(/xmlns=/g)).toHaveLength(1);
  });

  it("draws the field image at its bounds, scaled, under the drawing", async () => {
    const env = setup();
    await run(env, {
      scale: 2,
      backgroundImageSrc: "/field.webp",
      backgroundBounds: { x: 10, y: 5, width: 80, height: 40 },
    });
    const [first, second] = env.ctx.drawImage.mock.calls;
    expect(first.slice(1)).toEqual([20, 10, 160, 80]);
    // The drawing itself comes second, over the whole canvas.
    expect(second.slice(1)).toEqual([0, 0, 200, 100]);
  });

  it("stretches the field image over the whole canvas when no bounds are given", async () => {
    const env = setup();
    await run(env, { backgroundImageSrc: "/field.webp" });
    expect(env.ctx.drawImage.mock.calls[0].slice(1)).toEqual([0, 0, 100, 50]);
  });

  it("carries on without the field image if drawing it fails", async () => {
    const env = setup();
    env.ctx.drawImage.mockImplementationOnce(() => {
      throw new Error("tainted");
    });
    const blob = await run(env, { backgroundImageSrc: "/field.webp" });
    expect(blob.type).toBe("image/png");
    expect(console.warn).toHaveBeenCalled();
  });

  describe("the robot", () => {
    it("is drawn at its scaled position, turned to its heading", async () => {
      const env = setup();
      await run(env, {
        scale: 2,
        robotScreenState: { x: 10, y: 20, heading: 90 },
      });
      expect(env.ctx.translate).toHaveBeenCalledWith(20, 40);
      expect(env.ctx.rotate).toHaveBeenCalledWith(Math.PI / 2);
    });

    it("is drawn as a rounded box with a heading arrow when it has no image", async () => {
      const env = setup();
      await run(env, {
        scale: 2,
        robotLengthPx: 20,
        robotWidthPx: 10,
        robotScreenState: { x: 0, y: 0, heading: 0 },
      });
      expect(env.ctx.roundRect).toHaveBeenCalledWith(-20, -10, 40, 20, 16);
      expect(env.ctx.fill).toHaveBeenCalled();
      expect(env.ctx.lineTo).toHaveBeenCalled(); // the arrow
    });

    it("falls back to a plain rectangle where rounded ones aren't supported", async () => {
      const env = setup({ roundRect: false });
      await run(env, { robotScreenState: { x: 0, y: 0, heading: 0 } });
      expect(env.ctx.rect).toHaveBeenCalledWith(-8, -8, 16, 16);
    });

    it("is 16 by 16 by default", async () => {
      const env = setup();
      await run(env, { robotScreenState: { x: 0, y: 0, heading: 0 } });
      expect(env.ctx.roundRect).toHaveBeenCalledWith(-8, -8, 16, 16, 8);
    });

    it("uses the robot image at the requested size, centred", async () => {
      const env = setup();
      await run(env, {
        scale: 2,
        robotImageSrc: "/robot.png",
        robotLengthPx: 18,
        robotWidthPx: 12,
        robotScreenState: { x: 5, y: 5, heading: 0 },
      });
      const robotDraw = env.ctx.drawImage.mock.calls.at(-1)!;
      expect(robotDraw.slice(1)).toEqual([-18, -12, 36, 24]);
      expect(env.ctx.roundRect).not.toHaveBeenCalled();
    });

    it("uses the image's own size if none is given", async () => {
      const env = setup();
      await run(env, {
        robotImageSrc: "/robot.png",
        robotScreenState: { x: 0, y: 0, heading: 0 },
      });
      expect(env.ctx.drawImage.mock.calls.at(-1)!.slice(1)).toEqual([
        -15, -5, 30, 10,
      ]);
    });

    it("isn't drawn without a position, or with one that isn't a number", async () => {
      const env = setup();
      await run(env);
      await run(env, { robotScreenState: { x: Number.NaN, y: 1, heading: 0 } });
      await run(env, { robotScreenState: { x: 1, y: Number.NaN, heading: 0 } });
      expect(env.ctx.translate).not.toHaveBeenCalled();
    });

    it("doesn't stop the export if drawing it fails", async () => {
      const env = setup();
      env.ctx.translate.mockImplementation(() => {
        throw new Error("bad state");
      });
      const blob = await run(env, {
        robotScreenState: { x: 1, y: 1, heading: 0 },
      });
      expect(blob.type).toBe("image/png");
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe("failures", () => {
    it("rejects if the drawing can't be turned into an image", async () => {
      const env = setup({ failSvg: true });
      await expect(run(env)).rejects.toThrow(
        "Failed to rasterize SVG to image",
      );
    });

    it("rejects if the canvas can't produce a file", async () => {
      const env = setup();
      env.canvas.toBlob.mockImplementation((cb: (b: Blob | null) => void) =>
        cb(null),
      );
      await expect(run(env)).rejects.toThrow("Canvas export failed");
    });

    it("goes ahead without an image that fails to load", async () => {
      const env = setup();
      const blob = await run(env, {
        backgroundImageSrc: "error",
        robotImageSrc: "error",
      });
      expect(blob.type).toBe("image/png");
    });
  });

  it("only applies the quality setting to JPEG", async () => {
    const env = setup();
    await run(env, { format: "jpeg", quality: 0.4 });
    expect(env.canvas.toBlob).toHaveBeenLastCalledWith(
      expect.any(Function),
      "image/jpeg",
      0.4,
    );
    await run(env, { format: "png", quality: 0.4 });
    expect(env.canvas.toBlob).toHaveBeenLastCalledWith(
      expect.any(Function),
      "image/png",
      undefined,
    );
  });
});
