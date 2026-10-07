// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tick } from "svelte";
import { get } from "svelte/store";
import WaypointTableWrapper from "./WaypointTableWrapper.svelte";
import WaypointTableStoreWrapper from "./WaypointTableStoreWrapper.svelte";
import { registerCoreUI } from "../lib/coreRegistrations";
import { actionRegistry } from "../lib/actionRegistry";
import { DEFAULT_SETTINGS } from "../config/defaults";
import { notification } from "../stores";
import { toUser, toField } from "../utils/coordinates";
import type { Line, Point, SequenceItem, Settings } from "../types";

vi.mock("../lib/projectStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/projectStore")>()),
  loadMacro: vi.fn(),
}));

const startPoint: Point = { x: 0, y: 0, heading: "tangential", reverse: false };
const line = (
  id: string,
  x: number,
  y: number,
  extra: Partial<Line> = {},
): Line => ({
  id,
  name: "",
  endPoint: { x, y, heading: "tangential", reverse: false },
  controlPoints: [],
  color: "#f00",
  ...extra,
});
const pathStep = (lineId: string): SequenceItem => ({ kind: "path", lineId });

function setup(
  lines: Line[],
  sequence: SequenceItem[],
  options: { settings?: Partial<Settings>; start?: Point } = {},
) {
  const project = {
    startPoint: options.start ?? { ...startPoint },
    lines,
    sequence,
  };
  const recordChange = vi.fn();
  const { container } = render(WaypointTableWrapper, {
    project,
    recordChange,
    settings: { ...DEFAULT_SETTINGS, ...options.settings } as Settings,
  });
  return { project, recordChange, container };
}

const input = (label: string) =>
  screen.getByLabelText(label) as HTMLInputElement;
const edit = async (label: string, value: string) => {
  await fireEvent.change(input(label), { target: { value } });
  await tick();
};

beforeEach(() => {
  document.body.innerHTML = "";
  actionRegistry.reset();
  registerCoreUI();
  notification.set(null);
});

describe("editing coordinates", () => {
  it("moves a path's end point when its X or Y is changed", async () => {
    const t = setup([line("a", 10, 20)], [pathStep("a")]);
    await edit("Path 1 X", "33.5");
    await edit("Path 1 Y", "44");
    expect(t.project.lines[0].endPoint).toMatchObject({ x: 33.5, y: 44 });
    expect(t.recordChange).toHaveBeenCalledTimes(2);
  });

  it("ignores something that isn't a number", async () => {
    const t = setup([line("a", 10, 20)], [pathStep("a")]);
    await edit("Path 1 X", "");
    expect(t.project.lines[0].endPoint).toMatchObject({ x: 10, y: 20 });
    expect(t.recordChange).not.toHaveBeenCalled();
  });

  it("names the inputs after the path, or by position if it has no name", () => {
    setup(
      [line("a", 1, 1, { name: "Score" }), line("b", 2, 2)],
      [pathStep("a"), pathStep("b")],
    );
    expect(input("Score X")).toBeInTheDocument();
    expect(input("Path 2 Y")).toBeInTheDocument();
  });

  it("edits the start point", async () => {
    const t = setup([line("a", 10, 20)], [pathStep("a")]);
    await edit("Start Point X", "7");
    await edit("Start Point Y", "9");
    expect(t.project.startPoint).toMatchObject({ x: 7, y: 9 });
  });

  it("shows and accepts centimetres when the units are metric", async () => {
    const t = setup([line("a", 10, 20)], [pathStep("a")], {
      settings: { visualizerUnits: "metric" },
    });
    expect(Number(input("Path 1 X").value)).toBeCloseTo(25.4, 1);
    await edit("Path 1 X", "50.8");
    expect(t.project.lines[0].endPoint.x).toBeCloseTo(20);
    expect(t.project.lines[0].endPoint.y).toBeCloseTo(20); // Y untouched
  });

  it("works in the user's coordinate system and stores field coordinates", async () => {
    const fieldPoint = { x: 30, y: 40 };
    const t = setup([line("a", fieldPoint.x, fieldPoint.y)], [pathStep("a")], {
      settings: { coordinateSystem: "FTC" },
    });
    const shown = toUser({ ...startPoint, ...fieldPoint } as Point, "FTC");
    expect(Number(input("Path 1 X").value)).toBeCloseTo(shown.x, 1);
    expect(Number(input("Path 1 Y").value)).toBeCloseTo(shown.y, 1);

    // Retyping what is already shown must not move the point.
    await edit("Path 1 X", String(shown.x));
    expect(t.project.lines[0].endPoint.x).toBeCloseTo(fieldPoint.x);
    expect(t.project.lines[0].endPoint.y).toBeCloseTo(fieldPoint.y);

    await edit("Path 1 X", String(shown.x + 5));
    const expected = toField({ ...shown, x: shown.x + 5 } as Point, "FTC");
    expect(t.project.lines[0].endPoint.x).toBeCloseTo(expected.x);
    expect(t.project.lines[0].endPoint.y).toBeCloseTo(expected.y);
  });
});

