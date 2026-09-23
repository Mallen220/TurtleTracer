// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { render, screen, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import WaitTableRow from "../lib/components/table/WaitTableRow.svelte";
import RotateTableRow from "../lib/components/table/RotateTableRow.svelte";
import MacroTableRow from "../lib/components/table/MacroTableRow.svelte";
import type { SequenceItem } from "../types";

function renderRow(component: any, item: SequenceItem, extra = {}) {
  const handlers = {
    onUpdate: vi.fn(),
    onLock: vi.fn(),
    onDelete: vi.fn(),
    onDragStart: vi.fn(),
    onDragEnd: vi.fn(),
    onContextMenu: vi.fn(),
    ...extra,
  };
  const table = document.createElement("table");
  const body = document.createElement("tbody");
  table.appendChild(body);
  document.body.appendChild(table);
  render(component, {
    target: body,
    props: { item, index: 0, sequence: [item], ...handlers },
  });
  return handlers;
}

describe("sequence table rows", () => {
  it("edits a wait's name and duration", async () => {
    const h = renderRow(WaitTableRow, {
      kind: "wait",
      id: "w1",
      name: "Grab",
      durationMs: 500,
    });
    await fireEvent.input(screen.getByLabelText("Wait"), {
      target: { value: "Score" },
    });
    expect(h.onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: "Score" }),
    );
    await fireEvent.input(screen.getByLabelText(/Duration/), {
      target: { value: "750" },
    });
    expect(h.onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ durationMs: 750 }),
    );
    await fireEvent.click(screen.getByLabelText("Lock wait"));
    expect(h.onLock).toHaveBeenCalled();
    await fireEvent.click(screen.getByLabelText("Delete wait"));
    expect(h.onDelete).toHaveBeenCalled();
  });

  it("edits a turn and offers to normalize large angles", async () => {
    const h = renderRow(RotateTableRow, {
      kind: "rotate",
      id: "r1",
      name: "Face",
      degrees: 270,
    });
    await fireEvent.click(screen.getByLabelText(/Click to normalize/));
    expect(h.onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ degrees: -90 }),
    );
    await fireEvent.click(screen.getByLabelText("Lock rotate"));
    expect(h.onLock).toHaveBeenCalled();
  });

  it("never saves a blank or negative number", async () => {
    const wait = renderRow(WaitTableRow, {
      kind: "wait",
      id: "w1",
      name: "",
      durationMs: 500,
    });
    const duration = screen.getByLabelText(/Duration/);
    await fireEvent.input(duration, { target: { value: "" } });
    expect(wait.onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ durationMs: 0 }),
    );
    await fireEvent.input(duration, { target: { value: "-5" } });
    expect(wait.onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ durationMs: 0 }),
    );
    document.body.innerHTML = "";

    const turn = renderRow(RotateTableRow, {
      kind: "rotate",
      id: "r1",
      name: "",
      degrees: 45,
    });
    await fireEvent.input(screen.getByLabelText(/Degrees/), {
      target: { value: "" },
    });
    expect(turn.onUpdate).not.toHaveBeenCalled();
  });

  it("shows a macro's file and can unlink it", async () => {
    const onUnlink = vi.fn();
    renderRow(
      MacroTableRow,
      { kind: "macro", id: "m1", name: "Cycle", filePath: "/p/cycle.turt" },
      { onUnlink },
    );
    expect(screen.getByText("cycle.turt")).toBeTruthy();
    await fireEvent.click(screen.getByLabelText("Unlink macro"));
    expect(onUnlink).toHaveBeenCalled();
  });
});
