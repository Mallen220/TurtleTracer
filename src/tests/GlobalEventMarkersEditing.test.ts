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
