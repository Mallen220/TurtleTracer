// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { render, screen, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach } from "vitest";
import GlobalEventMarkersWrapper from "./GlobalEventMarkersWrapper.svelte";
import type { SequenceItem, Line } from "../types";
import { registerCoreUI } from "../lib/coreRegistrations";

registerCoreUI();

vi.mock("../stores", () => ({
  hoveredMarkerId: { set: vi.fn(), subscribe: vi.fn() },
  diskEventNamesStore: {
    subscribe: (run: any) => {
      run([]);
      return () => {};
    },
  },
}));

const line = (id: string, markers: any[] = []): Line => ({
  id,
  endPoint: { x: 10, y: 10, heading: "tangential", reverse: false },
  controlPoints: [],
  color: "red",
  eventMarkers: markers,
});

async function setPosition(name: string, value: number) {
  const input = screen.getByLabelText(`Position value for ${name}`);
  await fireEvent.change(input, { target: { value: String(value) } });
}

describe("GlobalEventMarkers editing", () => {
  let project: { lines: Line[]; sequence: SequenceItem[] };

  beforeEach(() => {
    project = {
      lines: [
        line("a"),
        line("b", [{ id: "m1", name: "Grab", position: 0.5, lineIndex: 1 }]),
      ],
      sequence: [
        { kind: "path", lineId: "a" },
        { kind: "path", lineId: "b" },
        { kind: "wait", id: "w1", name: "", durationMs: 500 },
      ],
    };
    render(GlobalEventMarkersWrapper, { project });
  });

  it("moves a marker along its own path", async () => {
    await setPosition("Grab", 1.25);
    expect(project.lines[1].eventMarkers).toEqual([
      expect.objectContaining({ id: "m1", position: 0.25 }),
    ]);
  });

  it("moves a marker onto an earlier path", async () => {
    await setPosition("Grab", 0.75);
    expect(project.lines[1].eventMarkers).toEqual([]);
    expect(project.lines[0].eventMarkers).toEqual([
      expect.objectContaining({ id: "m1", position: 0.75, lineIndex: 0 }),
    ]);
  });

  it("moves a marker onto a wait step", async () => {
    await setPosition("Grab", 2.5);
    const wait = project.sequence[2] as any;
    expect(project.lines[1].eventMarkers).toEqual([]);
    expect(wait.eventMarkers).toEqual([
      expect.objectContaining({ id: "m1", position: 0.5, waitId: "w1" }),
    ]);
    expect(wait.eventMarkers[0].lineIndex).toBeUndefined();
  });

  it("removes a marker", async () => {
    await fireEvent.click(screen.getByLabelText("Remove Marker"));
    expect(project.lines[1].eventMarkers).toEqual([]);
  });
});

describe("GlobalEventMarkers listed under one step", () => {
  let project: { lines: Line[]; sequence: SequenceItem[] };

  beforeEach(() => {
    project = {
      lines: [
        line("a", [{ id: "m0", name: "Other", position: 0.1, lineIndex: 0 }]),
        line("b", [{ id: "m1", name: "Grab", position: 0.5, lineIndex: 1 }]),
      ],
      sequence: [
        { kind: "path", lineId: "a" },
        { kind: "path", lineId: "b" },
      ],
    };
    render(GlobalEventMarkersWrapper, { project, ownerId: "b" });
  });

  it("lists only that step's markers", () => {
    expect(screen.getByLabelText("Position for Grab")).toBeTruthy();
    expect(screen.queryByLabelText("Position for Other")).toBeNull();
  });

  it("keeps the marker on its step, within the step", async () => {
    await setPosition("Grab", 1.25);
    expect(project.lines[1].eventMarkers).toEqual([
      expect.objectContaining({ id: "m1", position: 1 }),
    ]);
    expect(project.lines[0].eventMarkers).toHaveLength(1);
  });

  it("adds a marker to that step", async () => {
    await fireEvent.click(screen.getByLabelText("Add Item"));
    expect(project.lines[1].eventMarkers).toHaveLength(2);
    expect(project.lines[0].eventMarkers).toHaveLength(1);
  });
});

describe("GlobalEventMarkers under a step with none", () => {
  it("offers to add the first marker", async () => {
    const project = {
      lines: [line("a")],
      sequence: [{ kind: "path", lineId: "a" }] as SequenceItem[],
    };
    render(GlobalEventMarkersWrapper, { project, ownerId: "a" });
    expect(screen.queryByLabelText("Add Item")).toBeNull();
    await fireEvent.click(screen.getByLabelText("Add event marker"));
    expect(project.lines[0].eventMarkers).toHaveLength(1);
    expect(screen.getByLabelText("Add Item")).toBeTruthy();
  });
});
