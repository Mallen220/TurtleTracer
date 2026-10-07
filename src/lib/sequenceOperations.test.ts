// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "svelte/store";
import type { Line, SequenceItem, SequenceMacroItem } from "../types";
import {
  isSequenceItemLocked,
  lineOrderForSequence,
  moveSequenceItem,
  unlinkMacro,
  insertMacro,
  toggleChain,
  duplicateStep,
} from "./sequenceOperations";
import { macrosStore } from "./projectStore";
import { currentFilePath, notification } from "../stores";

vi.mock("./projectStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./projectStore")>()),
  loadMacro: vi.fn(),
}));

const line = (id: string, extra: Partial<Line> = {}): Line => ({
  id,
  endPoint: { x: 0, y: 0, heading: "tangential", reverse: false },
  controlPoints: [],
  color: "red",
  ...extra,
});
const path = (lineId: string): SequenceItem => ({ kind: "path", lineId });
const wait = (id: string, locked = false): SequenceItem => ({
  kind: "wait",
  id,
  name: "",
  durationMs: 100,
  locked,
});

describe("isSequenceItemLocked", () => {
  it("uses the line's lock for paths and the item's own lock otherwise", () => {
    const lines = [line("a", { locked: true }), line("b")];
    expect(isSequenceItemLocked(path("a"), lines)).toBe(true);
    expect(isSequenceItemLocked(path("b"), lines)).toBe(false);
    expect(isSequenceItemLocked(wait("w", true), lines)).toBe(true);
    expect(isSequenceItemLocked(undefined, lines)).toBe(false);
  });
});

describe("lineOrderForSequence", () => {
  it("follows the sequence and keeps unused lines at the end", () => {
    const lines = [line("a"), line("b"), line("c")];
    const order = lineOrderForSequence(lines, [
      path("c"),
      wait("w"),
      path("a"),
    ]);
    expect(order).toEqual([2, 0, 1]);
  });
});

describe("moveSequenceItem", () => {
  const lines = [line("a"), line("b", { locked: true })];

  it("swaps an item with its neighbour", () => {
    const seq = [wait("w"), path("a")];
    expect(moveSequenceItem(seq, lines, 0, 1)).toEqual([path("a"), wait("w")]);
  });

  it("refuses to move past either end or across a locked item", () => {
    const seq = [path("a"), path("b")];
    expect(moveSequenceItem(seq, lines, 0, -1)).toBeNull();
    expect(moveSequenceItem(seq, lines, 0, 1)).toBeNull();
  });
});

describe("unlinkMacro", () => {
  it("replaces the macro with its steps and frees its lines", () => {
    const macro: SequenceMacroItem = {
      kind: "macro",
      id: "m",
      name: "M",
      filePath: "/m.turt",
      sequence: [path("x")],
    };
    const lines = [
      line("x", { macroId: "m", isMacroElement: true, locked: true }),
    ];
    const result = unlinkMacro(lines, [wait("w"), macro], macro, 1);

    expect(result.sequence).toEqual([
      wait("w"),
      { ...path("x"), locked: false },
    ]);
    expect(result.lines[0]).toMatchObject({
      macroId: undefined,
      isMacroElement: false,
      locked: false,
    });
  });
});

describe("insertMacro", () => {
  beforeEach(() => {
    macrosStore.set(new Map());
    notification.set(null);
  });

  it("inserts a macro named after its file", async () => {
    currentFilePath.set("/project.turt");
    const result = await insertMacro([wait("w")], "/dir/Intake.turt", 0);
    expect(result?.sequence[0]).toMatchObject({
      kind: "macro",
      name: "Intake",
      filePath: "/dir/Intake.turt",
    });
  });

  it("refuses a macro that includes the open project", async () => {
    currentFilePath.set("/project.turt");
    macrosStore.set(
      new Map([
        [
          "/other.turt",
          {
            startPoint: line("s").endPoint,
            lines: [],
            shapes: [],
            sequence: [
              { kind: "macro", id: "x", name: "", filePath: "/project.turt" },
            ],
          },
        ],
      ]),
    );
    const result = await insertMacro([], "/other.turt", 0);
    expect(result).toBeNull();
    expect(get(notification)?.type).toBe("error");
  });
});

