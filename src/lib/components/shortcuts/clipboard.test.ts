// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { get } from "svelte/store";

const focus = vi.hoisted(() => ({ value: false }));
vi.mock("./utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./utils")>()),
  isUIElementFocused: () => focus.value,
}));

import {
  linesStore,
  sequenceStore,
  startPointStore,
  settingsStore,
} from "../../projectStore";
import { selectedLineId, selectedPointId, notification } from "../../../stores";
import { actionRegistry } from "../../actionRegistry";
import { registerCoreUI } from "../../coreRegistrations";
import { DEFAULT_SETTINGS } from "../../../config/defaults";
import { copy, cut, paste, duplicate, getClipboard } from "./clipboard";
import type { Line, Point, SequenceItem } from "../../../types";

const record = vi.fn();

const makeLine = (id: string, x: number, name = ""): Line => ({
  id,
  name,
  endPoint: { x, y: 10, heading: "tangential", reverse: false } as Point,
  controlPoints: [],
  color: "red",
});
const wait = (id: string, name = "Wait", durationMs = 500) =>
  ({ kind: "wait", id, name, durationMs }) as SequenceItem;
const rotate = (id: string, name = "Turn", degrees = 90) =>
  ({ kind: "rotate", id, name, degrees }) as SequenceItem;
const pathStep = (lineId: string): SequenceItem => ({ kind: "path", lineId });

function setState(state: {
  lines?: Line[];
  sequence?: SequenceItem[];
  point?: string | null;
  line?: string | null;
}) {
  linesStore.set(state.lines ?? []);
  sequenceStore.set(state.sequence ?? []);
  selectedPointId.set(state.point ?? null);
  selectedLineId.set(state.line ?? null);
}

const names = (items: { name?: string }[]) => items.map((i) => i.name);

beforeEach(() => {
  actionRegistry.reset();
  registerCoreUI();
  focus.value = false;
  record.mockClear();
  notification.set(null);
  startPointStore.set({ x: 0, y: 0, heading: "tangential" } as Point);
  settingsStore.set({ ...DEFAULT_SETTINGS });
  setState({});
});

describe("copy", () => {
  it("copies the selected wait or rotation, leaving the original in place", () => {
    setState({ sequence: [wait("w1", "Pause", 700)], point: "wait-w1" });
    copy("paths");
    expect(getClipboard()).toMatchObject({
      kind: "wait",
      id: "w1",
      durationMs: 700,
    });
    expect(get(notification)).toMatchObject({ message: "Selection copied" });
    expect(get(sequenceStore)).toHaveLength(1);
  });

  it("copies a path when it was selected directly or through one of its points", () => {
    setState({
      lines: [makeLine("a", 10), makeLine("b", 20)],
      line: "b",
      point: "point-1-0",
    });
    copy("paths");
    expect((getClipboard() as Line).id).toBe("b");

    // With no line selected, the point's own path number decides.
    setState({
      lines: [makeLine("a", 10), makeLine("b", 20)],
      point: "point-1-0",
    });
    copy("paths");
    expect((getClipboard() as Line).id).toBe("a");
  });

  it("keeps an independent copy, so later edits don't change what gets pasted", () => {
    const lines = [makeLine("a", 10)];
    setState({ lines, point: "point-1-0" });
    copy("paths");
    lines[0].endPoint.x = 999;
    expect((getClipboard() as Line).endPoint.x).toBe(10);
  });

  it("does nothing with no selection, an unknown selection, or while typing", () => {
    setState({ sequence: [wait("w1")], point: "wait-w1" });
    copy("paths"); // put something on the clipboard
    const before = getClipboard();
    notification.set(null);

    setState({ point: null });
    copy("paths");
    setState({ sequence: [wait("w1")], point: "wait-missing" });
    copy("paths");
    setState({ point: "point-9-0" });
    copy("paths");
    setState({ sequence: [wait("w1")], point: "wait-w1" });
    focus.value = true;
    copy("paths");

    expect(getClipboard()).toBe(before);
    expect(get(notification)).toBeNull();
  });

  it("lets the code and table tabs copy their own content instead", () => {
    const tab = { copyCode: vi.fn(), copyTable: vi.fn() };
    setState({ sequence: [wait("w1")], point: "wait-w1" });
    copy("code", tab);
    expect(tab.copyCode).toHaveBeenCalledTimes(1);
    copy("table", tab);
    expect(tab.copyTable).toHaveBeenCalledTimes(1);
    expect(get(notification)).toBeNull();
  });

  it("falls back to copying the selection if the tab has no copy function", () => {
    setState({ sequence: [wait("w1")], point: "wait-w1" });
    copy("code", {});
    expect(getClipboard()).toMatchObject({ id: "w1" });
  });
});

