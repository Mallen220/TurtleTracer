// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Checks the SVG that exportPathToImage produces, using the real DOM parser and
// serializer rather than mocks.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { exportPathToImage } from "../utils/exportAnimation";

/** Images that load straight away, at a known size. */
function stubImages() {
  class FakeImage {
    width = 40;
    height = 20;
    crossOrigin = "";
    onload: () => void = () => {};
    onerror: () => void = () => {};
    set src(_value: string) {
      queueMicrotask(() => this.onload());
    }
  }
  vi.stubGlobal("Image", FakeImage);
}

const SVG_NS = "http://www.w3.org/2000/svg";

function fieldSvg() {
  const svg = document.createElementNS(SVG_NS, "svg");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("id", "path-line");
  svg.appendChild(path);
  svg.getBoundingClientRect = () => ({ width: 300, height: 300 }) as DOMRect;
  return svg;
}

async function exportSvg(options: Record<string, unknown> = {}) {
  const blob = await exportPathToImage({
    two: { renderer: { domElement: fieldSvg() } } as any,
    format: "svg",
    ...options,
  } as any);
  const text = await blob.text();
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  return { blob, text, root: doc.documentElement };
}

describe("SVG export", () => {
  beforeEach(() => {
    stubImages();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        blob: async () => new Blob(["x"], { type: "image/png" }),
      })),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("produces an SVG file that keeps the drawn path", async () => {
    const { blob, root } = await exportSvg();
    expect(blob.type).toBe("image/svg+xml;charset=utf-8");
    expect(root.nodeName).toBe("svg");
    expect(root.querySelector("#path-line")).not.toBeNull();
    expect(root.getAttribute("xmlns:xlink")).toBe(
      "http://www.w3.org/1999/xlink",
    );
  });

  it("puts the field image behind everything, at the given bounds", async () => {
    const { root } = await exportSvg({
      backgroundImageSrc: "/fields/field.webp",
      backgroundBounds: { x: 10, y: 20, width: 280, height: 260 },
    });
    const background = root.firstElementChild!;
    expect(background.nodeName).toBe("image");
    expect(background.getAttribute("href")).toMatch(/^data:/);
    expect(background.getAttribute("x")).toBe("10");
    expect(background.getAttribute("y")).toBe("20");
    expect(background.getAttribute("width")).toBe("280");
    expect(background.getAttribute("height")).toBe("260");
    expect(background.getAttribute("preserveAspectRatio")).toBe("none");
    expect(fetch).toHaveBeenCalledWith("/fields/field.webp");
  });

  it("embeds a background that is already a data URI without fetching it", async () => {
    const uri = "data:image/png;base64,AAAA";
    const { root } = await exportSvg({
      backgroundImageSrc: uri,
      backgroundBounds: { x: 0, y: 0, width: 1, height: 1 },
    });
    expect(root.firstElementChild!.getAttribute("href")).toBe(uri);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("leaves the background out, but still exports, if it can't be fetched", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const { root } = await exportSvg({
      backgroundImageSrc: "/fields/field.webp",
      backgroundBounds: { x: 0, y: 0, width: 1, height: 1 },
    });
    expect(root.querySelector("image")).toBeNull();
    expect(root.querySelector("#path-line")).not.toBeNull();
  });

  it("has no background without bounds to place it", async () => {
    const { root } = await exportSvg({
      backgroundImageSrc: "/fields/field.webp",
    });
    expect(root.querySelector("image")).toBeNull();
  });

  it("draws a robot image centred on the robot's position and turned to its heading", async () => {
    const { root } = await exportSvg({
      robotImageSrc: "/robot.png",
      robotScreenState: { x: 50, y: 60, heading: 30 },
      robotLengthPx: 16,
      robotWidthPx: 8,
    });
    const robot = root.lastElementChild!;
    expect(robot.nodeName).toBe("image");
    expect(robot.getAttribute("width")).toBe("16");
    expect(robot.getAttribute("height")).toBe("8");
    expect(robot.getAttribute("transform")).toBe(
      "translate(50, 60) rotate(30) translate(-8, -4)",
    );
  });

  it("uses the image's own size when no robot size is given", async () => {
    const { root } = await exportSvg({
      robotImageSrc: "/robot.png",
      robotScreenState: { x: 0, y: 0, heading: 0 },
    });
    const robot = root.lastElementChild!;
    expect(robot.getAttribute("width")).toBe("40");
    expect(robot.getAttribute("height")).toBe("20");
  });

  it.each([[undefined], ["none"], ["turtle"]])(
    "draws the built-in robot when the robot image is %s",
    async (robotImageSrc) => {
      const { root } = await exportSvg({
        robotImageSrc,
        robotScreenState: { x: 50, y: 60, heading: 30 },
        robotLengthPx: 20,
        robotWidthPx: 12,
      });
      const group = root.lastElementChild!;
      expect(group.nodeName).toBe("g");
      expect(group.getAttribute("transform")).toBe(
        "translate(50, 60) rotate(30)",
      );
      const box = group.querySelector("rect")!;
      expect(box.getAttribute("width")).toBe("20");
      expect(box.getAttribute("height")).toBe("12");
      expect(box.getAttribute("x")).toBe("-10");
      expect(box.getAttribute("y")).toBe("-6");
      expect(group.querySelector("path")).not.toBeNull(); // the heading arrow
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("draws the built-in robot at 16 by 16 when no size is given", async () => {
    const { root } = await exportSvg({
      robotScreenState: { x: 0, y: 0, heading: 0 },
    });
    const box = root.lastElementChild!.querySelector("rect")!;
    expect(box.getAttribute("width")).toBe("16");
    expect(box.getAttribute("height")).toBe("16");
  });

  it("draws no robot without a position for it", async () => {
    const { root } = await exportSvg({ robotImageSrc: "/robot.png" });
    expect(root.querySelector("image")).toBeNull();
    expect(root.querySelector("g")).toBeNull();
  });

  it("skips the robot image, but not the export, if it can't be fetched", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const { root } = await exportSvg({
      robotImageSrc: "/robot.png",
      robotScreenState: { x: 1, y: 1, heading: 0 },
    });
    expect(root.querySelector("image")).toBeNull();
    expect(root.querySelector("#path-line")).not.toBeNull();
  });
});