describe("toggleChain", () => {
  const chained = (lineId: string): SequenceItem => ({
    kind: "path",
    lineId,
    isChain: true,
  });

  it("chains a path to the one before it", () => {
    const result = toggleChain(
      [line("a"), line("b")],
      [path("a"), path("b")],
      1,
    );
    expect(result.sequence[1]).toMatchObject({ isChain: true });
    expect(result.lines[1].isChain).toBe(true);
  });

  it("clears the chain heading of the whole chain when unchaining", () => {
    const lines = [
      line("a", { globalHeading: "constant", globalDegrees: 90 }),
      line("b", { isChain: true, globalHeading: "constant" }),
      line("c", { isChain: true, globalHeading: "constant" }),
      line("d", { globalHeading: "constant" }),
    ];
    const sequence = [path("a"), chained("b"), chained("c"), path("d")];
    const result = toggleChain(lines, sequence, 2);

    expect(result.sequence[2]).toMatchObject({ isChain: false });
    expect(result.lines.map((l) => l.globalHeading)).toEqual([
      undefined,
      undefined,
      undefined,
      "constant",
    ]);
    // The originals are left untouched.
    expect(lines[0].globalHeading).toBe("constant");
  });
});

describe("duplicateStep", () => {
  const startPoint = { x: 0, y: 0, heading: "tangential" as const };

  it("copies a named turn right after it, unlocked, with a fresh name", () => {
    const turn: SequenceItem = {
      kind: "rotate",
      id: "r1",
      name: "Face Goal",
      degrees: 90,
      locked: true,
    };
    const result = duplicateStep(
      { startPoint, lines: [], sequence: [turn, wait("w1")] },
      0,
    )!;
    expect(result.sequence.map((s) => s.kind)).toEqual([
      "rotate",
      "rotate",
      "wait",
    ]);
    expect(result.copy).toMatchObject({
      kind: "rotate",
      degrees: 90,
      locked: false,
    });
    expect(result.copy).not.toMatchObject({ id: "r1", name: "Face Goal" });
  });

  it("keeps an unnamed wait unnamed", () => {
    const result = duplicateStep(
      { startPoint, lines: [], sequence: [wait("w1")] },
      0,
    )!;
    expect(result.copy).toMatchObject({ kind: "wait", name: "" });
  });

  it("repeats a path's move from where the previous driven path ends", () => {
    // "b" is listed first but driven second, after "a" which ends at (10, 0).
    const a = line("a", {
      endPoint: { x: 10, y: 0, heading: "tangential" },
    });
    const b = line("b", {
      name: "Path 2",
      endPoint: { x: 20, y: 5, heading: "tangential" },
      controlPoints: [{ x: 15, y: 5 }],
      locked: true,
    });
    const result = duplicateStep(
      { startPoint, lines: [b, a], sequence: [path("a"), path("b")] },
      1,
    )!;

    const copyId = (result.copy as { lineId: string }).lineId;
    const copy = result.lines.find((l) => l.id === copyId)!;
    expect(copy.endPoint).toMatchObject({ x: 30, y: 10 });
    expect(copy.controlPoints).toEqual([{ x: 25, y: 10 }]);
    expect(copy.locked).toBe(false);
    // Placed after the original in both lists
    expect(result.lines.map((l) => l.id)).toEqual(["b", copyId, "a"]);
    expect(result.sequence).toEqual([path("a"), path("b"), path(copyId)]);
    // The original is untouched
    expect(b.endPoint).toMatchObject({ x: 20, y: 5 });
  });

  it("keeps a copied path on the field", () => {
    const a = line("a", {
      endPoint: { x: 100, y: 130, heading: "tangential" },
    });
    const result = duplicateStep(
      { startPoint, lines: [a], sequence: [path("a")] },
      0,
    )!;
    expect(result.lines[1].endPoint).toMatchObject({ x: 144, y: 144 });
  });

  it("doesn't copy macros", () => {
    const macro: SequenceMacroItem = {
      kind: "macro",
      id: "m",
      name: "m",
      filePath: "/m.turt",
    };
    expect(
      duplicateStep({ startPoint, lines: [], sequence: [macro] }, 0),
    ).toBeNull();
  });
});
