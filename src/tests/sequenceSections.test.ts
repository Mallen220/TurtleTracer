// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { render, screen, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach } from "vitest";
import SectionWrapper from "./SectionWrapper.svelte";
import WaitSection from "../lib/components/sections/WaitSection.svelte";
import RotateSection from "../lib/components/sections/RotateSection.svelte";
import MacroSection from "../lib/components/sections/MacroSection.svelte";
import { registerCoreUI } from "../lib/coreRegistrations";
import type { SequenceItem } from "../types";

registerCoreUI();

const cases = [
  {
    kind: "wait" as const,
    label: "Wait",
    section: WaitSection,
    item: { kind: "wait", id: "w1", name: "Grab", durationMs: 500 },
    twin: { kind: "wait", id: "w2", name: "Grab", durationMs: 500 },
    valueLabel: /Duration/,
    field: "durationMs",
  },
  {
    kind: "rotate" as const,
    label: "Rotate",
    section: RotateSection,
    item: { kind: "rotate", id: "r1", name: "Face", degrees: 90 },
    twin: { kind: "rotate", id: "r2", name: "Face", degrees: 90 },
    valueLabel: /Heading/,
    field: "degrees",
  },
];

describe.each(cases)("$label section", (c) => {
  let project: { sequence: SequenceItem[] };
  let handlers: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    project = { sequence: [{ ...c.item }, { ...c.twin }] as SequenceItem[] };
    handlers = {
      onRemove: vi.fn(),
      onAddAction: vi.fn(),
      onMoveUp: vi.fn(),
      onMoveDown: vi.fn(),
      recordChange: vi.fn(),
    };
    render(SectionWrapper, {
      section: c.section,
      kind: c.kind,
      project,
      ...handlers,
    });
  });

  it("changes its value and the value of items that share its name", async () => {
    await fireEvent.change(screen.getByLabelText(c.valueLabel), {
      target: { value: "1234" },
    });
    expect((project.sequence[0] as any)[c.field]).toBe(1234);
    expect((project.sequence[1] as any)[c.field]).toBe(1234);
    expect(handlers.recordChange).toHaveBeenCalled();
  });

  it("locks and hides", async () => {
    await fireEvent.click(screen.getByLabelText(`Lock ${c.label}`));
    expect((project.sequence[0] as any).locked).toBe(true);
    await fireEvent.click(screen.getByLabelText(`Hide ${c.label}`));
    expect((project.sequence[0] as any).hidden).toBe(true);
  });

  it("renames", async () => {
    await fireEvent.input(screen.getByLabelText(`${c.label} name`), {
      target: { value: "Score" },
    });
    expect(project.sequence[0]).toMatchObject({ name: "Score" });
  });

  it("offers to insert each kind of step after it", async () => {
    await fireEvent.click(screen.getByLabelText("Add Path After"));
    expect(handlers.onAddAction).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "path" }),
    );
  });
});

describe("Macro section", () => {
  it("renames, locks and unlinks", async () => {
    const project = {
      sequence: [
        { kind: "macro", id: "m1", name: "Cycle", filePath: "/p/cycle.turt" },
      ] as SequenceItem[],
    };
    const onUnlink = vi.fn();
    render(SectionWrapper, {
      section: MacroSection,
      kind: "macro",
      project,
      onRemove: vi.fn(),
      onAddAction: vi.fn(),
      onMoveUp: vi.fn(),
      onMoveDown: vi.fn(),
      onUnlink,
      recordChange: vi.fn(),
    });
    expect(screen.getByText("/p/cycle.turt")).toBeTruthy();
    await fireEvent.input(screen.getByLabelText("Macro name"), {
      target: { value: "Loop" },
    });
    expect(project.sequence[0]).toMatchObject({ name: "Loop" });
    await fireEvent.click(screen.getByLabelText("Unlink Macro"));
    expect(onUnlink).toHaveBeenCalled();
    await fireEvent.click(screen.getByLabelText("Lock Macro"));
    expect((project.sequence[0] as any).locked).toBe(true);
  });
});
