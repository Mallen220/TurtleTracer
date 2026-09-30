// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { render, fireEvent, screen, within } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import PlaybackControls from "../lib/components/PlaybackControls.svelte";

describe("PlaybackControls", () => {
  const minimalSettings = {} as any;

  const createProps = (overrides = {}) => ({
    playing: false,
    play: vi.fn(),
    pause: vi.fn(),
    percent: 0,
    handleSeek: vi.fn(),
    loopAnimation: false,
    timelineItems: [],
    playbackSpeed: 1,
    setPlaybackSpeed: vi.fn(),
    settings: minimalSettings,
    ...overrides,
  });

  it("renders play button when paused", async () => {
    const play = vi.fn();
    render(PlaybackControls, {
      props: createProps({ play }),
    });

    const btn = screen.getByLabelText("Play animation");
    expect(btn).toBeInTheDocument();

    await fireEvent.click(btn);
    expect(play).toHaveBeenCalled();
  });

  it("renders pause button when playing", async () => {
    const pause = vi.fn();
    render(PlaybackControls, {
      props: createProps({ playing: true, pause }),
    });

    const btn = screen.getByLabelText("Pause animation");
    expect(btn).toBeInTheDocument();

    await fireEvent.click(btn);
    expect(pause).toHaveBeenCalled();
  });

  it("toggles loop animation", async () => {
    render(PlaybackControls, {
      props: createProps(),
    });

    const loopBtn = screen.getByLabelText("Loop animation");
    expect(loopBtn).toBeInTheDocument();
    expect(loopBtn).toHaveAttribute("aria-pressed", "false");

    await fireEvent.click(loopBtn);

    expect(loopBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("changes playback speed", async () => {
    const setPlaybackSpeed = vi.fn();
    render(PlaybackControls, {
      props: createProps({ setPlaybackSpeed }),
    });

    const speedBtn = screen.getByLabelText(/Playback speed options/);
    await fireEvent.click(speedBtn);

    const speedOption = screen.getByText("2.00x");
    await fireEvent.click(speedOption);

    expect(setPlaybackSpeed).toHaveBeenCalledWith(2, true);
  });

  it("seeks when slider changes", async () => {
    const handleSeek = vi.fn();
    render(PlaybackControls, {
      props: createProps({ handleSeek }),
    });

    const slider = screen.getByLabelText("Animation progress");
    await fireEvent.input(slider, { target: { value: "50" } });

    expect(handleSeek).toHaveBeenCalledWith(50);
  });

  it("renders timeline items", () => {
    const timelineItems = [
      { type: "marker", percent: 25, name: "Marker 1", color: "red" },
      { type: "dot", percent: 75, name: "Dot 1", color: "blue" },
    ];

    render(PlaybackControls, {
      props: createProps({ timelineItems: timelineItems as any[] }),
    });

    expect(screen.getByLabelText("Marker 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Dot 1")).toBeInTheDocument();
  });
});

// --- Seeking, editing the time, dragging markers and the loop range ---

import { get } from "svelte/store";
import { afterEach, beforeEach } from "vitest";
import {
  loopRangeActiveStore,
  loopRangeStore,
  hoverPercentStore,
} from "../lib/projectStore";

// fireEvent wants a Window; the lint rules want globalThis.
const win = globalThis as unknown as Window;

describe("PlaybackControls interaction", () => {
  const createProps = (overrides = {}) => ({
    playing: false,
    play: vi.fn(),
    pause: vi.fn(),
    percent: 40,
    handleSeek: vi.fn(),
    loopAnimation: false,
    timelineItems: [] as any[],
    playbackSpeed: 1,
    setPlaybackSpeed: vi.fn(),
    totalSeconds: 10,
    settings: {} as any,
    ...overrides,
  });

  beforeEach(() => {
    loopRangeActiveStore.set(false);
    loopRangeStore.set([0, 100]);
    hoverPercentStore.set(null);
  });
  afterEach(() => {
    // Let any window listeners added by a drag go away.
    globalThis.dispatchEvent(new MouseEvent("mouseup"));
  });

  const slider = () =>
    screen.getByLabelText("Animation progress") as HTMLInputElement;
  const dragTo = async (value: number) =>
    fireEvent.input(slider(), { target: { value: String(value) } });

  describe("the slider", () => {
    it("snaps to the ends, markers and the edges of waits when close", async () => {
      const props = createProps({
        timelineItems: [
          { type: "marker", percent: 50, name: "Arm", id: "m1" },
          { type: "wait", percent: 20, durationPercent: 10, name: "Wait" },
        ],
      });
      render(PlaybackControls, { props });

      await dragTo(49.4);
      expect(props.handleSeek).toHaveBeenLastCalledWith(50);
      await dragTo(30.8);
      expect(props.handleSeek).toHaveBeenLastCalledWith(30);
      await dragTo(0.6);
      expect(props.handleSeek).toHaveBeenLastCalledWith(0);
      await dragTo(99.5);
      expect(props.handleSeek).toHaveBeenLastCalledWith(100);
      await dragTo(45);
      expect(props.handleSeek).toHaveBeenLastCalledWith(45);
    });

    it("doesn't snap while Shift is held", async () => {
      const props = createProps({
        timelineItems: [{ type: "marker", percent: 50, name: "Arm", id: "m1" }],
      });
      render(PlaybackControls, { props });
      await fireEvent.keyDown(win, { key: "Shift" });
      await dragTo(49.4);
      expect(props.handleSeek).toHaveBeenLastCalledWith(49.4);
      await fireEvent.keyUp(win, { key: "Shift" });
      await dragTo(49.4);
      expect(props.handleSeek).toHaveBeenLastCalledWith(50);
    });

    it("moves by 5% with the arrow keys and jumps with Home and End", async () => {
      const props = createProps({ percent: 40 });
      render(PlaybackControls, { props });
      await fireEvent.keyDown(slider(), { key: "ArrowRight" });
      expect(props.handleSeek).toHaveBeenLastCalledWith(45);
      await fireEvent.keyDown(slider(), { key: "ArrowLeft" });
      expect(props.handleSeek).toHaveBeenLastCalledWith(35);
      await fireEvent.keyDown(slider(), { key: "Home" });
      expect(props.handleSeek).toHaveBeenLastCalledWith(0);
      await fireEvent.keyDown(slider(), { key: "End" });
      expect(props.handleSeek).toHaveBeenLastCalledWith(100);
      props.handleSeek.mockClear();
      await fireEvent.keyDown(slider(), { key: "a" });
      expect(props.handleSeek).not.toHaveBeenCalled();
    });

    it("stays within 0-100 at either end", async () => {
      const low = createProps({ percent: 2 });
      const { unmount } = render(PlaybackControls, { props: low });
      await fireEvent.keyDown(slider(), { key: "ArrowLeft" });
      expect(low.handleSeek).toHaveBeenLastCalledWith(0);
      unmount();

      const high = createProps({ percent: 98 });
      render(PlaybackControls, { props: high });
      await fireEvent.keyDown(slider(), { key: "ArrowRight" });
      expect(high.handleSeek).toHaveBeenLastCalledWith(100);
    });

    it("shows the time under the pointer and shares the position, until it leaves", async () => {
      render(PlaybackControls, { props: createProps({ totalSeconds: 20 }) });
      const input = slider();
      input.getBoundingClientRect = () =>
        ({
          left: 100,
          width: 200,
          top: 0,
          height: 10,
          right: 300,
          bottom: 10,
        }) as DOMRect;

      await fireEvent.mouseMove(input, { clientX: 150 });
      expect(get(hoverPercentStore)).toBe(25);
      expect(screen.getByText("5.000s")).toBeInTheDocument();

      // Past either end it stays on the track.
      await fireEvent.mouseMove(input, { clientX: 900 });
      expect(get(hoverPercentStore)).toBe(100);

      await fireEvent.mouseLeave(input);
      expect(get(hoverPercentStore)).toBeNull();
    });
  });

  describe("transport buttons", () => {
    it("skips to the start or end, and steps by half a percent", async () => {
      const props = createProps({ percent: 40 });
      render(PlaybackControls, { props });
      await fireEvent.click(screen.getByLabelText("Skip to Start"));
      expect(props.handleSeek).toHaveBeenLastCalledWith(0);
      await fireEvent.click(screen.getByLabelText("Skip to End"));
      expect(props.handleSeek).toHaveBeenLastCalledWith(100);
      await fireEvent.click(screen.getByLabelText("Step Forward"));
      expect(props.handleSeek).toHaveBeenLastCalledWith(40.5);
      await fireEvent.click(screen.getByLabelText("Step Back"));
      expect(props.handleSeek).toHaveBeenLastCalledWith(39.5);
    });

    it("won't step past either end", async () => {
      const props = createProps({ percent: 0.2 });
      render(PlaybackControls, { props });
      await fireEvent.click(screen.getByLabelText("Step Back"));
      expect(props.handleSeek).toHaveBeenLastCalledWith(0);
    });

    it("splits the path at the current position", async () => {
      const splitPath = vi.fn();
      render(PlaybackControls, { props: createProps({ splitPath }) });
      await fireEvent.click(screen.getByLabelText("Split Path Here"));
      expect(splitPath).toHaveBeenCalledTimes(1);
    });
  });

  describe("the time box", () => {
    const timeBox = () =>
      screen.getByLabelText("Current time") as HTMLInputElement;
    const edit = async (text: string) => {
      await fireEvent.focus(timeBox());
      await fireEvent.input(timeBox(), { target: { value: text } });
    };

    it("shows the current time", () => {
      render(PlaybackControls, {
        props: createProps({ percent: 50, totalSeconds: 12 }),
      });
      expect(timeBox().value).toBe("6.000s");
    });

    it.each([
      ["5", 50],
      ["2.5s", 25],
      ["0:07", 70],
      ["1:30", 100], // past the end: clamped
    ])("seeks when '%s' is entered", async (text, expected) => {
      const props = createProps({ totalSeconds: 10 });
      render(PlaybackControls, { props });
      await edit(text);
      await fireEvent.blur(timeBox());
      expect(props.handleSeek).toHaveBeenLastCalledWith(expected);
    });

    it("ignores text that isn't a time", async () => {
      const props = createProps();
      render(PlaybackControls, { props });
      await edit("soon");
      await fireEvent.blur(timeBox());
      expect(props.handleSeek).not.toHaveBeenCalled();
    });

    it("does nothing when there is no path to play", async () => {
      const props = createProps({ totalSeconds: 0 });
      render(PlaybackControls, { props });
      await edit("3");
      await fireEvent.blur(timeBox());
      expect(props.handleSeek).not.toHaveBeenCalled();
    });

    it("commits on Enter", async () => {
      const props = createProps({ totalSeconds: 10 });
      render(PlaybackControls, { props });
      await edit("8");
      timeBox().focus();
      await fireEvent.keyDown(timeBox(), { key: "Enter" });
      expect(props.handleSeek).toHaveBeenLastCalledWith(80);
    });

    it("discards the edit on Escape", async () => {
      const props = createProps({ totalSeconds: 10 });
      render(PlaybackControls, { props });
      await edit("8");
      timeBox().focus();
      await fireEvent.keyDown(timeBox(), { key: "Escape" });
      expect(props.handleSeek).not.toHaveBeenCalled();
    });
  });

  describe("event markers on the timeline", () => {
    const items = () => [
      { type: "marker", percent: 25, name: "Claw", id: "m1", color: "red" },
      { type: "marker", percent: 60, name: "Loose", color: "blue" }, // no id: can't be edited
      { type: "dot", percent: 80, name: "Corner", color: "green" },
    ];
    const timeline = () =>
      document.querySelector<HTMLElement>("#playback-controls > div")!;
    const stubTimelineRect = () => {
      timeline().getBoundingClientRect = () =>
        ({
          left: 0,
          width: 200,
          top: 0,
          height: 40,
          right: 200,
          bottom: 40,
        }) as DOMRect;
    };

    it("seeks to a marker or dot when it is clicked or activated with the keyboard", async () => {
      const props = createProps({ timelineItems: items() });
      render(PlaybackControls, { props });
      await fireEvent.click(screen.getByLabelText("Claw"));
      expect(props.handleSeek).toHaveBeenLastCalledWith(25);
      await fireEvent.keyDown(screen.getByLabelText("Corner"), {
        key: "Enter",
      });
      expect(props.handleSeek).toHaveBeenLastCalledWith(80);
      await fireEvent.keyDown(screen.getByLabelText("Loose"), { key: " " });
      expect(props.handleSeek).toHaveBeenLastCalledWith(60);
      await fireEvent.click(screen.getByLabelText("Corner"));
      expect(props.handleSeek).toHaveBeenLastCalledWith(80);
    });

    it("drags a marker and reports where it was dropped", async () => {
      const props = createProps({ timelineItems: items(), playing: true });
      const onmarkerChange = vi.fn();
      render(PlaybackControls, { props: { ...props, onmarkerChange } });
      stubTimelineRect();

      await fireEvent.mouseDown(screen.getByLabelText("Claw"));
      expect(props.pause).toHaveBeenCalled(); // no playback while dragging
      await fireEvent.mouseMove(win, { clientX: 100 });
      await fireEvent.mouseUp(win);

      expect(onmarkerChange).toHaveBeenCalledWith({ id: "m1", percent: 50 });
    });

    it("keeps a dragged marker inside the timeline", async () => {
      const props = createProps({ timelineItems: items() });
      const onmarkerChange = vi.fn();
      render(PlaybackControls, { props: { ...props, onmarkerChange } });
      stubTimelineRect();
      await fireEvent.mouseDown(screen.getByLabelText("Claw"));
      await fireEvent.mouseMove(win, { clientX: -50 });
      await fireEvent.mouseUp(win);
      expect(onmarkerChange).toHaveBeenLastCalledWith({ id: "m1", percent: 0 });

      await fireEvent.mouseDown(screen.getByLabelText("Claw"));
      await fireEvent.mouseMove(win, { clientX: 999 });
      await fireEvent.mouseUp(win);
      expect(onmarkerChange).toHaveBeenLastCalledWith({
        id: "m1",
        percent: 100,
      });
    });

    it("doesn't treat the click that ends a drag as a seek", async () => {
      const props = createProps({ timelineItems: items() });
      render(PlaybackControls, {
        props: { ...props, onmarkerChange: vi.fn() },
      });
      stubTimelineRect();
      const marker = screen.getByLabelText("Claw");
      await fireEvent.mouseDown(marker);
      await fireEvent.mouseMove(win, { clientX: 100 });
      await fireEvent.mouseUp(win);
      await fireEvent.click(marker);
      expect(props.handleSeek).not.toHaveBeenCalled();
    });

    it("can't drag a dot or a marker without an id", async () => {
      const props = createProps({ timelineItems: items() });
      const onmarkerChange = vi.fn();
      render(PlaybackControls, { props: { ...props, onmarkerChange } });
      stubTimelineRect();
      await fireEvent.mouseDown(screen.getByLabelText("Loose"));
      await fireEvent.mouseMove(win, { clientX: 100 });
      await fireEvent.mouseUp(win);
      expect(onmarkerChange).not.toHaveBeenCalled();
    });

    it("offers to delete a marker from its context menu", async () => {
      const props = createProps({ timelineItems: items() });
      const onmarkerAction = vi.fn();
      render(PlaybackControls, { props: { ...props, onmarkerAction } });

      await fireEvent.contextMenu(screen.getByLabelText("Claw"), {
        clientX: 10,
        clientY: 10,
      });
      await fireEvent.click(await screen.findByText("Delete Marker"));
      expect(onmarkerAction).toHaveBeenCalledWith({
        id: "m1",
        action: "delete",
      });
    });

    it("has no context menu for a marker without an id", async () => {
      render(PlaybackControls, {
        props: createProps({ timelineItems: items() }),
      });
      await fireEvent.contextMenu(screen.getByLabelText("Loose"));
      expect(screen.queryByText("Delete Marker")).toBeNull();
    });
  });

  describe("looping a section", () => {
    const toggle = () => screen.getByLabelText("Toggle Section Looping");

    it("starts the section at the current position and ends it at the end", async () => {
      render(PlaybackControls, { props: createProps({ percent: 37.8 }) });
      await fireEvent.click(toggle());
      expect(get(loopRangeActiveStore)).toBe(true);
      expect(get(loopRangeStore)).toEqual([37, 100]);
      expect(screen.getByLabelText("Loop range start")).toBeInTheDocument();
      expect(screen.getByLabelText("Loop range end")).toBeInTheDocument();
    });

    it("hides the handles and leaves the range alone when switched off", async () => {
      render(PlaybackControls, { props: createProps({ percent: 10 }) });
      await fireEvent.click(toggle());
      loopRangeStore.set([20, 60]);
      await fireEvent.click(toggle());
      expect(get(loopRangeActiveStore)).toBe(false);
      expect(screen.queryByLabelText("Loop range start")).toBeNull();
      expect(get(loopRangeStore)).toEqual([20, 60]);
    });

    const setUp = async (playing = false) => {
      const props = createProps({ percent: 10, playing });
      render(PlaybackControls, { props });
      await fireEvent.click(toggle());
      loopRangeStore.set([20, 60]);
      document.querySelector<HTMLElement>(
        "#playback-controls > div",
      )!.getBoundingClientRect = () =>
        ({
          left: 0,
          width: 200,
          top: 0,
          height: 40,
          right: 200,
          bottom: 40,
        }) as DOMRect;
      return props;
    };

    it("drags the start handle, never past the end handle", async () => {
      await setUp();
      await fireEvent.mouseDown(screen.getByLabelText("Loop range start"));
      await fireEvent.mouseMove(win, { clientX: 40 }); // 20% -> 20%
      expect(get(loopRangeStore)[0]).toBeCloseTo(20);
      await fireEvent.mouseMove(win, { clientX: 100 });
      expect(get(loopRangeStore)[0]).toBeCloseTo(50);
      await fireEvent.mouseMove(win, { clientX: 190 }); // beyond the end (60%)
      expect(get(loopRangeStore)[0]).toBeCloseTo(59.9);
      await fireEvent.mouseUp(win);
    });

    it("drags the end handle, never before the start handle, and within the timeline", async () => {
      await setUp();
      await fireEvent.mouseDown(screen.getByLabelText("Loop range end"));
      await fireEvent.mouseMove(win, { clientX: 10 }); // 5%, before the start (20%)
      expect(get(loopRangeStore)[1]).toBeCloseTo(20.1);
      await fireEvent.mouseMove(win, { clientX: 500 });
      expect(get(loopRangeStore)[1]).toBe(100);
      await fireEvent.mouseUp(win);
    });

    it("pauses while a handle is dragged, and resumes afterwards if it was playing", async () => {
      const props = await setUp(true);
      await fireEvent.mouseDown(screen.getByLabelText("Loop range start"));
      expect(props.pause).toHaveBeenCalled();
      await fireEvent.mouseUp(win);
      expect(props.play).toHaveBeenCalled();
    });

    it("doesn't resume playback after dragging when it wasn't playing", async () => {
      const props = await setUp(false);
      await fireEvent.mouseDown(screen.getByLabelText("Loop range end"));
      await fireEvent.mouseUp(win);
      expect(props.play).not.toHaveBeenCalled();
    });

    it("stops following the mouse once the handle is released", async () => {
      await setUp();
      await fireEvent.mouseDown(screen.getByLabelText("Loop range start"));
      await fireEvent.mouseUp(win);
      const before = get(loopRangeStore);
      await fireEvent.mouseMove(win, { clientX: 100 });
      expect(get(loopRangeStore)).toEqual(before);
    });
  });

  describe("the speed menu", () => {
    it("marks the current speed and closes on Escape or an outside click", async () => {
      render(PlaybackControls, { props: createProps({ playbackSpeed: 1.5 }) });
      const open = screen.getByLabelText(/Playback speed options/);
      expect(open).toHaveAttribute("aria-expanded", "false");

      await fireEvent.click(open);
      expect(open).toHaveAttribute("aria-expanded", "true");
      const menu = within(
        screen.getByRole("menu", { name: "Playback speeds" }),
      );
      expect(
        menu.getByText("1.50x").closest("button")!.querySelector("svg"),
      ).not.toBeNull();
      expect(
        menu.getByText("2.00x").closest("button")!.querySelector("svg"),
      ).toBeNull();

      await fireEvent.keyDown(win, { key: "Escape" });
      expect(open).toHaveAttribute("aria-expanded", "false");

      await fireEvent.click(open);
      expect(open).toHaveAttribute("aria-expanded", "true");
      await fireEvent.click(document.body);
      expect(open).toHaveAttribute("aria-expanded", "false");
    });

    it("picks a speed from the keyboard and closes", async () => {
      const props = createProps();
      render(PlaybackControls, { props });
      const open = screen.getByLabelText(/Playback speed options/);
      await fireEvent.click(open);
      const menu = within(screen.getByRole("menu"));
      await fireEvent.keyDown(menu.getByText("0.50x").closest("button")!, {
        key: "Enter",
      });
      expect(props.setPlaybackSpeed).toHaveBeenCalledWith(0.5, true);
      expect(open).toHaveAttribute("aria-expanded", "false");
    });

    it("treats a missing speed as normal speed", () => {
      render(PlaybackControls, {
        props: createProps({ playbackSpeed: undefined }),
      });
      expect(screen.getByLabelText(/current speed 1.00x/)).toBeInTheDocument();
    });
  });
});
