// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { render, screen, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach } from "vitest";
import GlobalEventMarkersWrapper from "./GlobalEventMarkersWrapper.svelte";
import { registerCoreUI } from "../lib/coreRegistrations";
import { startPointStore } from "../lib/projectStore";
import type {
  Line,
  SequenceItem,
  TimePrediction,
  TimelineEvent,
} from "../types";

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

const line = (id: string, x: number, markers: any[] = []): Line => ({
  id,
  endPoint: { x, y: 0, heading: "tangential", reverse: false },
  controlPoints: [],
  color: "red",
  eventMarkers: markers,
});

const marker = (over: Record<string, unknown> = {}) => ({
  id: "m1",
  name: "Grab",
  position: 0.5,
  lineIndex: 0,
  ...over,
});

type Project = { lines: Line[]; sequence: SequenceItem[] };

/**
 * Path a: 0-2 s, a wait: 2-3 s, path b: 3-5 s. Older timelines only say which
 * line an event is for (by index); `withLines` adds the line itself as well.
 */
function timeline(withLines = false): TimePrediction {
  const events: TimelineEvent[] = [
    { type: "travel", startTime: 0, endTime: 2, duration: 2, lineIndex: 0 },
    { type: "wait", startTime: 2, endTime: 3, duration: 1, waitId: "w1" },
    { type: "travel", startTime: 3, endTime: 5, duration: 2, lineIndex: 1 },
  ];
  if (withLines) {
    events[0].line = line("a", 100);
    events[2].line = line("b", 200);
  }
  return { totalTime: 5, segmentTimes: [], totalDistance: 0, timeline: events };
}

function mount(project: Project, timePrediction?: TimePrediction) {
  render(GlobalEventMarkersWrapper, { project, timePrediction });
}

const basic = (m: any[] = [marker()]): Project => ({
  lines: [line("a", 100, m), line("b", 200)],
  sequence: [
    { kind: "path", lineId: "a" },
    { kind: "wait", id: "w1", name: "", durationMs: 1000 },
    { kind: "path", lineId: "b" },
  ],
});

const typeSelect = () => document.querySelector("select") as HTMLSelectElement;
const setType = async (value: string) => {
  await fireEvent.change(typeSelect(), { target: { value } });
};
const timeBox = () =>
  screen.getByLabelText("Event time in milliseconds") as HTMLInputElement;
const setTime = (ms: number) =>
  fireEvent.change(timeBox(), { target: { value: String(ms) } });

beforeEach(() => {
  startPointStore.set({
    x: 0,
    y: 0,
    heading: "tangential",
    reverse: false,
  } as any);
});

describe("adding and listing markers", () => {
  it("says so when there are no markers", () => {
    mount({ ...basic([]) });
    expect(screen.getByText("No event markers")).toBeInTheDocument();
  });

  it("adds a marker halfway along the last step that can hold one", async () => {
    const project = basic([]);
    mount(project);
    await fireEvent.click(screen.getByLabelText("Add Item"));
    const added = project.lines[1].eventMarkers!;
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      type: "parametric",
      position: 0.5,
      lineIndex: 1,
    });
    expect(added[0].id).toBeTruthy();
  });

  it("puts a new marker on a wait if that is the last step", async () => {
    const project: Project = {
      lines: [line("a", 100)],
      sequence: [
        { kind: "path", lineId: "a" },
        { kind: "wait", id: "w1", name: "Pause", durationMs: 500 },
      ],
    };
    mount(project);
    await fireEvent.click(screen.getByLabelText("Add Item"));
    const wait = project.sequence[1] as any;
    expect(wait.eventMarkers).toHaveLength(1);
    expect(wait.eventMarkers[0]).toMatchObject({ waitId: "w1" });
    expect(wait.eventMarkers[0].lineIndex).toBeUndefined();
  });

  it("adds nothing when the sequence has no steps", async () => {
    const project: Project = { lines: [], sequence: [] };
    mount(project);
    await fireEvent.click(screen.getByLabelText("Add Item"));
    expect(screen.getByText("No event markers")).toBeInTheDocument();
  });

  it("lists markers in the order they fire, naming where each one lives", () => {
    mount({
      lines: [
        line("a", 100, [marker({ id: "late", name: "Late", position: 0.9 })]),
        line("b", 200, [marker({ id: "early", name: "Early", position: 0.1 })]),
      ],
      sequence: [
        { kind: "path", lineId: "a" },
        { kind: "path", lineId: "b" },
      ],
    });
    const names = screen
      .getAllByTitle("Remove Marker")
      .map((b) => b.closest("[role=group]")!.id);
    expect(names).toEqual(["global-marker-late", "global-marker-early"]);
    expect(screen.getByText("Path 1")).toBeInTheDocument();
    expect(screen.getByText("Path 2")).toBeInTheDocument();
  });

  it("shows markers on waits and turns, naming unnamed ones by position", () => {
    mount({
      lines: [line("a", 100)],
      sequence: [
        { kind: "path", lineId: "a" },
        {
          kind: "wait",
          id: "w",
          name: "",
          durationMs: 1,
          eventMarkers: [marker({ id: "x", waitId: "w" })],
        },
        {
          kind: "rotate",
          id: "r",
          name: "",
          degrees: 1,
          eventMarkers: [marker({ id: "y", name: "Spin", rotateId: "r" })],
        },
      ] as SequenceItem[],
    });
    expect(screen.getByText("Wait 2")).toBeInTheDocument();
    expect(screen.getByText("Rotate 3")).toBeInTheDocument();
  });

  it("skips macros when numbering the positions", () => {
    mount({
      lines: [line("a", 100, [marker({ position: 0.25 })])],
      sequence: [
        { kind: "macro", id: "mac", name: "M", filePath: "/m.turt" },
        { kind: "path", lineId: "a" },
      ] as SequenceItem[],
    });
    expect(
      (screen.getByLabelText("Position value for Grab") as HTMLInputElement)
        .value,
    ).toBe("0.25");
  });
});

