// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { render, screen, waitFor, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { get } from "svelte/store";
import StrategySheetPreview from "../lib/components/dialogs/StrategySheetPreview.svelte";
import { currentFilePath } from "../stores";
import { extraDataStore } from "../lib/projectStore";
import { DEFAULT_SETTINGS } from "../config/defaults";
import type { Line, Point, SequenceItem, Settings } from "../types";

const start: Point = {
  x: 10,
  y: 20,
  heading: "tangential",
  reverse: false,
} as Point;

const SVG_NS = "http://www.w3.org/2000/svg";
function svgWith(children: number, attrs: Record<string, string> = {}) {
  const svg = document.createElementNS(SVG_NS, "svg");
  for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
  for (let i = 0; i < children; i++)
    svg.appendChild(document.createElementNS(SVG_NS, "path"));
  return svg;
}

function mount(
  twoInstance: unknown,
  settings: Partial<Settings> = {},
  extra: Record<string, unknown> = {},
) {
  return render(StrategySheetPreview, {
    isOpen: true,
    startPoint: start,
    lines: [],
    sequence: [],
    settings: {
      ...DEFAULT_SETTINGS,
      fieldMap: "decode.webp",
      ...settings,
    } as Settings,
    timePrediction: { totalTime: 0, totalDistance: 0 },
    twoInstance,
    ...extra,
  } as any);
}

/** The field preview element. */
const field = () =>
  document.querySelector("#strategy-sheet-preview-field") as HTMLElement;
const inField = (selector: string) =>
  field().querySelector(selector) as HTMLElement | null;
const decoded = (img: HTMLElement) =>
  decodeURIComponent((img as HTMLImageElement).src);

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "debug").mockImplementation(() => {});
  currentFilePath.set(null);
  extraDataStore.set({});
});
afterEach(() => vi.restoreAllMocks());

