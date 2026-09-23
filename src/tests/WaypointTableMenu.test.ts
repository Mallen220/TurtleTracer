// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { render, screen, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { tick } from "svelte";
import WaypointTableWrapper from "./WaypointTableWrapper.svelte";
import { registerCoreUI } from "../lib/coreRegistrations";
import type { Line, Point, SequenceItem } from "../types";

vi.mock("../lib/projectStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/projectStore")>()),
  loadMacro: vi.fn(),
}));

registerCoreUI();

const startPoint: Point = { x: 0, y: 0, heading: "tangential", reverse: false };
const line = (id: string, x: number, y: number, extra = {}): Line => ({
  id,
  name: "",
  endPoint: { x, y, heading: "tangential", reverse: false },
  controlPoints: [],
  color: "#f00",
  ...extra,
});

function setup(lines: Line[], sequence: SequenceItem[]) {
  const project = { startPoint, lines, sequence };
  const recordChange = vi.fn();
  const { container } = render(WaypointTableWrapper, {
    project,
    recordChange,
  });
  const openMenu = async (seqIndex: number) => {
    const row = container.querySelector(`tr[data-seq-index="${seqIndex}"]`)!;
    await fireEvent.contextMenu(row);
    await tick();
  };
  const choose = async (label: string) => {
    await fireEvent.click(screen.getByRole("menuitem", { name: label }));
    await tick();
  };
  return { project, recordChange, openMenu, choose };
}

describe("WaypointTable row menu", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("duplicates a path, repeating its move", async () => {
    const t = setup([line("a", 10, 0)], [{ kind: "path", lineId: "a" }]);
    await t.openMenu(0);
    await t.choose("Duplicate");
    expect(t.project.lines).toHaveLength(2);
    expect(t.project.lines[1].endPoint).toMatchObject({ x: 20, y: 0 });
    expect(t.project.sequence).toHaveLength(2);
    expect(t.recordChange).toHaveBeenCalled();
  });

  it("duplicates a wait", async () => {
    const t = setup(
      [line("a", 10, 0)],
      [
        { kind: "path", lineId: "a" },
        { kind: "wait", id: "w", name: "Grab", durationMs: 300 },
      ],
    );
    await t.openMenu(1);
    await t.choose("Duplicate");
    expect(t.project.sequence.map((s) => s.kind)).toEqual([
      "path",
      "wait",
      "wait",
    ]);
    expect(t.project.sequence[2]).toMatchObject({ durationMs: 300 });
    expect(t.project.sequence[2]).not.toMatchObject({ id: "w" });
  });

  it("duplicates a turn", async () => {
    const t = setup(
      [line("a", 10, 0)],
      [
        { kind: "path", lineId: "a" },
        { kind: "rotate", id: "r", name: "", degrees: 45 },
      ],
    );
    await t.openMenu(1);
    await t.choose("Duplicate");
    expect(t.project.sequence.map((s) => s.kind)).toEqual([
      "path",
      "rotate",
      "rotate",
    ]);
  });

  it("inserts steps before and after", async () => {
    const t = setup([line("a", 10, 0)], [{ kind: "path", lineId: "a" }]);
    await t.openMenu(0);
    await t.choose("Insert Wait After");
    await t.openMenu(0);
    await t.choose("Insert Rotate Before");
    await t.openMenu(0);
    await t.choose("Insert Path After");
    expect(t.project.sequence.map((s) => s.kind)).toEqual([
      "rotate",
      "path",
      "path",
      "wait",
    ]);
    expect(t.project.lines).toHaveLength(2);
  });

  it("inserts after the start point", async () => {
    const t = setup([line("a", 10, 0)], [{ kind: "path", lineId: "a" }]);
    await t.openMenu(-1);
    await t.choose("Insert Wait After");
    expect(t.project.sequence[0].kind).toBe("wait");
  });

  it("locks, moves and deletes", async () => {
    const t = setup(
      [line("a", 10, 0), line("b", 20, 0)],
      [
        { kind: "path", lineId: "a" },
        { kind: "wait", id: "w", name: "", durationMs: 100 },
        { kind: "path", lineId: "b" },
      ],
    );
    await t.openMenu(1);
    await t.choose("Move Down");
    expect(t.project.sequence.map((s) => s.kind)).toEqual([
      "path",
      "path",
      "wait",
    ]);

    await t.openMenu(2);
    await t.choose("Lock");
    expect(t.project.sequence[2]).toMatchObject({ locked: true });
    await t.openMenu(2);
    expect(
      screen.getByRole("menuitem", { name: "Delete" }).hasAttribute("disabled"),
    ).toBe(true);
    await t.choose("Unlock");

    await t.openMenu(2);
    await t.choose("Delete");
    expect(t.project.sequence).toHaveLength(2);

    await t.openMenu(0);
    await t.choose("Lock");
    expect(t.project.lines[0].locked).toBe(true);
  });

  it("won't delete the last path", async () => {
    const t = setup([line("a", 10, 0)], [{ kind: "path", lineId: "a" }]);
    await t.openMenu(0);
    expect(
      screen.getByRole("menuitem", { name: "Delete" }).hasAttribute("disabled"),
    ).toBe(true);
  });
});
