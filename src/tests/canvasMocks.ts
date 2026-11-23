// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { vi } from "vitest";

export function setupCanvasMocks() {
  const mockCtx = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    rect: vi.fn(),
    scale: vi.fn(),
    roundRect: vi.fn(),
    getImageData: vi.fn().mockReturnValue({
      data: new Uint8Array(100 * 100 * 4),
      width: 100,
      height: 100,
    }),
  };

  const mockCanvas = {
    width: 100,
    height: 100,
    getContext: vi.fn().mockReturnValue(mockCtx),
    toDataURL: vi.fn().mockReturnValue("data:image/png;base64,dummy"),
    toBlob: vi.fn((cb, type, _quality) => {
      cb(new Blob(["canvas-data"], { type }));
    }),
  };

  const originalCreateElement = document.createElement.bind(document);
  const createElementSpy = vi
    .spyOn(document, "createElement")
    .mockImplementation((tag: any) => {
      if (tag === "canvas") return mockCanvas as any;
      return originalCreateElement(tag);
    });

  // A real SVG element (with an obstacle group), so it can be cloned.
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const shapeGroup = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "g",
  );
  shapeGroup.id = "shape-group";
  svg.appendChild(shapeGroup);
  const cornerHandle = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "g",
  );
  cornerHandle.id = "obstacle-0-1"; // an obstacle's numbered corner
  svg.appendChild(cornerHandle);
  svg.getBoundingClientRect = vi.fn().mockReturnValue({
    width: 100,
    height: 100,
  });

  const mockTwo = {
    update: vi.fn(),
    renderer: { domElement: svg },
  };

  return { mockCtx, mockCanvas, mockTwo, createElementSpy };
}