describe("the field picture", () => {
  it("explains when there is nothing to draw the field from", async () => {
    mount({ renderer: {} });
    await waitFor(() =>
      expect(field().textContent).toContain("No renderer element available"),
    );
    mount(null);
    expect(
      screen.getAllByText(/No renderer element available/).length,
    ).toBeGreaterThan(0);
  });

  it("draws the field as a background with the path drawing over it", async () => {
    mount({
      renderer: { domElement: svgWith(3, { width: "400", height: "400" }) },
    });
    await waitFor(() =>
      expect(inField('img[alt="Field overlay"]')).not.toBeNull(),
    );

    const background = inField('img[alt="Field"]')!;
    expect(background).toHaveAttribute("src", "/fields/decode.webp");
    const overlay = inField('img[alt="Field overlay"]')!;
    expect(overlay.getAttribute("src")).toMatch(
      /^data:image\/svg\+xml;charset=utf-8,/,
    );
    expect(decoded(overlay)).toContain("<path");
    // The field is underneath the drawing.
    expect(Number(background.style.zIndex)).toBeLessThan(
      Number(overlay.style.zIndex),
    );
  });

  it("uses the default field for a built-in field name that doesn't exist or is 'custom'", async () => {
    mount(
      { renderer: { domElement: svgWith(1) } },
      { fieldMap: "custom-thing.webp" },
    );
    await waitFor(() => expect(inField('img[alt="Field"]')).not.toBeNull());
    expect(inField('img[alt="Field"]')!.getAttribute("src")).toMatch(
      /^\/fields\/.+\.webp$/,
    );
    expect(inField('img[alt="Field"]')!.getAttribute("src")).not.toContain(
      "custom",
    );
  });

  it("uses a custom map's own image", async () => {
    mount(
      { renderer: { domElement: svgWith(1) } },
      {
        fieldMap: "mine",
        customMaps: [
          { id: "mine", imageData: "data:image/png;base64,AAAA" } as any,
        ],
      },
    );
    await waitFor(() => expect(inField('img[alt="Field"]')).not.toBeNull());
    expect(inField('img[alt="Field"]')).toHaveAttribute(
      "src",
      "data:image/png;base64,AAAA",
    );
  });

  it("finds the drawing inside a wrapper element", async () => {
    const wrapper = document.createElement("div");
    wrapper.appendChild(svgWith(2, { viewBox: "0 0 100 100" }));
    mount({ renderer: { domElement: wrapper } });
    await waitFor(() =>
      expect(inField('img[alt="Field overlay"]')).not.toBeNull(),
    );
    expect(decoded(inField('img[alt="Field overlay"]')!)).toContain("<path");
  });

  it("says so when the wrapper has no drawing in it", async () => {
    mount({ renderer: { domElement: document.createElement("div") } });
    await waitFor(() =>
      expect(field().textContent).toContain("No SVG element found to render"),
    );
  });

  it("copes with a renderer that has no DOM methods", async () => {
    mount({ renderer: { domElement: {} } });
    await waitFor(() =>
      expect(field().textContent).toContain("No SVG element found to render"),
    );
  });

  describe("canvas renderers", () => {
    const canvas = (toDataURL: () => string) => {
      const el = document.createElement("canvas");
      el.toDataURL = toDataURL as any;
      return el;
    };

    it("shows a picture of the canvas", async () => {
      mount({
        renderer: { domElement: canvas(() => "data:image/png;base64,CANVAS") },
      });
      await waitFor(() => expect(inField("img")).not.toBeNull());
      expect(inField("img")).toHaveAttribute(
        "src",
        "data:image/png;base64,CANVAS",
      );
    });

    it("says so when the canvas can't be read", async () => {
      mount({
        renderer: {
          domElement: canvas(() => {
            throw new Error("tainted canvas");
          }),
        },
      });
      await waitFor(() =>
        expect(field().textContent).toContain("No SVG element found to render"),
      );
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe("a drawing with nothing in it and no field image", () => {
    it("is still shown, on its own, as an image that fills the space", async () => {
      // With a field image there is always something to draw; without one the
      // empty drawing takes the fallback route.
      mount(
        {
          renderer: { domElement: svgWith(0, { width: "300", height: "300" }) },
        },
        { fieldMap: "mine", customMaps: [{ id: "mine" } as any] },
      );
      await waitFor(() =>
        expect(inField('img[alt="Field overlay"]')).not.toBeNull(),
      );
      expect(inField('img[alt="Field"]')).toBeNull();
      expect(inField('img[alt="Field overlay"]')!.style.width).toBe("100%");
    });
  });
});

describe("the sheet's text", () => {
  const lines: Line[] = [
    {
      id: "a",
      name: "",
      endPoint: {
        x: 30.25,
        y: 40.75,
        heading: "tangential",
        reverse: false,
      } as Point,
      controlPoints: [],
      color: "#f00",
      eventMarkers: [{ id: "e", name: "Grab", position: 0.25 } as any],
    },
    {
      id: "b",
      name: "Named",
      endPoint: { x: 1, y: 2, heading: "tangential", reverse: false } as Point,
      controlPoints: [],
      color: "#0f0",
    },
  ];
  const sequence: SequenceItem[] = [
    { kind: "path", lineId: "a" },
    { kind: "wait", id: "w", name: "", durationMs: 1500 },
    {
      kind: "rotate",
      id: "r",
      name: "",
      degrees: 45,
      eventMarkers: [{ id: "e2", name: "Spin up", position: 0.5 } as any],
    },
    { kind: "path", lineId: "missing" },
    { kind: "macro", id: "m", name: "Park macro", filePath: "/p.turt" },
    { kind: "path", lineId: "b" },
  ] as SequenceItem[];

  it("names unnamed steps, lists events with where they fire, and skips paths that don't exist", () => {
    mount({ renderer: { domElement: svgWith(1) } }, {}, { lines, sequence });
    const rows = [...document.querySelectorAll("tbody tr")].map((r) =>
      [...r.querySelectorAll("td")].map((c) => c.textContent!.trim()),
    );
    expect(rows.map((r) => r[1])).toEqual([
      "Start",
      "Path 1",
      "Wait",
      "Rotate",
      "Park macro",
      "Named",
    ]);
    expect(rows[1][2]).toBe("-> (30.3, 40.8)");
    expect(rows[1][3]).toBe("Grab @ 25%");
    expect(rows[2][2]).toBe("1500ms");
    expect(rows[3][2]).toBe("45°");
    expect(rows[3][3]).toBe("Spin up @ 50%");
    expect(rows[4][2]).toBe("Macro");
    expect(rows.map((r) => r[0])).toEqual(["0", "1", "2", "3", "4", "5"]);
  });

  it("shows Untitled Project until the project has a file, then its name without the extension", async () => {
    mount({ renderer: { domElement: svgWith(1) } });
    expect(screen.getByText("Untitled Project")).toBeInTheDocument();
    currentFilePath.set(String.raw`C:\Teams\Red Auto.turt`);
    await waitFor(() =>
      expect(screen.getByText("Red Auto")).toBeInTheDocument(),
    );
    currentFilePath.set("/p/legacy.PP");
    await waitFor(() => expect(screen.getByText("legacy")).toBeInTheDocument());
  });

  it("shows totals with sensible defaults when there is no time prediction", () => {
    mount(
      { renderer: { domElement: svgWith(1) } },
      {},
      { timePrediction: null },
    );
    expect(document.body.textContent).toContain("0.000s");
  });

  it("saves strategy notes to the project", async () => {
    mount({ renderer: { domElement: svgWith(1) } });
    const notes = screen.getByPlaceholderText(
      "Type your strategy notes here...",
    ) as HTMLTextAreaElement;
    await fireEvent.input(notes, { target: { value: "Go left first" } });
    expect(get(extraDataStore).strategyNotes).toBe("Go left first");
  });
});
