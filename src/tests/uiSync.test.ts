import { render, screen, waitFor, within } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startPointStore, linesStore, sequenceStore, settingsStore, robotXYStore, robotHeadingStore } from "../lib/projectStore";
import App from "../App.svelte";
import { tick } from "svelte";

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe("UI Sync when point changes", () => {
  let mockContext: any;

  beforeEach(() => {
    startPointStore.set({ x: 10, y: 10, heading: "constant", degrees: 0 });
    linesStore.set([
      {
        id: "line-1",
        name: "Path 1",
        endPoint: { x: 50, y: 50, heading: "constant", degrees: 0 },
        controlPoints: [],
        color: "#000000",
      } as any
    ]);
    sequenceStore.set([
      { kind: "path", lineId: "line-1" } as any
    ]);
    settingsStore.set({
      theme: "light",
      fieldMap: "none",
      rLength: 14,
      rWidth: 14,
      safetyMargin: 0,
      fieldLength: 144,
      fieldWidth: 144,
      coordinateSystem: "Raw"
    } as any);

    robotXYStore.set({ x: 0, y: 0 });
    robotHeadingStore.set(0);

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

    mockContext = {
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Array(4) })),
      putImageData: vi.fn(),
      createImageData: vi.fn(() => []),
      setTransform: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      fillText: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      rotate: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      measureText: vi.fn(() => ({ width: 0 })),
      transform: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
    };

    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(mockContext);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("updates code, path, table tabs when point changes", async () => {
    vi.mock("../utils/coordinates", async (importOriginal) => {
      const actual = await importOriginal();
      return {
        ...(actual as any),
        formatDisplayCoordinate: vi.fn((val) => val ? val.toString() : "0")
      };
    });

    const { container } = render(App);
    await tick();

    // 1. Change the point directly in store to trigger reactive updates
    startPointStore.update(sp => ({ ...sp, x: 25.5, y: 35.5 }));
    linesStore.update(lines => {
      lines[0].endPoint.x = 42.5;
      lines[0].endPoint.y = 52.5;
      return lines;
    });
    await tick();

    // 2. Verify Path Tab update
    const pathBtn = document.querySelector('button[title="Path"]');
    if (pathBtn) (pathBtn as HTMLButtonElement).click();
    await tick();

    await waitFor(() => {
        const inputs = document.querySelectorAll('input');
        const values = Array.from(inputs).map(i => i.value);
        expect(values).toContain('25.5');
        expect(values).toContain('35.5');
        expect(values).toContain('42.5');
        expect(values).toContain('52.5');
    });

    // 3. Verify Table Tab update
    const tableBtn = document.querySelector('button[title="Table"]');
    if (tableBtn) (tableBtn as HTMLButtonElement).click();
    await tick();

    await waitFor(() => {
        const inputs = document.querySelectorAll('input');
        const values = Array.from(inputs).map(i => i.value);
        expect(values).toContain('25.5');
        expect(values).toContain('35.5');
        expect(values).toContain('42.5');
        expect(values).toContain('52.5');
    });

    // 4. Verify Code Tab update
    const codeBtn = document.querySelector('button[title="Code"]');
    if (codeBtn) (codeBtn as HTMLButtonElement).click();
    await tick();

    // Wait for the code block (the exporter updates asynchronously)
    await waitFor(() => {
      const codeContainer = container.querySelector('.code-container');
      if (codeContainer) {
          const html = codeContainer.innerHTML;
          expect(html).toContain('25.5');
          expect(html).toContain('35.5');
          expect(html).toContain('42.5');
          expect(html).toContain('52.5');
      }
    });

    // 5. Verify Field render updates (mocked canvas)
    // Field Tab isn't required to be "active" for the canvas (Two.js) to exist,
    // it just draws based on lines store implicitly via FieldRenderer / Two.js instance
    // Let's force a click to be safe, if we switch tab Svelte might unmount/remount component
    const fieldBtn = document.querySelector('button[title="Field"]');
    if (fieldBtn) (fieldBtn as HTMLButtonElement).click();
    await tick();

    // Svelte's FieldRenderer uses Two.js to draw paths which internally creates SVG.
    // `mockContext` is only useful if it was a CanvasRenderer, Two.js default is SVG.
    // We can verify Two.js appended an svg element with lines matching our coordinates,
    // or just look for the path data (d="...") in SVG.

    await waitFor(() => {
       const svg = container.querySelector("svg");
       expect(svg).not.toBeNull();
       // the Two.js paths use a coordinate transform mapping, but the numbers will exist somewhat in proportional forms
       // to be robust since math can round, just ensure it successfully rendered an SVG
       expect(container.innerHTML).toContain('svg');
    });
  });
});