describe("cut", () => {
  it("copies, then removes the selection and says so", () => {
    setState({ sequence: [wait("w1")], point: "wait-w1" });
    const remove = vi.fn();
    cut("paths", undefined, remove);
    expect(getClipboard()).toMatchObject({ id: "w1" });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(get(notification)).toMatchObject({ message: "Selection cut" });
  });

  it("does nothing while typing", () => {
    const remove = vi.fn();
    focus.value = true;
    cut("paths", undefined, remove);
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("paste", () => {
  const copyWait = (name = "Pause") => {
    setState({ sequence: [wait("src", name)], point: "wait-src" });
    copy("paths");
  };

  it("pastes a wait after the selected step, with a new id and selects it", () => {
    copyWait();
    setState({
      sequence: [wait("src", "Pause"), rotate("r1"), wait("end", "End")],
      point: "wait-src",
    });
    paste(record);
    const seq = get(sequenceStore) as any[];
    expect(seq).toHaveLength(4);
    expect(seq[1]).toMatchObject({ kind: "wait", durationMs: 500 });
    expect(seq[1].id).not.toBe("src");
    expect(get(selectedPointId)).toBe(`wait-${seq[1].id}`);
    expect(record).toHaveBeenCalledWith("Paste");
    expect(get(notification)).toMatchObject({ message: "Wait pasted" });
  });

  it("gives a pasted item a name that doesn't clash with existing ones", () => {
    copyWait("Pause");
    setState({ sequence: [wait("src", "Pause")], point: "wait-src" });
    paste(record);
    paste(record);
    const used = names(get(sequenceStore) as any[]);
    expect(new Set(used).size).toBe(used.length);
    expect(used[0]).toBe("Pause");
  });

  it("pastes at the end when nothing in the sequence is selected", () => {
    copyWait();
    setState({ sequence: [rotate("r1")], point: null });
    paste(record);
    expect((get(sequenceStore) as any[]).map((s) => s.kind)).toEqual([
      "rotate",
      "wait",
    ]);
  });

  it("pastes a rotation with its own message", () => {
    setState({ sequence: [rotate("src")], point: "rotate-src" });
    copy("paths");
    paste(record);
    expect(get(notification)).toMatchObject({ message: "Rotate pasted" });
  });

  it("does nothing while typing", () => {
    copyWait();
    setState({ sequence: [], point: null });
    focus.value = true;
    paste(record);
    expect(get(sequenceStore)).toEqual([]);
    expect(record).not.toHaveBeenCalled();
  });

  describe("pasting a path", () => {
    const copyPath = (id: string) => {
      setState({
        lines: [makeLine("a", 10, "First"), makeLine("b", 20, "Second")],
        point: `point-${id === "a" ? 1 : 2}-0`,
      });
      copy("paths");
    };

    it("puts the new path after the one the selected step belongs to", () => {
      copyPath("a");
      setState({
        lines: [makeLine("a", 10, "First"), makeLine("b", 20, "Second")],
        sequence: [pathStep("a"), pathStep("b")],
        point: "point-1-0",
        line: "a",
      });
      paste(record);
      const lines = get(linesStore);
      const seq = get(sequenceStore) as any[];
      expect(lines.map((l) => l.id)).toHaveLength(3);
      expect(lines[0].id).toBe("a");
      expect(lines[2].id).toBe("b");
      expect(seq.map((s) => s.lineId)[2]).toBe("b");
      expect(seq[1].lineId).toBe(lines[1].id);
      expect(lines[1].id).not.toBe("a");
      expect(get(selectedLineId)).toBe(lines[1].id);
      expect(get(notification)).toMatchObject({ message: "Path pasted" });
    });

    it("puts the new path first if the selection comes before any path", () => {
      copyPath("a");
      setState({
        lines: [makeLine("a", 10), makeLine("b", 20)],
        sequence: [wait("w1"), pathStep("a"), pathStep("b")],
        point: "wait-w1",
      });
      paste(record);
      const lines = get(linesStore);
      expect(lines[1].id).toBe("a");
      expect(lines).toHaveLength(3);
      expect(lines[0].id).not.toBe("a");
      expect(lines[0].id).not.toBe("b");
    });

    it("adds the new path at the end when nothing is selected", () => {
      copyPath("b");
      setState({
        lines: [makeLine("a", 10, "First"), makeLine("b", 20, "Second")],
        sequence: [pathStep("a"), pathStep("b")],
        point: null,
      });
      paste(record);
      const lines = get(linesStore);
      expect(lines).toHaveLength(3);
      expect(lines[1].id).toBe("b");
      expect((get(sequenceStore) as any[]).at(-1).lineId).toBe(lines[2].id);
    });

    it("names the pasted path so it doesn't clash", () => {
      copyPath("a");
      setState({
        lines: [makeLine("a", 10, "First")],
        sequence: [pathStep("a")],
        point: null,
      });
      paste(record);
      const lines = get(linesStore);
      expect(lines).toHaveLength(2);
      expect(lines[1].name).not.toBe(lines[0].name);
      expect(lines[1].name).toContain("First");
    });
  });
});

describe("duplicate", () => {
  it("copies a wait right after itself, unlocked, and selects the copy", () => {
    setState({
      sequence: [{ ...wait("w1", "Pause"), locked: true } as any, rotate("r1")],
      point: "wait-w1",
    });
    duplicate(record);
    const seq = get(sequenceStore) as any[];
    expect(seq.map((s) => s.kind)).toEqual(["wait", "wait", "rotate"]);
    expect(seq[1].locked).toBe(false);
    expect(seq[1].name).not.toBe("Pause");
    expect(get(selectedPointId)).toBe(`wait-${seq[1].id}`);
    expect(record).toHaveBeenCalledWith("Duplicate Selection");
  });

  it("repeats a path's move from where the original ends and selects the copy", () => {
    setState({
      lines: [makeLine("a", 10), makeLine("b", 30)],
      sequence: [pathStep("a"), pathStep("b")],
      point: "point-2-0",
      line: "b",
    });
    duplicate(record);
    const lines = get(linesStore);
    expect(lines).toHaveLength(3);
    // "b" moved +20 in x, so its copy ends 20 further on.
    expect(lines[2].endPoint.x).toBe(50);
    const copyId = lines[2].id;
    expect(get(selectedLineId)).toBe(copyId);
    expect(get(selectedPointId)).toBe("point-3-0");
  });

  it("does nothing without a selection, for a path that isn't in the sequence, or while typing", () => {
    setState({
      lines: [makeLine("a", 10)],
      sequence: [],
      point: "point-1-0",
      line: "a",
    });
    duplicate(record);
    setState({
      lines: [makeLine("a", 10)],
      sequence: [pathStep("a")],
      point: null,
    });
    duplicate(record);
    focus.value = true;
    setState({ sequence: [wait("w")], point: "wait-w" });
    duplicate(record);
    expect(record).not.toHaveBeenCalled();
    expect(get(sequenceStore)).toHaveLength(1);
  });
});
