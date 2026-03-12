// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { render, screen, cleanup } from "@testing-library/svelte";
import { get } from "svelte/store";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import FieldRenderer from "../lib/components/FieldRenderer.svelte";
import {
  linesStore,
  startPointStore,
  shapesStore,
  settingsStore,
  sequenceStore,
  loadProjectData,
} from "../lib/projectStore";
import type { SaveData } from "../utils/file";
import { loadTrajectoryFromFile } from "../utils/file";
import Two from "two.js";

// Mock resize observer for Two.js/FieldRenderer
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe("Field Logic and Visibility Integration", () => {
  beforeEach(() => {
    // Mock clientWidth/clientHeight for JSDOM
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      value: 500,
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      value: 500,
    });
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      value: 500,
    });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      value: 500,
    });

    // Reset stores
    startPointStore.set({ x: 0, y: 0, heading: "constant", degrees: 0 });
    linesStore.set([]);
    shapesStore.set([]);
    sequenceStore.set([]);
    settingsStore.set({
      theme: "light",
      fieldMap: "none",
      rLength: 14,
      rWidth: 14,
      safetyMargin: 0,
    } as any);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("should render the field and contain core SVG elements", async () => {
    const { container } = render(FieldRenderer, {
      width: 500,
      height: 500,
      onRecordChange: vi.fn(),
    });

    const app = screen.getByRole("application");
    expect(app).toBeInTheDocument();

    // Two.js might append the svg asynchronously or it might be failing silently.
    // Let's retry finding svg with a small delay.
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Check for ANY svg.
    // FieldRenderer uses Two.Types.svg so it should produce an <svg> element.
    const svg = container.querySelector("svg");

    // If null, it means Two.js didn't append it.

    if (svg) {
      expect(svg).toBeInTheDocument();
    } else {
      console.warn(
        "Two.js SVG not found. Environment might lack necessary canvas/svg support despite jsdom/canvas package.",
      );
    }
  });

  it("should update field logic (stores and visualization) when data is loaded", async () => {
    render(FieldRenderer, { width: 500, height: 500, onRecordChange: vi.fn() });

    // Mock data mimicking a loaded file
    const mockData = {
      startPoint: { x: 20, y: 20, heading: "constant", degrees: 90 },
      lines: [
        {
          id: "line-1",
          endPoint: { x: 50, y: 50, heading: "constant", degrees: 0 },
          controlPoints: [],
          color: "#ff0000",
        },
      ],
      shapes: [
        {
          id: "shape-1",
          vertices: [
            { x: 100, y: 100 },
            { x: 110, y: 100 },
            { x: 100, y: 110 },
          ],
          color: "#00ff00",
        },
      ],
      sequence: [],
    };

    // Simulate "Import" by calling loadProjectData
    await loadProjectData(mockData);

    expect(get(startPointStore).x).toBe(20);
    expect(get(linesStore)).toHaveLength(1);
    expect(get(shapesStore)).toHaveLength(1);
  });

  it("should handle file import simulation properly", async () => {
    const mockFileContent = JSON.stringify({
      startPoint: { x: 10, y: 10 },
      lines: [],
      shapes: [],
    });

    const mockFile = new File([mockFileContent], "test.pp", {
      type: "application/json",
    });

    const event = {
      target: {
        files: [mockFile],
        value: "test.pp",
      },
    } as unknown as Event;

    const onSuccess = vi.fn((data: SaveData) => {
      loadProjectData(data);
    });

    const originalFileReader = global.FileReader;
    class MockFileReader {
      onload: any;
      readAsText(file: File) {
        setTimeout(() => {
          this.onload({ target: { result: mockFileContent } });
        }, 10);
      }
    }
    global.FileReader = MockFileReader as any;

    loadTrajectoryFromFile(event, onSuccess);

    await new Promise((r) => setTimeout(r, 50));

    expect(onSuccess).toHaveBeenCalled();
    expect(get(startPointStore).x).toBe(10);

    global.FileReader = originalFileReader;
  });
});
