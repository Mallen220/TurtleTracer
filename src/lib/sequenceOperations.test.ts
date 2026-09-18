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