describe("the marker type", () => {
  it("starts as parametric, with a slider and a number for the position", () => {
    mount(basic());
    expect(typeSelect().value).toBe("parametric");
    expect(screen.getByLabelText("Position for Grab")).toBeInTheDocument();
    expect(screen.getByText("Global Index: 0.50")).toBeInTheDocument();
  });

  it("switching to temporal shows the time instead", async () => {
    const project = basic();
    mount(project, timeline());
    await setType("temporal");
    expect(project.lines[0].eventMarkers![0].type).toBe("temporal");
    expect(screen.queryByLabelText("Position for Grab")).toBeNull();
    expect(timeBox()).toBeInTheDocument();
    expect(screen.getByText(/Global Time: \d+ms/)).toBeInTheDocument();
  });

  it("switching to pose shows the X and Y of the point instead", async () => {
    const project = basic([marker({ poseX: 12.345, poseY: 6.7 })]);
    mount(project);
    await setType("pose");
    expect(project.lines[0].eventMarkers![0].type).toBe("pose");
    expect(screen.getByText("X:")).toBeInTheDocument();
    expect(screen.getByText("Y:")).toBeInTheDocument();
    expect(screen.getByText(/Global Index: \d+\.\d{3}/)).toBeInTheDocument();
  });
});

describe("temporal markers", () => {
  it("shows how far into its segment the marker is", () => {
    mount(
      basic([marker({ type: "temporal", endTime: 1500, time: 1500 })]),
      timeline(true),
    );
    expect(screen.getByText("Time after Start: 1500ms")).toBeInTheDocument();
    expect(screen.getByText("Segment End: 2000ms")).toBeInTheDocument();
  });

  it("sets the time directly when there is no timeline", async () => {
    const project = basic([
      marker({ type: "temporal", endTime: 100, time: 100 }),
    ]);
    mount(project);
    await setTime(1234);
    expect(project.lines[0].eventMarkers![0]).toMatchObject({
      time: 1234,
      endTime: 1234,
    });
  });

  it("stays on its path and updates its position when the time is still inside it", async () => {
    const project = basic([
      marker({ type: "temporal", endTime: 500, time: 500 }),
    ]);
    mount(project, timeline());
    await setTime(1500);
    expect(project.lines[0].eventMarkers![0]).toMatchObject({
      endTime: 1500,
      time: 1500,
      position: 0.75,
    });
  });

  it("moves to the path the new time falls in", async () => {
    const project = basic([
      marker({ type: "temporal", endTime: 500, time: 500 }),
    ]);
    mount(project, timeline());
    await setTime(4000);
    expect(project.lines[0].eventMarkers).toEqual([]);
    expect(project.lines[1].eventMarkers![0]).toMatchObject({
      id: "m1",
      endTime: 4000,
      position: 0.5,
      lineIndex: 1,
    });
  });

  it("prefers the nearest path when the time lands in a wait", async () => {
    const project = basic([
      marker({ type: "temporal", endTime: 500, time: 500 }),
    ]);
    mount(project, timeline());
    await setTime(2900); // inside the wait, closer to the start of path b (3 s)
    expect(project.lines[1].eventMarkers![0]).toMatchObject({
      id: "m1",
      position: 0,
    });
  });

  it("keeps a time beyond the end on the last path, at its end", async () => {
    const project = basic([
      marker({ type: "temporal", endTime: 500, time: 500 }),
    ]);
    mount(project, timeline());
    await setTime(9000);
    expect(project.lines[1].eventMarkers![0]).toMatchObject({ position: 1 });
  });

  it("uses the motion profile to turn a time into a position", async () => {
    const tp = timeline();
    // Path a covers its first half in 1.5 of its 2 seconds.
    (tp.timeline[0] as any).motionProfile = [0, 1.5, 2];
    const project = basic([
      marker({ type: "temporal", endTime: 100, time: 100 }),
    ]);
    mount(project, tp);
    await setTime(1500);
    expect(project.lines[0].eventMarkers![0].position).toBeCloseTo(0.5);
  });

  it("puts a marker on a wait when there are no paths in the timeline", async () => {
    const tp: TimePrediction = {
      totalTime: 1,
      segmentTimes: [],
      totalDistance: 0,
      timeline: [
        { type: "wait", startTime: 0, endTime: 1, duration: 1, waitId: "w1" },
      ],
    };
    const project: Project = {
      lines: [
        line("a", 100, [marker({ type: "temporal", endTime: 0, time: 0 })]),
      ],
      sequence: [
        { kind: "path", lineId: "a" },
        { kind: "wait", id: "w1", name: "Pause", durationMs: 1000 },
      ],
    };
    mount(project, tp);
    await setTime(500);
    const wait = project.sequence[1] as any;
    expect(project.lines[0].eventMarkers).toEqual([]);
    expect(wait.eventMarkers[0]).toMatchObject({
      id: "m1",
      waitId: "w1",
      position: 0.5,
    });
  });

  it("ignores a timeline with no duration", async () => {
    const project = basic([
      marker({ type: "temporal", endTime: 100, time: 100 }),
    ]);
    mount(project, {
      totalTime: 0,
      segmentTimes: [],
      totalDistance: 0,
      timeline: [],
    });
    await setTime(700);
    expect(project.lines[0].eventMarkers![0]).toMatchObject({
      time: 700,
      endTime: 700,
    });
  });
});