describe("locking and hiding", () => {
  it("locking a path disables its coordinates, and unlocking brings them back", async () => {
    const t = setup([line("a", 10, 20)], [pathStep("a")]);
    await fireEvent.click(screen.getByLabelText("Lock Path"));
    await waitFor(() => expect(input("Path 1 X")).toBeDisabled());
    expect(input("Path 1 Y")).toBeDisabled();
    expect(t.project.lines[0].locked).toBe(true);

    await fireEvent.click(screen.getByLabelText("Unlock Path"));
    await waitFor(() => expect(input("Path 1 X")).not.toBeDisabled());
    expect(t.project.lines[0].locked).toBe(false);
  });

  it("hides and shows a path", async () => {
    const t = setup([line("a", 10, 20)], [pathStep("a")]);
    await fireEvent.click(screen.getByLabelText("Hide Path"));
    await waitFor(() =>
      expect(screen.getByLabelText("Show Path")).toBeInTheDocument(),
    );
    expect(t.project.lines[0].hidden).toBe(true);
    await fireEvent.click(screen.getByLabelText("Show Path"));
    await waitFor(() =>
      expect(screen.getByLabelText("Hide Path")).toBeInTheDocument(),
    );
    expect(t.project.lines[0].hidden).toBe(false);
    expect(t.recordChange).toHaveBeenCalledTimes(2);
  });

  it("a locked start point can't be edited", async () => {
    const t = setup([line("a", 10, 20)], [pathStep("a")], {
      start: { ...startPoint, locked: true },
    });
    expect(input("Start Point X")).toBeDisabled();
    expect(input("Start Point Y")).toBeDisabled();
    expect(screen.getByTitle("Locked")).toBeInTheDocument();
    expect(t.project.startPoint.locked).toBe(true);
  });
});

describe("chaining", () => {
  it("links a path to the one before it, and unlinks it again", async () => {
    const t = setup(
      [line("a", 10, 0), line("b", 20, 0)],
      [pathStep("a"), pathStep("b")],
    );
    const link = screen.getByLabelText("Toggle Path Chain");
    expect(link).toHaveAttribute("title", "Chain paths together");

    await fireEvent.click(link);
    await waitFor(() =>
      expect(screen.getByLabelText("Toggle Path Chain")).toHaveAttribute(
        "title",
        "Unchain paths",
      ),
    );
    expect((t.project.sequence[1] as any).isChain).toBe(true);
    expect(t.project.lines[1].isChain).toBe(true);

    await fireEvent.click(screen.getByLabelText("Toggle Path Chain"));
    await waitFor(() =>
      expect(screen.getByLabelText("Toggle Path Chain")).toHaveAttribute(
        "title",
        "Chain paths together",
      ),
    );
    expect(t.project.lines[1].isChain).toBe(false);
  });

  it("offers no link for the first path, or after something that isn't a path", () => {
    setup(
      [line("a", 10, 0), line("b", 20, 0)],
      [
        pathStep("a"),
        { kind: "wait", id: "w", name: "Wait", durationMs: 1 } as SequenceItem,
        pathStep("b"),
      ],
    );
    expect(screen.queryByLabelText("Toggle Path Chain")).toBeNull();
  });
});

describe("adding steps", () => {
  it("adds a path at the end", async () => {
    const t = setup([line("a", 10, 0)], [pathStep("a")]);
    await fireEvent.click(screen.getByLabelText("Add new path segment"));
    await waitFor(() => expect(t.project.lines).toHaveLength(2));
    expect(t.project.sequence.map((s) => s.kind)).toEqual(["path", "path"]);
  });

  it("adds a wait and a rotation", async () => {
    const t = setup([line("a", 10, 0)], [pathStep("a")]);
    await fireEvent.click(screen.getByLabelText("Add Wait command"));
    await fireEvent.click(screen.getByLabelText("Add Rotate command"));
    await waitFor(() =>
      expect(t.project.sequence.map((s) => s.kind)).toEqual([
        "path",
        "wait",
        "rotate",
      ]),
    );
    expect(t.recordChange).toHaveBeenCalledTimes(2);
  });

  it("shows a path that is missing from the sequence rather than hiding it", () => {
    setup([line("a", 10, 0), line("b", 20, 0)], [pathStep("a")]);
    expect(input("Path 2 X")).toBeInTheDocument();
  });
});

