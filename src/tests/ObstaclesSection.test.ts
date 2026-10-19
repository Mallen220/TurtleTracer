// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import { get } from "svelte/store";
import ObstaclesSection from "../lib/components/sections/ObstaclesSection.svelte";
import { settingsStore, shapesStore } from "../lib/projectStore";
import { DEFAULT_SETTINGS } from "../config/defaults";
import type { Shape } from "../types";

const triangle = (over: Partial<Shape> = {}): Shape =>
  ({
    id: "s1",
    name: "Obstacle 1",
    vertices: [
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 50, y: 60 },
    ],
    color: "#ff0000",
    fillColor: "#ff000033",
    ...over,
  }) as Shape;

function mount(shape = triangle()) {
  const recordChange = vi.fn();
  render(ObstaclesSection, {
    shapes: [shape],
    collapsedObstacles: [false],
    recordChange,
  });
  return { shape, recordChange };
}

const xInputs = () => screen.getAllByRole("spinbutton") as HTMLInputElement[];

beforeEach(() => {
  settingsStore.set({ ...DEFAULT_SETTINGS });
  shapesStore.set([]);
});

describe("ObstaclesSection vertex inputs", () => {
  it("shows an X and a Y field for every corner, in order", () => {
    mount();
    expect(xInputs().map((i) => i.value)).toEqual([
      "10",
      "20",
      "30",
      "40",
      "50",
      "60",
    ]);
  });

  it("moves a corner as you type and records the change when you leave the field", async () => {
    const { recordChange } = mount();
    const [x1, y1] = xInputs();

    await fireEvent.input(x1, { target: { value: "15.5" } });
    await fireEvent.input(y1, { target: { value: "25" } });
    expect(get(shapesStore)[0].vertices[0]).toEqual({ x: 15.5, y: 25 });
    expect(get(shapesStore)[0].vertices[1]).toEqual({ x: 30, y: 40 });
    expect(recordChange).not.toHaveBeenCalled();

    await fireEvent.blur(y1);
    expect(recordChange).toHaveBeenCalledWith("Move Obstacle Vertex");
  });

  it("ignores a field that isn't a number", async () => {
    mount();
    await fireEvent.input(xInputs()[0], { target: { value: "" } });
    expect(get(shapesStore)).toEqual([]);
    expect(xInputs()[1].value).toBe("20");
  });

  it("limits X to the field's width and Y to its height", () => {
    settingsStore.set({
      ...DEFAULT_SETTINGS,
      fieldWidth: 144,
      fieldHeight: 100,
    });
    mount();
    const [x, y] = xInputs();
    expect([x.min, x.max]).toEqual(["0", "144"]);
    expect([y.min, y.max]).toEqual(["0", "100"]);
  });

  it("measures from the field's center in FTC coordinates", () => {
    settingsStore.set({
      ...DEFAULT_SETTINGS,
      coordinateSystem: "FTC",
      fieldWidth: 144,
      fieldHeight: 100,
    });
    mount();
    const [x, y] = xInputs();
    expect([x.min, x.max]).toEqual(["-72", "72"]);
    expect([y.min, y.max]).toEqual(["-50", "50"]);
  });

  it("can't be edited while the obstacle is locked", () => {
    mount(triangle({ locked: true }));
    expect(xInputs().every((i) => i.disabled)).toBe(true);
  });
});