describe("pose markers", () => {
  const poseMarker = (over: Record<string, unknown> = {}) =>
    marker({ type: "pose", poseX: 10, poseY: 20, ...over });
  const fields = () => screen.getAllByRole("spinbutton") as HTMLInputElement[];
  // Order: X, Y, then the parametric guess.

  it("edits the point's X and Y, rounded to hundredths", async () => {
    const project = basic([poseMarker()]);
    mount(project);
    const [x, y] = fields();
    expect(x.value).toBe("10.00");
    expect(y.value).toBe("20.00");
    await fireEvent.change(x, { target: { value: "33.3333" } });
    await fireEvent.change(y, { target: { value: "44.4449" } });
    expect(project.lines[0].eventMarkers![0]).toMatchObject({
      poseX: 33.33,
      poseY: 44.44,
    });
  });

  it("shows a suggested line position, and clears it again", async () => {
    const project = basic([poseMarker({ poseX: 50, poseY: 0 })]);
    mount(project);
    const guess = fields()[2];
    // Halfway along path a, which runs from (0,0) to (100,0).
    expect(guess).toHaveAttribute("placeholder", "0.500");
    expect(guess.value).toBe("");

    await fireEvent.input(guess, { target: { value: "0.25" } });
    expect(project.lines[0].eventMarkers![0].poseGuess).toBeCloseTo(0.25);
    await fireEvent.input(screen.getAllByRole("spinbutton")[2], {
      target: { value: "" },
    });
    expect(project.lines[0].eventMarkers![0].poseGuess).toBeUndefined();
  });

  it("moves to another path, and to the matching point on it, when the position passes a whole number", async () => {
    const project = basic([poseMarker({ poseX: 50, poseY: 0 })]);
    mount(project);
    // 1.5 is halfway along the second path: (100,0) to (200,0).
    await fireEvent.input(fields()[2], { target: { value: "1.5" } });
    expect(project.lines[0].eventMarkers).toEqual([]);
    expect(project.lines[1].eventMarkers![0]).toMatchObject({
      id: "m1",
      poseGuess: 0.5,
      poseX: 150,
      poseY: 0,
    });
  });

  it("never goes past the last path", async () => {
    const project = basic([poseMarker({ poseX: 50, poseY: 0 })]);
    mount(project);
    await fireEvent.input(fields()[2], { target: { value: "99" } });
    // The last path is the furthest it can go: its start, as 99 has no fraction.
    expect(project.lines[1].eventMarkers![0]).toMatchObject({
      poseX: 100,
      poseGuess: 0,
    });
  });
});