describe("copying the table", () => {
  let writeText: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  });
  afterEach(() => vi.useRealTimers());

  const project = () =>
    setup(
      [
        line("a", 10, 20, {
          name: "Score",
          controlPoints: [{ x: 3, y: 4 } as any],
          waitBeforeMs: 250,
        }),
        line("b", 30, 40),
      ],
      [
        pathStep("a"),
        { kind: "wait", id: "w", name: "", durationMs: 500 } as SequenceItem,
        { kind: "rotate", id: "r", name: "Face goal", degrees: 45 },
        pathStep("b"),
      ],
    );

  it("copies a markdown table of the whole sequence", async () => {
    project();
    await fireEvent.click(screen.getByLabelText("Copy Table"));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect((writeText.mock.calls[0][0] as string).split("\n")).toEqual([
      "| Name | X (in) / Dur (ms) | Y (in) / Deg |",
      "| :--- | :--- | :--- |",
      "| Start Point | 0 | 0 |",
      "| Score | 10 (250) | 20 |",
      "| ↳ Control 1 | 3 | 4 |",
      "| Wait | 500 | - |",
      "| Face goal | - | 45 |",
      "| Path 2 | 30 | 40 |",
    ]);
  });

  it("confirms the copy, then goes back to its normal label", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    project();
    await fireEvent.click(screen.getByLabelText("Copy Table"));
    await waitFor(() =>
      expect(screen.getByLabelText("Copied!")).toBeInTheDocument(),
    );
    expect(get(notification)).toMatchObject({
      message: "Table copied to clipboard!",
      type: "success",
    });

    await vi.advanceTimersByTimeAsync(2100);
    await waitFor(() =>
      expect(screen.getByLabelText("Copy Table")).toBeInTheDocument(),
    );
  });

  it("reports when the clipboard can't be used", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    writeText.mockRejectedValue(new Error("denied"));
    project();
    await fireEvent.click(screen.getByLabelText("Copy Table"));
    await waitFor(() =>
      expect(get(notification)).toMatchObject({
        message: "Failed to copy table.",
        type: "error",
      }),
    );
    expect(screen.getByLabelText("Copy Table")).toBeInTheDocument();
  });
});

describe("deleting control points in the table", () => {
  const withControlPoints = (extra: Partial<Line> = {}) =>
    line("a", 40, 40, {
      controlPoints: [
        { x: 10, y: 10 },
        { x: 20, y: 30 },
        { x: 30, y: 20 },
      ],
      ...extra,
    });
  const rows = () => screen.queryAllByText(/↳ Control \d/);

  it("takes the row out of the table straight away", async () => {
    const { project, recordChange } = setup(
      [withControlPoints()],
      [pathStep("a")],
    );
    expect(rows()).toHaveLength(3);

    await fireEvent.click(screen.getAllByLabelText("Delete control point")[1]);
    await tick();

    expect(rows()).toHaveLength(2);
    expect(project.lines[0].controlPoints).toEqual([
      { x: 10, y: 10 },
      { x: 30, y: 20 },
    ]);
    expect(recordChange).toHaveBeenCalled();
  });

  it("can keep deleting until none are left", async () => {
    const { project } = setup([withControlPoints()], [pathStep("a")]);
    for (let left = 3; left > 0; left--) {
      expect(rows()).toHaveLength(left);
      await fireEvent.click(
        screen.getAllByLabelText("Delete control point")[0],
      );
      await tick();
    }
    expect(rows()).toHaveLength(0);
    expect(project.lines[0].controlPoints).toEqual([]);
  });

  it("leaves other paths' control points alone", async () => {
    const other = line("b", 90, 90, { controlPoints: [{ x: 60, y: 60 }] });
    const { project } = setup(
      [withControlPoints(), other],
      [pathStep("a"), pathStep("b")],
    );
    await fireEvent.click(screen.getAllByLabelText("Delete control point")[0]);
    await tick();
    expect(rows()).toHaveLength(3);
    expect(project.lines[1].controlPoints).toHaveLength(1);
  });

  it("can't delete from a locked path", () => {
    setup([withControlPoints({ locked: true })], [pathStep("a")]);
    expect(screen.queryAllByLabelText("Delete control point")).toHaveLength(0);
    expect(rows()).toHaveLength(3);
  });
});

describe("deleting control points when lines live in a store, as in the app", () => {
  it("takes the row out of the table straight away", async () => {
    const lines = [
      line("a", 40, 40, {
        controlPoints: [
          { x: 10, y: 10 },
          { x: 20, y: 30 },
        ],
      }),
    ];
    const recordChange = vi.fn();
    const view = render(WaypointTableStoreWrapper, {
      startPoint: { ...startPoint },
      lines,
      sequence: [pathStep("a")],
      recordChange,
    });
    const rows = () => screen.queryAllByText(/↳ Control \d/);
    expect(rows()).toHaveLength(2);

    await fireEvent.click(screen.getAllByLabelText("Delete control point")[0]);
    await tick();

    expect(rows()).toHaveLength(1);
    expect((view.component as any).currentLines()[0].controlPoints).toEqual([
      { x: 20, y: 30 },
    ]);
    expect(recordChange).toHaveBeenCalled();
  });
});
