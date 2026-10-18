// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import MacroTransformControls from "../lib/components/sections/MacroTransformControls.svelte";
import type { SequenceMacroItem } from "../types";

function mount() {
  const macro = {
    kind: "macro",
    id: "m",
    name: "Macro",
    filePath: "/a.turt",
  } as SequenceMacroItem;
  const onUpdate = vi.fn();
  render(MacroTransformControls, { macro, onUpdate });
  return { macro, onUpdate };
}

const chooseTab = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));
const add = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name: `Add ${name}` }));

describe("MacroTransformControls", () => {
  it("adds a translation and clears the offsets", async () => {
    const { macro, onUpdate } = mount();
    const [dx, dy] = screen.getAllByRole("spinbutton");
    await fireEvent.input(dx, { target: { value: "5" } });
    await fireEvent.input(dy, { target: { value: "-3" } });
    await add("Translate");

    expect(macro.transformations).toEqual([
      { type: "translate", dx: 5, dy: -3 },
    ]);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect((dx as HTMLInputElement).value).toBe("0");
  });

  it("doesn't add a translation that moves nothing", async () => {
    const { macro, onUpdate } = mount();
    await add("Translate");
    expect(macro.transformations).toBeUndefined();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("rotates around the field's center unless told otherwise", async () => {
    const { macro } = mount();
    await chooseTab("Rotate");
    await add("Rotate");
    expect(macro.transformations).toEqual([
      { type: "rotate", degrees: 90, pivot: "center" },
    ]);
  });

  it("offers each pivot once, labelling the origin by its position when rotating", async () => {
    mount();
    await chooseTab("Rotate");
    expect(screen.getAllByText("Origin (72,72)")).toHaveLength(1);
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("rotates around a custom pivot", async () => {
    const { macro } = mount();
    await chooseTab("Rotate");
    await fireEvent.click(screen.getByLabelText("Custom"));
    await fireEvent.input(screen.getByPlaceholderText("X"), {
      target: { value: "10" },
    });
    await fireEvent.input(screen.getByPlaceholderText("Y"), {
      target: { value: "20" },
    });
    await add("Rotate");
    expect(macro.transformations).toEqual([
      { type: "rotate", degrees: 90, pivot: { x: 10, y: 20 } },
    ]);
  });

  it("flips along the chosen axis around the chosen pivot", async () => {
    const { macro } = mount();
    await chooseTab("Flip");
    await fireEvent.click(screen.getByLabelText("Vertical"));
    await fireEvent.click(screen.getByLabelText("Origin"));
    await add("Flip");
    expect(macro.transformations).toEqual([
      { type: "flip", axis: "vertical", pivot: "origin" },
    ]);
  });
});
